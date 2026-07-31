/**
 * PostFX — the post-processing stack for Tony Stonks Pro Trader.
 *
 * Chain (quality dependent):
 *
 *   RenderPass  ->  GTAOPass (SSAOPass fallback)  ->  UnrealBloomPass
 *               ->  GradePass (single combined fullscreen GLSL pass)
 *               ->  OutputPass  ->  SMAAPass
 *
 * The GradePass does, in ONE pass:
 *   - speed-driven radial blur + chromatic aberration (uv-space, radius weighted)
 *   - pulse zoom punch + white flash
 *   - exposure
 *   - refined ACES filmic tone curve (full RRT+ODT fit with the ACES colour
 *     matrices, not the cheap Narkowicz approximation — the matrices are what
 *     keep saturated orange grind sparks from clipping to white)
 *   - lift / gamma / gain colour grading, done in the sRGB working space
 *   - black-point re-anchor
 *   - a real contrast S-curve around a sub-0.5 pivot (paired power curves, C1 at
 *     the pivot, bijective on [0,1] — so it has a toe and a shoulder and can be
 *     pushed hard without clipping either end)
 *   - warm-highlight / cool-shadow split tone
 *   - vibrance (chroma-humped saturation, not a flat multiply)
 *   - a soft highlight shoulder so nothing clips flat per-channel
 *   - vignette
 *   - film grain (shadow weighted) + dither
 *
 * ------------------------------------------------------------------
 * INTEGRATION NOTE — TONE MAPPING OWNERSHIP
 * ------------------------------------------------------------------
 * While PostFX is enabled it takes ownership of tone mapping:
 * `renderer.toneMapping` is forced to `THREE.NoToneMapping` so that OutputPass
 * only performs the sRGB transfer, and the ACES curve is applied inside the
 * grade shader on the HDR buffer. `renderer.toneMappingExposure` is still
 * honoured — PostFX reads it every frame and feeds it into the grade, so
 * Game.ts can keep setting exposure normally. On `setQuality('off')` or
 * `dispose()` the original tone mapping is restored.
 * Side effect: `tools/shoot.mjs --json` will report `toneMapping: 0` whenever
 * PostFX is active. That is expected, not a regression.
 *
 * Grade tuned against refs/scene-office2.png and refs/scene-office3.png, whose
 * measured signature is: lifted blacks (p5 luma ~20/255), median luma ~0.37,
 * cool blue-grey shadows (mean shadow R/B ~0.62-0.75) against warm amber
 * highlights (mean highlight R/B ~1.42-1.46), mean HSV saturation ~0.29.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';

export type PostQuality = 'off' | 'low' | 'medium' | 'high' | 'ultra';

/** Optional live-tuning knobs. Additive to the agreed contract; all optional. */
export interface GradeOptions {
  saturation?: number;
  contrast?: number;
  /** Black point subtracted (in the sRGB working space) before the S-curve. */
  black?: number;
  vignette?: number;
  grain?: number;
  split?: number;
  /** Knee (0..1) above which highlights compress toward white instead of clipping. */
  shoulder?: number;
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
  aoIntensity?: number;
  chromaticBase?: number;
}

/** GTAO debug views. 'default' is the shipping composite. */
export type AODebug = 'default' | 'ao' | 'denoise' | 'off';

interface TierSpec {
  bloom: boolean;
  smaa: boolean;
  ao: false | 'half' | 'full';
  bloomResScale: number;
  aoSamples: number;
  pdSamples: number;
}

const TIERS: Record<Exclude<PostQuality, 'off'>, TierSpec> = {
  low: { bloom: true, smaa: false, ao: false, bloomResScale: 0.5, aoSamples: 8, pdSamples: 8 },
  // 'medium' now gets half-res AO. A frame with NO contact darkening at all does not
  // read as a cheaper frame, it reads as a broken one — everything hovers.
  medium: { bloom: true, smaa: true, ao: 'half', bloomResScale: 0.5, aoSamples: 8, pdSamples: 8 },
  // 'high' is the shipping default and is now full-res. At half res the GTAO buffer is
  // mush on exactly the geometry that needs it most: the 25 mm cubicle panel edges, the
  // desk/carpet junction, the chair's caster cluster. Sample count is trimmed to pay
  // for the resolution, which is the right trade — AO wants precision, not samples.
  high: { bloom: true, smaa: true, ao: 'full', bloomResScale: 0.75, aoSamples: 10, pdSamples: 12 },
  ultra: { bloom: true, smaa: true, ao: 'full', bloomResScale: 1.0, aoSamples: 16, pdSamples: 16 },
};

// ---------------------------------------------------------------------------
// Grade shader
// ---------------------------------------------------------------------------

