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
 *   - lift / gamma / gain colour grading, done in a gamma-2.2 working space
 *   - warm-highlight / cool-shadow split tone
 *   - contrast S-curve around a sub-0.5 pivot
 *   - saturation boost
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
  vignette?: number;
  grain?: number;
  split?: number;
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
  aoIntensity?: number;
  chromaticBase?: number;
}

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
uniform vec3  uLift;
uniform vec3  uGammaInv;
uniform vec3  uGain;
uniform vec3  uShadowTint;
uniform vec3  uHighlightTint;
uniform float uSplit;

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

  // move to a gamma-2.2 working space; grading numbers behave like the
  // sRGB reference frames there.
  col = pow( col, vec3( 1.0 / 2.2 ) );

  // gain / gamma ---------------------------------------------------------
  col = col * uGain;
  col = pow( max( col, 0.0 ), uGammaInv );

  // contrast around a sub-0.5 pivot (refs sit at a ~0.37 median) ---------
  col = ( col - uPivot ) * uContrast + uPivot;

  // lift LAST so the filmic toe survives the contrast S-curve. The refs
  // never reach true black: their 1st-percentile luma is 6-9/255.
  col = uLift + max( col, 0.0 ) * ( 1.0 - uLift );

  // warm highlight / cool shadow split tone ------------------------------
  float l = dot( clamp( col, 0.0, 1.0 ), LUMA );
  vec3 tint = mix( uShadowTint, uHighlightTint, smoothstep( 0.06, 0.62, l ) );
  col *= mix( vec3( 1.0 ), tint, uSplit );

  // saturation -----------------------------------------------------------
  float g = dot( clamp( col, 0.0, 1.0 ), LUMA );
  col = mix( vec3( g ), col, uSaturation );

  // pulse white flash ----------------------------------------------------
  col += p * vec3( 0.22, 0.208, 0.185 );

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

  // back to linear — OutputPass applies the sRGB transfer.
  gl_FragColor = vec4( pow( col, vec3( 2.2 ) ), 1.0 );
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
  saturation: 1.40,
  contrast: 1.30,
  pivot: 0.375,
  vignette: 0.26,
  grain: 0.028,
  split: 0.5,
  chromaticBase: 0.0005,
  lift: new THREE.Vector3(0.004, 0.004, 0.009),
  gammaInv: new THREE.Vector3(1.0, 1.0, 1.0 / 1.02),
  gain: new THREE.Vector3(1.025, 1.015, 1.0),
  shadowTint: new THREE.Vector3(0.88, 0.955, 1.145),
  highlightTint: new THREE.Vector3(1.08, 1.0, 0.885),
};

const BLOOM_DEFAULTS = { strength: 0.35, radius: 0.6, threshold: 0.85 };

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

  private opts: Required<Omit<GradeOptions, never>> = {
    saturation: GRADE_DEFAULTS.saturation,
    contrast: GRADE_DEFAULTS.contrast,
    vignette: GRADE_DEFAULTS.vignette,
    grain: GRADE_DEFAULTS.grain,
    split: GRADE_DEFAULTS.split,
    bloomStrength: BLOOM_DEFAULTS.strength,
    bloomRadius: BLOOM_DEFAULTS.radius,
    bloomThreshold: BLOOM_DEFAULTS.threshold,
    // > 1 deliberately: the grade's lift + pivot lift the AO term straight back out
    // again, so the pass has to over-deliver for the contact darkening to survive to
    // the frame.
    aoIntensity: 1.3,
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
        p.output = GTAOPass.OUTPUT.Default;
        p.blendIntensity = this.opts.aoIntensity;
        // CONTACT occlusion, not mid-range room occlusion. A 1.3 m world radius with a
        // linear distance falloff spreads the term so thinly that the place it matters
        // most — the 2 cm where a cubicle partition meets the carpet — gets almost
        // nothing. 0.45 m with a superlinear exponent puts the energy at the contact.
        p.updateGtaoMaterial({
          radius: 0.75,
          distanceExponent: 1.5,
          thickness: 0.6,
          distanceFallOff: 1.0,
          scale: 2.2,
          samples: tier.aoSamples,
          screenSpaceRadius: false,
        });
        // Tighter denoise radius to match the tighter AO radius: at 4 the poisson
        // denoiser was smearing the contact term straight back out again.
        p.updatePdMaterial({
          lumaPhi: 10,
          depthPhi: 1.5,
          normalPhi: 4,
          radius: 2.5,
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
          uLift: { value: GRADE_DEFAULTS.lift.clone() },
          uGammaInv: { value: GRADE_DEFAULTS.gammaInv.clone() },
          uGain: { value: GRADE_DEFAULTS.gain.clone() },
          uShadowTint: { value: GRADE_DEFAULTS.shadowTint.clone() },
          uHighlightTint: { value: GRADE_DEFAULTS.highlightTint.clone() },
          uSplit: { value: this.opts.split },
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

  /** Live tuning; any subset of the grade/bloom/AO knobs. */
  configure(o: GradeOptions): void {
    Object.assign(this.opts, o);

    if (this.gradePass) {
      const u = this.gradePass.uniforms;
      u['uSaturation'].value = this.opts.saturation;
      u['uContrast'].value = this.opts.contrast;
      u['uVignette'].value = this.opts.vignette;
      u['uGrain'].value = this.opts.grain;
      u['uSplit'].value = this.opts.split;
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