const GRADE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const GRADE_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform vec2  uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uSpeed;        // 0..1 radial blur / CA driver
uniform float uPulse;        // 0..1 impact flash, decays over ~0.3s
uniform float uChromaBase;   // baseline chromatic aberration
uniform float uVignette;
uniform float uGrain;
uniform float uSaturation;
uniform float uContrast;
uniform float uPivot;
uniform float uBlack;        // black point subtracted before the S-curve
uniform vec3  uLift;
uniform vec3  uGammaInv;
uniform vec3  uGain;
uniform vec3  uShadowTint;
uniform vec3  uHighlightTint;
uniform float uSplit;
uniform float uShoulder;     // knee above which highlights compress toward 1 instead of clipping

varying vec2 vUv;

const vec2 CENTER = vec2( 0.5 );
const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );
const int  RADIAL_TAPS = 6;

// --- ACES RRT+ODT fit (Stephen Hill) --------------------------------------
const mat3 ACES_IN = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777
);
const mat3 ACES_OUT = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602
);

vec3 rrtOdtFit( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}

// three's own ACESFilmicToneMapping pre-scales by 1/0.6 before the fit. The
// whole game is lit against that, so we match it exactly: uExposure keeps
// the same meaning it has as renderer.toneMappingExposure today.
const float ACES_EXPOSURE_SCALE = 1.0 / 0.6;

vec3 tonemapACES( vec3 c ) {
  c = ACES_IN * c;
  c = rrtOdtFit( c );
  c = ACES_OUT * c;
  return clamp( c, 0.0, 1.0 );
}

// --- contrast ---------------------------------------------------------------
// A true S-curve, not the linear (x - pivot) * k + pivot. That form has to be
// clamped at both ends, so every value the expansion pushes past 1.0 lands on
// exactly 1.0 and every value it pushes below 0 lands on exactly 0: crank it far
// enough to open up the mid band and you buy flat clipped highlights and dead
// black holes. This is a matched pair of power curves that meet C1-continuously
// at the pivot, maps [0,1] onto [0,1] bijectively, has slope k at the pivot and
// rolls smoothly into a toe and a shoulder. It can be pushed much harder.
vec3 sCurve( vec3 x, float pivot, float k ) {
  vec3 c = clamp( x, 0.0, 1.0 );
  vec3 lo = pivot * pow( c / pivot, vec3( k ) );
  vec3 hi = 1.0 - ( 1.0 - pivot ) * pow( ( 1.0 - c ) / ( 1.0 - pivot ), vec3( k ) );
  return mix( lo, hi, step( vec3( pivot ), c ) );
}

// --- display-linear <-> sRGB working space ----------------------------------
// NOT pow(x, 1/2.2) / pow(x, 2.2). The sRGB transfer has a LINEAR TOE below
// 0.0031308 with slope 12.92, and pow(2.2) has slope 0 at the origin, so the two
// diverge by nearly an order of magnitude exactly where this grade does its most
// delicate work. Concretely: the grade lifts the floor of the frame to 0.026 in
// its working space, then the old pow(col, 2.2) handed OutputPass 1.06e-4
// linear, which the real sRGB OETF encodes as 0.0014 — 0.35/255, not the 6.6/255
// the lift asked for. That is the entire reason the build kept measuring p1 = 1.7
// against the references' 9-10 no matter how hard the lift was pushed: the blacks
// were not being crushed by the grade, they were being crushed by the round trip
// out of it. Using the actual transfer function makes the round trip exact.
vec3 linearToSrgb( vec3 c ) {
  c = clamp( c, 0.0, 1.0 );
  return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), c ) );
}

vec3 srgbToLinear( vec3 c ) {
  c = clamp( c, 0.0, 1.0 );
  return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( vec3( 0.04045 ), c ) );
}

float hash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}

// Radial blur + chromatic aberration, both driven off distance from centre.
vec3 sampleScene( vec2 uv, float jitter ) {
  vec2 dir = uv - CENTER;
  float rad = length( dir );
  float edge = smoothstep( 0.08, 0.78, rad );

  // The square term was the bug: at a realistic cruise (uSpeed ~0.4) it produced a
  // 0.015 px displacement, i.e. nothing. A THPS still has to sell velocity on its own,
  // so the curve is now slightly SUPERLINEAR-in-reverse — most of the effect arrives
  // early, then saturates.
  float blur = pow( uSpeed, 1.25 ) * 0.16 * edge;
  float ca = ( uChromaBase + uSpeed * 0.020 ) * edge;

  if ( blur < 0.0009 ) {
    if ( ca < 0.00006 ) return texture2D( tDiffuse, uv ).rgb;
    vec2 o = dir * ca;
    return vec3(
      texture2D( tDiffuse, uv + o ).r,
      texture2D( tDiffuse, uv ).g,
      texture2D( tDiffuse, uv - o ).b
    );
  }

  vec3 acc = vec3( 0.0 );
  float wsum = 0.0;
  for ( int i = 0; i < RADIAL_TAPS; i++ ) {
    float t = ( float( i ) + jitter ) / float( RADIAL_TAPS );
    float w = 1.0 - 0.55 * t;
    vec2 base = uv - dir * ( blur * t );
    vec2 o = dir * ( ca * ( 1.0 + t ) );
    acc.r += texture2D( tDiffuse, base + o ).r * w;
    acc.g += texture2D( tDiffuse, base ).g * w;
    acc.b += texture2D( tDiffuse, base - o ).b * w;
    wsum += w;
  }
  return acc / wsum;
}

void main() {
  float noise = hash21( gl_FragCoord.xy + fract( uTime ) * 137.0 );

  // pulse zoom punch (eased) --------------------------------------------
  float p = uPulse * uPulse;
  vec2 uv = CENTER + ( vUv - CENTER ) * ( 1.0 - 0.048 * p );

  vec3 col = sampleScene( uv, noise );

  // exposure + filmic tone curve ----------------------------------------
  col = tonemapACES( max( col, 0.0 ) * uExposure * ACES_EXPOSURE_SCALE );

  // move to the sRGB working space; grading numbers behave like the
  // sRGB reference frames there.
  col = linearToSrgb( col );

  // gain / gamma ---------------------------------------------------------
  col = col * uGain;
  col = pow( max( col, 0.0 ), uGammaInv );

  // black point ----------------------------------------------------------
  // An interior with a room IBL has no true black of its own; every surface
  // gets some ambient. Re-anchoring the floor of the range here is what lets
  // the S-curve below produce an actual shadow CORE instead of another mid grey.
  col = max( col - uBlack, 0.0 ) / max( 1.0 - uBlack, 1e-3 );

  // contrast around a sub-0.5 pivot (refs sit at a ~0.37 median) ---------
  col = sCurve( col, uPivot, uContrast );

  // lift LAST so the filmic toe survives the contrast S-curve. The refs
  // never reach true black: their 1st-percentile luma is 6-9/255.
  col = uLift + max( col, 0.0 ) * ( 1.0 - uLift );

  // warm highlight / cool shadow split tone ------------------------------
  float l = dot( clamp( col, 0.0, 1.0 ), LUMA );
  vec3 tint = mix( uShadowTint, uHighlightTint, smoothstep( 0.02, 0.72, l ) );
  col *= mix( vec3( 1.0 ), tint, uSplit );

  // saturation, vibrance-weighted ----------------------------------------
  // A flat multiply does the wrong thing at both ends of the chroma range: it
  // amplifies grade noise in the near-neutral greys, and it drives the already
  // heavily-saturated navy cubicle panels into a flat electric blue. This is a
  // proper vibrance hump instead — barely any boost on the neutrals, maximum
  // boost through the middle where the red tie, the orange ramps and the desk
  // wood live, and a rolloff again at the top so the deepest navy holds its shape.
  float g = dot( clamp( col, 0.0, 1.0 ), LUMA );
  vec3 dev = col - vec3( g );
  float chroma = length( dev ) * 1.4142;
  float vib = 1.0 + ( uSaturation - 1.0 ) * (
      0.5
    + 1.0 * smoothstep( 0.02, 0.22, chroma )
    - 0.75 * smoothstep( 0.34, 0.78, chroma )
  );
  col = vec3( g ) + dev * vib;

  // pulse white flash ----------------------------------------------------
  col += p * vec3( 0.22, 0.208, 0.185 );

  // highlight shoulder ---------------------------------------------------
  // Everything above (gain, the S-curve's own shoulder, the warm split tone and
  // the vibrance hump) can push a channel past 1.0, and the final clamp then
  // lands it on exactly 1.0. Per-channel clipping is what turns a lit troffer
  // into a hard white slab with a coloured fringe: the blue channel clips first
  // in a warm highlight, so the fixture goes amber, then cyan-fringed, then flat
  // white over about a fifth of a stop. This is a soft knee instead — identity
  // below uShoulder, C1-continuous there (slope 1), asymptotic to 1.0 above, so
  // the fixture keeps a gradient all the way into its core and the hue holds.
  {
    float k = uShoulder;
    vec3 over = max( col - k, 0.0 );
    col = min( col, vec3( k ) ) + ( 1.0 - k ) * ( over / ( over + ( 1.0 - k ) ) );
  }

  // vignette (aspect corrected, tightens slightly with speed) ------------
  float aspect = uResolution.x / max( uResolution.y, 1.0 );
  vec2 v = ( vUv - CENTER ) * vec2( aspect, 1.0 );
  float r = length( v );
  float vigAmount = uVignette + uSpeed * 0.18;
  float vig = 1.0 - vigAmount * smoothstep( 0.30, 0.95, r );
  col *= vig;

  // grain, weighted into the shadows, + dither to kill sky banding -------
  float gl = dot( clamp( col, 0.0, 1.0 ), LUMA );
  col += ( noise - 0.5 ) * uGrain * ( 1.0 - 0.65 * gl );
  col += ( noise - 0.5 ) * ( 1.0 / 512.0 );

  col = clamp( col, 0.0, 1.0 );

  // back to linear — OutputPass applies the sRGB transfer, so this must be its
  // exact inverse or the lift above never reaches the frame.
  gl_FragColor = vec4( srgbToLinear( col ), 1.0 );
}
`;

// Baseline grade values, tuned against the office reference frames.
const GRADE_DEFAULTS = {
  // Retuned against the reference histograms after integration: the office
  // interior has no sky and no true blacks of its own, so the original lift of
  // 0.022 pushed p1 to 34/255 (refs sit at 6-9) and the whole frame read flat.
  //
  // pivot 0.42 -> 0.375: the contrast S-curve pivots around the office's own median,
  // and at 0.42 the expansion was pushing the AO/shadow band UP instead of down —
  // the ambient-occlusion term was being graded straight back out of the image.
  // Retuned again after measuring the r2 build against the refs. The build was
  // sitting at std(luma) 44.8 with 69% of every frame inside the 60-140 band; the
  // refs are std 53-58 with only 47-53% in that band, 10-13% below 32 and 5-8%
  // above 200. i.e. the grade was not producing a narrow band because it lacked
  // gain, it was producing one because the linear contrast had to stay timid to
  // avoid clipping. With the real S-curve it can be pushed.
  //
  // Palette-correction pass 2. Measured against the refs the r7 build came back
  // R/B 1.46 (refs 1.23-1.32), shadow R/B 0.92 (refs 0.70-0.82) and mean HSV
  // saturation 0.42 (refs 0.28-0.30): a sodium cast, warm shadows, and enough
  // chroma gain on top to make the cast impossible to miss. The warm/cool SPLIT
  // was right; the white point it was splitting around was not. Fixes here are
  // (a) a near-luma-neutral highlight tint, (b) a lower vibrance gain, (c) the
  // highlight shoulder above, and (d) the shadow cooling moved into the fill
  // light in Environment.ts where it belongs.
  saturation: 1.04,
  contrast: 1.55, // slope at the pivot; a true S-curve, so this does not clip
  pivot: 0.35,
  // The office IBL floors the frame at a mid grey; without re-anchoring the black
  // point, p25 lands at 77/255 against the refs' 50-59 and the picture has no
  // shadow core anywhere, only degrees of "lit".
  // 0.034 -> 0.050 with the lift raised to match. The build measured p25 = 78/255
  // against the refs' 52-60 (no shadow core) while its p1 sat at 1.7 against their
  // 9-10 (crushed to nothing in the vignette corners) — i.e. the low end was
  // simultaneously too flat and too dead. Re-anchoring lower and lifting the floor
  // afterwards fixes both ends of that.
  black: 0.038,
  // 0.30 -> 0.24. At 0.30 the corners were the darkest thing in every frame,
  // which is where that p1 = 1.7 came from.
  vignette: 0.24,
  grain: 0.026,
  // The split itself was right. It is now applied around a NEUTRAL white point
  // (see the tints below), so it can come down a little without losing the
  // separation it buys.
  split: 0.66,
  chromaticBase: 0.0005,
  // Refs never reach true black: their 1st-percentile luma is 6-9/255, and the
  // lift is cool because an office's darkest pixels are shadow, not fixture.
  lift: new THREE.Vector3(0.032, 0.034, 0.043),
  gammaInv: new THREE.Vector3(1.0, 1.0, 1.0 / 1.03),
  // Was (1.025, 1.015, 1.0) — a warm multiply on EVERY pixel including the
  // shadows, which is a large part of how the whole frame came out beige. Warmth
  // now lives only in the highlight end of the split tone, where it belongs.
  gain: new THREE.Vector3(1.0, 1.0, 1.0),
  // Both tints are deliberately close to luma-neutral (Rec.709 luma 0.94 and 1.01)
  // so the split rotates hue without moving exposure. The highlight tint was
  // (1.115, 1.0, 0.865) — a 1.29 R/B multiply sitting on top of an already-warm
  // key and an already-warm IBL ceiling. Stacked three deep, that is the sodium
  // cast. 1.11 here still reads amber against a 0.69 R/B shadow.
  shadowTint: new THREE.Vector3(0.825, 0.955, 1.155),
  highlightTint: new THREE.Vector3(1.09, 1.0, 0.90),
  // Knee for the soft highlight shoulder in the grade shader.
  shoulder: 0.9,
};

// threshold 0.85 linear was above everything in the scene EXCEPT the emissive
// troffer quads, so the bloom had exactly one client and it read as a blown-out
// sprite rather than as light in a room. Scene mid-grey lands near 0.14 linear and
// a brightly-lit ceiling/desk near 0.6, so a low threshold lets the lit surfaces
// themselves halate and the fixtures stop being uniquely special.
//
// But UnrealBloomPass has no upper clamp on its input: a troffer whose emissive
// radiance is 8-20 linear contributes strength x 20, so 0.34/0.75 turned the
// nearest fixture into a white starburst eating an eighth of the frame while every
// other light in the room stayed a dot. The refs' fixtures are bright with a tight,
// low-amplitude halo — they do not destroy their surroundings. Threshold up so only
// genuine sources qualify, strength down by ~40% and the radius tightened so the
// halo stays a halo. Paired with the grade's new highlight shoulder, the fixture
// now keeps a visible gradient into its core instead of clipping flat.
const BLOOM_DEFAULTS = { strength: 0.2, radius: 0.6, threshold: 0.72 };

/** Wrap an addon constructor so a broken/absent pass degrades instead of throwing. */
function tryMake<T>(label: string, factory: () => T): T | null {
  try {
    const v = factory();
    if (!v) throw new Error('constructor returned nothing');
    return v;
  } catch (err) {
    console.warn(`[PostFX] pass "${label}" unavailable, skipping:`, err);
    return null;
  }
}

function isCtor(x: unknown): boolean {
  return typeof x === 'function';
}

function safeDispose(p: { dispose?: () => void } | null | undefined): void {
  if (!p) return;
  try {
    p.dispose?.();
  } catch {
    /* pass had no usable dispose; nothing to do */
  }
}

export class PostFX {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private aoPass: GTAOPass | SSAOPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;
  private smaaPass: SMAAPass | null = null;
  private outputPass: OutputPass | null = null;

  private quality: PostQuality;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  private time = 0;
  private speedTarget = 0;
  private speedSmoothed = 0;
  private pulseValue = 0;

  private savedToneMapping: THREE.ToneMapping;
  private lastSeenExposure = 1;
  private aoDebug: AODebug = 'default';

  private opts: Required<Omit<GradeOptions, never>> = {
    saturation: GRADE_DEFAULTS.saturation,
    contrast: GRADE_DEFAULTS.contrast,
    black: GRADE_DEFAULTS.black,
    vignette: GRADE_DEFAULTS.vignette,
    grain: GRADE_DEFAULTS.grain,
    split: GRADE_DEFAULTS.split,
    shoulder: GRADE_DEFAULTS.shoulder,
    bloomStrength: BLOOM_DEFAULTS.strength,
    bloomRadius: BLOOM_DEFAULTS.radius,
    bloomThreshold: BLOOM_DEFAULTS.threshold,
    // The blend is `mix(vec3(1.0), ao, intensity)` multiplied onto the beauty buffer,
    // so intensity > 1 extrapolates past the raw AO. 1.55 was compensating for the
    // thickness bug above by over-driving a buffer that was nearly all white — and it
    // is not a free knob: at 1.55 any pixel with ao < 0.355 blends with a NEGATIVE
    // factor, i.e. a hard black hole with no gradient. With the gate fixed the AO
    // buffer carries real range, so a mild extrapolation is all that's needed to
    // survive the grade's lift.
    aoIntensity: 1.2,
    chromaticBase: GRADE_DEFAULTS.chromaticBase,
  };

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    quality: PostQuality = 'high'
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;

    this.savedToneMapping = renderer.toneMapping;
    this.lastSeenExposure = renderer.toneMappingExposure;

    const size = new THREE.Vector2();
    renderer.getSize(size);
    this.width = Math.max(1, Math.round(size.x));
    this.height = Math.max(1, Math.round(size.y));
    this.pixelRatio = renderer.getPixelRatio() || 1;

    this.build();
  }

  /** True when the composer chain is live (i.e. quality !== 'off' and it built). */
  get enabled(): boolean {
    return this.composer !== null;
  }

  /** Current quality tier. */
  get currentQuality(): PostQuality {
    return this.quality;
  }

  // -------------------------------------------------------------------------
  // Chain construction
  // -------------------------------------------------------------------------

  private build(): void {
    this.teardown();

    if (this.quality === 'off') {
      this.restoreToneMapping();
      return;
    }

    const tier = TIERS[this.quality];

    const composer = tryMake('EffectComposer', () => {
      if (!isCtor(EffectComposer)) throw new Error('EffectComposer missing');
      return new EffectComposer(this.renderer);
    });
    if (!composer) {
      // Total failure — fall back to direct rendering forever.
      this.composer = null;
      this.restoreToneMapping();
      return;
    }
    composer.setPixelRatio(this.pixelRatio);
    composer.setSize(this.width, this.height);
    this.composer = composer;

    // --- RenderPass (mandatory) -------------------------------------------
    this.renderPass = tryMake('RenderPass', () => {
      if (!isCtor(RenderPass)) throw new Error('RenderPass missing');
      return new RenderPass(this.scene, this.camera);
    });
    if (!this.renderPass) {
      this.teardown();
      this.restoreToneMapping();
      return;
    }
    composer.addPass(this.renderPass);

    const bw = Math.max(1, Math.round(this.width * this.pixelRatio));
    const bh = Math.max(1, Math.round(this.height * this.pixelRatio));

    // --- Ambient occlusion -------------------------------------------------
    if (tier.ao) {
      const aoScale = tier.ao === 'half' ? 0.5 : 1.0;
      const aw = Math.max(8, Math.round(bw * aoScale));
      const ah = Math.max(8, Math.round(bh * aoScale));

      const gtao = tryMake('GTAOPass', () => {
        if (!isCtor(GTAOPass)) throw new Error('GTAOPass missing');
        const p = new GTAOPass(this.scene, this.camera, aw, ah);
        p.output = this.aoDebugOutput();
        p.blendIntensity = this.opts.aoIntensity;
        // THE reason AO was running and invisible: `thickness`.
        //
        // In three's GTAO shader `thickness` is not a falloff, it is a rejection
        // gate — `if ( abs( viewDelta.z ) < thickness )` — applied to every horizon
        // sample. A sample whose view-space depth differs from the shading point by
        // more than `thickness` is thrown away as "background", not counted as an
        // occluder. The previous tuning set thickness (0.32 m) to less than HALF the
        // sample radius (0.7 m), which means the majority of every sample ring was
        // discarded before it could occlude anything. The pass produced an AO buffer
        // that was ~1.0 almost everywhere and the compositing then had nothing to
        // multiply in. three's own defaults are radius 0.25 / thickness 1.0 — i.e.
        // thickness FOUR TIMES the radius — and that ratio is the load-bearing part.
        //
        // Radius is sized to this scene: a desk pedestal is ~0.6 m deep and a cubicle
        // bay ~1.5 m, so 0.9 m spans the junction that matters (partition-to-carpet,
        // desk-to-pedestal, chair caster cluster) and thickness now comfortably
        // exceeds it. `scale` is an EXPONENT on the AO term (ao = pow(ao, scale)), so
        // with the gate opened it has to come down from 2.6 or every contact turns
        // into a black hole.
        p.updateGtaoMaterial({
          radius: 0.9,
          distanceExponent: 1.2,
          thickness: 1.6,
          distanceFallOff: 1.0,
          scale: 1.5,
          samples: tier.aoSamples,
          screenSpaceRadius: false,
        });
        p.updatePdMaterial({
          lumaPhi: 10,
          depthPhi: 1.5,
          normalPhi: 4,
          radius: 4,
          radiusExponent: 1,
          rings: 2,
          samples: tier.pdSamples,
        });
        return p;
      });

      if (gtao) {
        this.aoPass = gtao;
      } else {
        this.aoPass = tryMake('SSAOPass', () => {
          if (!isCtor(SSAOPass)) throw new Error('SSAOPass missing');
          const p = new SSAOPass(this.scene, this.camera, aw, ah);
          p.kernelRadius = 0.5;
          p.minDistance = 0.0015;
          p.maxDistance = 0.08;
          return p;
        });
      }

      if (this.aoPass) composer.addPass(this.aoPass);
    }

    // --- Bloom -------------------------------------------------------------
    if (tier.bloom) {
      this.bloomPass = tryMake('UnrealBloomPass', () => {
        if (!isCtor(UnrealBloomPass)) throw new Error('UnrealBloomPass missing');
        return new UnrealBloomPass(
          new THREE.Vector2(
            Math.max(8, Math.round(bw * tier.bloomResScale)),
            Math.max(8, Math.round(bh * tier.bloomResScale))
          ),
          this.opts.bloomStrength,
          this.opts.bloomRadius,
          this.opts.bloomThreshold
        );
      });
      if (this.bloomPass) composer.addPass(this.bloomPass);
    }

    // --- Grade (mandatory in every non-off tier) ---------------------------
    this.gradePass = tryMake('GradePass', () => {
      if (!isCtor(ShaderPass)) throw new Error('ShaderPass missing');
      return new ShaderPass({
        name: 'TonyStonksGradeShader',
        uniforms: {
          tDiffuse: { value: null },
          uResolution: { value: new THREE.Vector2(bw, bh) },
          uTime: { value: 0 },
          uExposure: { value: this.lastSeenExposure },
          uSpeed: { value: 0 },
          uPulse: { value: 0 },
          uChromaBase: { value: this.opts.chromaticBase },
          uVignette: { value: this.opts.vignette },
          uGrain: { value: this.opts.grain },
          uSaturation: { value: this.opts.saturation },
          uContrast: { value: this.opts.contrast },
          uPivot: { value: GRADE_DEFAULTS.pivot },
          uBlack: { value: this.opts.black },
          uLift: { value: GRADE_DEFAULTS.lift.clone() },
          uGammaInv: { value: GRADE_DEFAULTS.gammaInv.clone() },
          uGain: { value: GRADE_DEFAULTS.gain.clone() },
          uShadowTint: { value: GRADE_DEFAULTS.shadowTint.clone() },
          uHighlightTint: { value: GRADE_DEFAULTS.highlightTint.clone() },
          uSplit: { value: this.opts.split },
          uShoulder: { value: this.opts.shoulder },
        },
        vertexShader: GRADE_VERT,
        fragmentShader: GRADE_FRAG,
      });
    });
    if (this.gradePass) composer.addPass(this.gradePass);

    // --- Output (tone-map slot: NoToneMapping + sRGB transfer only) --------
    this.outputPass = tryMake('OutputPass', () => {
      if (!isCtor(OutputPass)) throw new Error('OutputPass missing');
      return new OutputPass();
    });
    if (this.outputPass) composer.addPass(this.outputPass);

    // --- SMAA, deliberately AFTER OutputPass ------------------------------
    // SMAA's edge detection thresholds are tuned for perceptually-encoded
    // values; running it on the sRGB-encoded result catches shadow edges that
    // it misses in linear space.
    if (tier.smaa) {
      this.smaaPass = tryMake('SMAAPass', () => {
        if (!isCtor(SMAAPass)) throw new Error('SMAAPass missing');
        return new SMAAPass(bw, bh);
      });
      if (this.smaaPass) composer.addPass(this.smaaPass);
    }

    this.applyTierScales();

    // If the grade pass failed we have no tone mapping in the chain — hand it
    // back to OutputPass rather than shipping a raw linear image.
    if (this.gradePass) {
      this.renderer.toneMapping = THREE.NoToneMapping;
    } else {
      this.renderer.toneMapping = this.savedToneMapping;
    }
  }

  private teardown(): void {
    if (this.composer) {
      for (const pass of this.composer.passes.slice()) {
        this.composer.removePass(pass as Pass);
      }
      safeDispose(this.renderPass);
      safeDispose(this.aoPass);
      safeDispose(this.bloomPass);
      safeDispose(this.gradePass);
      safeDispose(this.smaaPass);
      safeDispose(this.outputPass);
      safeDispose(this.composer);
    }
    this.composer = null;
    this.renderPass = null;
    this.aoPass = null;
    this.bloomPass = null;
    this.gradePass = null;
    this.smaaPass = null;
    this.outputPass = null;
  }

  private restoreToneMapping(): void {
    this.renderer.toneMapping = this.savedToneMapping;
    this.renderer.info.autoReset = true;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** width/height in CSS pixels (same units Game.onResize passes to renderer.setSize). */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.pixelRatio = this.renderer.getPixelRatio() || 1;

    if (!this.composer) return;

    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);

    this.applyTierScales();
  }

  /**
   * Both `EffectComposer.addPass()` and `EffectComposer.setSize()` force every
   * pass to the full drawing-buffer size, which would silently undo the
   * half-res AO and the scaled bloom pyramid. Re-apply the tier's own scales
   * afterwards — this must run after ANY addPass/setSize on the composer.
   */
  private applyTierScales(): void {
    const bw = Math.max(1, Math.round(this.width * this.pixelRatio));
    const bh = Math.max(1, Math.round(this.height * this.pixelRatio));

    if (this.gradePass) {
      (this.gradePass.uniforms['uResolution'].value as THREE.Vector2).set(bw, bh);
    }

    const tier = this.quality === 'off' ? null : TIERS[this.quality];
    if (!tier) return;

    if (this.aoPass && tier.ao === 'half') {
      try {
        this.aoPass.setSize(Math.max(8, Math.round(bw * 0.5)), Math.max(8, Math.round(bh * 0.5)));
      } catch {
        /* pass refused the resize; leave it at full res */
      }
    }
    if (this.bloomPass && tier.bloomResScale !== 1) {
      try {
        this.bloomPass.setSize(
          Math.max(8, Math.round(bw * tier.bloomResScale)),
          Math.max(8, Math.round(bh * tier.bloomResScale))
        );
      } catch {
        /* leave at full res */
      }
    }
  }

  setQuality(q: PostQuality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.build();
    if (this.composer) this.setSize(this.width, this.height);
  }

  /** 0 = stationary, 1 = flat out. Drives radial blur, chromatic aberration and vignette. */
  setSpeed(normalised01: number): void {
    this.speedTarget = Math.min(1, Math.max(0, normalised01 || 0));
  }

  /** 0..1 impact flash + zoom punch, decays to zero over ~0.3s. */
  pulse(strength01: number): void {
    const s = Math.min(1, Math.max(0, strength01 || 0));
    this.pulseValue = Math.max(this.pulseValue, s);
  }

  /**
   * Show the raw / denoised AO buffer instead of the composite. Diagnostic only —
   * the shipping path is 'default'. Use this before ever concluding "AO is on but
   * invisible": it distinguishes "the pass produced nothing" from "the pass produced
   * something and the grade ate it".
   */
  setAODebug(mode: AODebug): void {
    if (mode === this.aoDebug) return;
    this.aoDebug = mode;
    if (this.aoPass && this.aoPass instanceof GTAOPass) {
      this.aoPass.output = this.aoDebugOutput();
    }
  }

  private aoDebugOutput(): number {
    switch (this.aoDebug) {
      case 'ao':
        return GTAOPass.OUTPUT.AO;
      case 'denoise':
        return GTAOPass.OUTPUT.Denoise;
      case 'off':
        return GTAOPass.OUTPUT.Off;
      default:
        return GTAOPass.OUTPUT.Default;
    }
  }

  /** Live tuning; any subset of the grade/bloom/AO knobs. */
  configure(o: GradeOptions): void {
    Object.assign(this.opts, o);

    if (this.gradePass) {
      const u = this.gradePass.uniforms;
      u['uSaturation'].value = this.opts.saturation;
      u['uContrast'].value = this.opts.contrast;
      u['uBlack'].value = this.opts.black;
      u['uVignette'].value = this.opts.vignette;
      u['uGrain'].value = this.opts.grain;
      u['uSplit'].value = this.opts.split;
      u['uShoulder'].value = this.opts.shoulder;
      u['uChromaBase'].value = this.opts.chromaticBase;
    }
    if (this.bloomPass) {
      this.bloomPass.strength = this.opts.bloomStrength;
      this.bloomPass.radius = this.opts.bloomRadius;
      this.bloomPass.threshold = this.opts.bloomThreshold;
    }
    if (this.aoPass && this.aoPass instanceof GTAOPass) {
      this.aoPass.blendIntensity = this.opts.aoIntensity;
    }
  }

  /** Drop-in replacement for renderer.render(scene, camera). */
  render(dt: number): void {
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;

    this.time += d;
    // ~8Hz critically-damped-ish approach so speed FX don't strobe.
    this.speedSmoothed += (this.speedTarget - this.speedSmoothed) * Math.min(1, d * 8);
    if (this.pulseValue > 0) this.pulseValue = Math.max(0, this.pulseValue - d / 0.3);

    if (!this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Every Pass calls renderer.render() for its fullscreen quad, and with the
    // default autoReset that wipes renderer.info on each one — tools/shoot.mjs
    // would then report drawCalls: 1. Reset once per frame instead so the
    // stats accumulate across the whole chain (which is the honest number).
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();

    // Adopt any exposure change Game.ts made, then keep tone mapping ours.
    if (this.renderer.toneMappingExposure !== this.lastSeenExposure) {
      this.lastSeenExposure = this.renderer.toneMappingExposure;
    }
    if (this.gradePass) {
      if (this.renderer.toneMapping !== THREE.NoToneMapping) {
        this.savedToneMapping = this.renderer.toneMapping;
        this.renderer.toneMapping = THREE.NoToneMapping;
      }
      const u = this.gradePass.uniforms;
      u['uTime'].value = this.time;
      u['uExposure'].value = this.lastSeenExposure;
      u['uSpeed'].value = this.speedSmoothed;
      u['uPulse'].value = this.pulseValue;
    }

    if (this.aoPass && this.aoPass instanceof GTAOPass) {
      // The camera's projection changes every frame (dynamic FOV), and GTAO
      // caches the inverse at setSize time only.
      this.camera.updateProjectionMatrix();
    }

    try {
      this.composer.render(d);
    } catch (err) {
      console.error('[PostFX] composer.render failed, falling back to direct render', err);
      this.teardown();
      this.restoreToneMapping();
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose(): void {
    this.teardown();
    this.restoreToneMapping();
  }
}

export default PostFX;
