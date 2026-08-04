/**
 * LandingParticles — impact and outcome feedback.
 *
 * This file owns every "something just happened to you" burst that is not a grind spark:
 *
 *   landing  — a dust puff whose size, spread and lifetime scale with the drop, plus an
 *              expanding ground shockwave ring once the drop is big enough to hurt.
 *   trickPop — a tight white flash of motes when a trick registers. Cold, fast, snappy.
 *   bank     — a rising GREEN column plus a gold ring when a combo is banked. Up = money.
 *   bailFlash— a red splat that scatters DOWNWARD and outward. Down = loss.
 *
 * The three outcome effects are deliberately different in colour, direction and speed, so
 * a player learns "that was good / that was banked / that was blown" from peripheral vision
 * without ever reading the HUD:
 *
 *              colour        direction     duration
 *   trick      white/cyan    outward       ~0.25 s   (a snap)
 *   bank       green/gold    UP            ~0.9 s    (a rise)
 *   bail       red/brown     DOWN + out    ~0.7 s    (a collapse)
 *
 * Two draw calls for particles (one alpha-blended dust batch, one additive spark batch) plus
 * a pool of six ring meshes. All state is in flat typed arrays with swap-remove: zero
 * allocation per frame.
 */

import * as THREE from 'three';

/**
 * Soft puff sprite. An untextured PointsMaterial draws hard opaque squares — at 0.3 world
 * units those read as brown confetti, not as dust.
 */
let DUST_TEX: THREE.CanvasTexture | null = null;
function dustTexture(): THREE.CanvasTexture {
  if (DUST_TEX) return DUST_TEX;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(S, S);
  const px = img.data;
  const c = (S - 1) * 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = Math.min(1, Math.sqrt((x - c) * (x - c) + (y - c) * (y - c)) / c);
      // Gentle shoulder, long tail: a puff has no edge.
      const a = Math.pow(Math.max(0, 1 - r), 2.2) * 0.9;
      const i = (y * S + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  DUST_TEX = tex;
  return tex;
}

/** Hot core + halo, for the additive spark batch. */
let MOTE_TEX: THREE.CanvasTexture | null = null;
function moteTexture(): THREE.CanvasTexture {
  if (MOTE_TEX) return MOTE_TEX;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(S, S);
  const px = img.data;
  const c = (S - 1) * 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = Math.sqrt((x - c) * (x - c) + (y - c) * (y - c)) / c;
      const core = Math.max(0, 1 - r / 0.34);
      const skirt = Math.max(0, 1 - r);
      const v = Math.min(1, core * core + Math.pow(skirt, 2.8) * 0.7);
      const i = (y * S + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  MOTE_TEX = tex;
  return tex;
}

const PUFF_VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp( aSize * 340.0 / max( -mv.z, 0.15 ), 2.0, 190.0 );
}`;

const DUST_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float a = texture2D( uMap, gl_PointCoord ).a * vAlpha;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vColor, a );
}`;

const MOTE_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float a = texture2D( uMap, gl_PointCoord ).a;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vColor * a * vAlpha, 1.0 );
}`;

const MAX_DUST = 170;
const MAX_MOTES = 240;
const MAX_RINGS = 6;

/** One pooled particle batch. Flat arrays, swap-removed. */
class Batch {
  px: Float32Array; py: Float32Array; pz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  life: Float32Array; maxLife: Float32Array;
  scale: Float32Array; grav: Float32Array; drag: Float32Array;
  cr: Float32Array; cg: Float32Array; cb: Float32Array;
  grow: Float32Array;
  count = 0;
  readonly cap: number;

  constructor(cap: number) {
    this.cap = cap;
    this.px = new Float32Array(cap); this.py = new Float32Array(cap); this.pz = new Float32Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap); this.vz = new Float32Array(cap);
    this.life = new Float32Array(cap); this.maxLife = new Float32Array(cap);
    this.scale = new Float32Array(cap); this.grav = new Float32Array(cap); this.drag = new Float32Array(cap);
    this.cr = new Float32Array(cap); this.cg = new Float32Array(cap); this.cb = new Float32Array(cap);
    this.grow = new Float32Array(cap);
  }

  alloc(): number {
    return this.count >= this.cap ? -1 : this.count++;
  }

  remove(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.px[i] = this.px[last]; this.py[i] = this.py[last]; this.pz[i] = this.pz[last];
    this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last]; this.vz[i] = this.vz[last];
    this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last];
    this.scale[i] = this.scale[last]; this.grav[i] = this.grav[last]; this.drag[i] = this.drag[last];
    this.cr[i] = this.cr[last]; this.cg[i] = this.cg[last]; this.cb[i] = this.cb[last];
    this.grow[i] = this.grow[last];
  }
}

export class LandingParticles {
  private scene: THREE.Scene;
  private group = new THREE.Group();

  private dust = new Batch(MAX_DUST);
  private motes = new Batch(MAX_MOTES);

  private dustGeo: THREE.BufferGeometry;
  private dustMat: THREE.ShaderMaterial;
  private dustPoints: THREE.Points;

  private moteGeo: THREE.BufferGeometry;
  private moteMat: THREE.ShaderMaterial;
  private motePoints: THREE.Points;

  // --- shockwave rings ------------------------------------------------------
  private rings: THREE.Mesh[] = [];
  private ringMats: THREE.MeshBasicMaterial[] = [];
  private ringLife = new Float32Array(MAX_RINGS);
  private ringMaxLife = new Float32Array(MAX_RINGS);
  private ringR0 = new Float32Array(MAX_RINGS);
  private ringR1 = new Float32Array(MAX_RINGS);
  private ringAlpha = new Float32Array(MAX_RINGS);
  private ringCursor = 0;

  private groundY = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'impactFX';

    this.dustGeo = this.makeGeo(MAX_DUST);
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: dustTexture() } },
      vertexShader: PUFF_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.dustPoints = new THREE.Points(this.dustGeo, this.dustMat);
    this.dustPoints.frustumCulled = false;
    this.dustPoints.renderOrder = 6;
    this.group.add(this.dustPoints);

    this.moteGeo = this.makeGeo(MAX_MOTES);
    this.moteMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: moteTexture() } },
      vertexShader: PUFF_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.motePoints = new THREE.Points(this.moteGeo, this.moteMat);
    this.motePoints.frustumCulled = false;
    this.motePoints.renderOrder = 8;
    this.group.add(this.motePoints);

    // Rings share one geometry; each owns a material so colours can differ.
    const ringGeo = new THREE.RingGeometry(0.82, 1.0, 40, 1);
    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;   // lie flat on the floor
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 7;
      this.rings.push(mesh);
      this.ringMats.push(mat);
      this.group.add(mesh);
    }

    this.scene.add(this.group);
  }

  private makeGeo(cap: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(cap), 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(cap), 1));
    g.setDrawRange(0, 0);
    return g;
  }

  /** Floor height used for the dust plane and for ground rings. */
  setGroundLevel(y: number): void {
    this.groundY = y;
  }

  // =========================================================================
  // Emitters
  // =========================================================================

  /**
   * Landing dust.
   * @param position landing position (the chair, not the floor).
   * @param intensity 0-1 from air time. Drives count, spread, size AND the shockwave.
   */
  spawn(position: THREE.Vector3, intensity: number = 0.5): void {
    const t = Math.max(0, Math.min(1, intensity));
    const floor = Math.min(position.y, this.groundY + 0.02);
    const n = Math.floor(10 + t * 22);

    for (let k = 0; k < n; k++) {
      const i = this.dust.alloc();
      if (i < 0) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.4 + Math.random() * 3.2) * (0.45 + t);
      this.dust.px[i] = position.x + Math.cos(angle) * (0.1 + Math.random() * 0.35);
      this.dust.py[i] = floor + 0.06 + Math.random() * 0.22;
      this.dust.pz[i] = position.z + Math.sin(angle) * (0.1 + Math.random() * 0.35);
      this.dust.vx[i] = Math.cos(angle) * speed;
      this.dust.vy[i] = 0.4 + Math.random() * 1.7 * t;
      this.dust.vz[i] = Math.sin(angle) * speed;
      this.dust.grav[i] = -1.9;
      this.dust.drag[i] = 2.6;
      const ml = 0.55 + Math.random() * 0.55 + t * 0.35;
      this.dust.life[i] = ml; this.dust.maxLife[i] = ml;
      this.dust.scale[i] = 0.16 + Math.random() * (0.2 + t * 0.45);
      this.dust.grow[i] = 1.5;
      // Warm carpet dust, LIT rather than silhouetted: a puff kicked up under a bright
      // fluorescent grid is a light value against the floor, not a dark one.
      this.dust.cr[i] = 0.74; this.dust.cg[i] = 0.65; this.dust.cb[i] = 0.52;
    }

    // A real landing rings the floor. Below ~a half-height drop it does not, so the ring
    // stays meaningful instead of firing on every hop.
    if (t > 0.32) {
      this.ring(position.x, floor + 0.03, position.z, 0.5, 1.6 + t * 2.6, 0.55 + t * 0.35, 0.92, 0.88, 0.78, 0.42 + t * 0.3);
      // A hard landing also throws a few hot scuff motes.
      const m = Math.floor(t * 12);
      for (let k = 0; k < m; k++) {
        const i = this.motes.alloc();
        if (i < 0) break;
        const a = Math.random() * Math.PI * 2;
        const s = 2.5 + Math.random() * 4.5 * t;
        this.motes.px[i] = position.x; this.motes.py[i] = floor + 0.05; this.motes.pz[i] = position.z;
        this.motes.vx[i] = Math.cos(a) * s; this.motes.vy[i] = 1.0 + Math.random() * 2.2; this.motes.vz[i] = Math.sin(a) * s;
        this.motes.grav[i] = -14; this.motes.drag[i] = 2.2;
        const ml = 0.18 + Math.random() * 0.22;
        this.motes.life[i] = ml; this.motes.maxLife[i] = ml;
        this.motes.scale[i] = 0.020 + Math.random() * 0.02;
        this.motes.grow[i] = -0.4;
        this.motes.cr[i] = 3.4; this.motes.cg[i] = 2.5; this.motes.cb[i] = 1.4;
      }
    }
  }

  /**
   * A trick registered. Cold white snap, outward, gone in a quarter second — visually the
   * opposite of the warm rising bank and the red collapsing bail.
   * @param magnitude 0-1, scales with the trick's worth.
   */
  trickPop(position: THREE.Vector3, magnitude = 0.5): void {
    const t = Math.max(0, Math.min(1, magnitude));
    const n = Math.floor(10 + t * 14);
    for (let k = 0; k < n; k++) {
      const i = this.motes.alloc();
      if (i < 0) break;
      // Spherical shell, so it reads as a pop from the rider rather than a ground effect.
      // Small and FAST: at close camera range a fat additive mote just smears white over
      // the rider's chest, which hides the animation the pop is meant to punctuate.
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const s = (3.4 + Math.random() * 4.2) * (0.7 + t);
      this.motes.px[i] = position.x;
      this.motes.py[i] = position.y - 0.30;
      this.motes.pz[i] = position.z;
      this.motes.vx[i] = Math.sin(ph) * Math.cos(th) * s;
      this.motes.vy[i] = Math.cos(ph) * s * 0.8 + 0.5;
      this.motes.vz[i] = Math.sin(ph) * Math.sin(th) * s;
      this.motes.grav[i] = -6; this.motes.drag[i] = 6.5;
      const ml = 0.12 + Math.random() * 0.12;
      this.motes.life[i] = ml; this.motes.maxLife[i] = ml;
      this.motes.scale[i] = 0.010 + Math.random() * 0.012;
      this.motes.grow[i] = -0.5;
      // Cool white with a blue edge.
      this.motes.cr[i] = 2.1; this.motes.cg[i] = 2.6; this.motes.cb[i] = 3.4;
    }
  }

  /**
   * The combo was banked. Money goes UP: a green column with gold flecks and one wide gold
   * ring at the rider's feet. Longer-lived than everything else so it reads as a payout.
   * @param magnitude 0-1, from the size of the position banked.
   */
  bank(position: THREE.Vector3, magnitude = 0.5): void {
    const t = Math.max(0, Math.min(1, magnitude));
    const n = Math.floor(16 + t * 22);
    for (let k = 0; k < n; k++) {
      const i = this.motes.alloc();
      if (i < 0) break;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (0.35 + t * 0.5);
      this.motes.px[i] = position.x + Math.cos(a) * r;
      this.motes.py[i] = position.y - 0.35 + Math.random() * 0.4;
      this.motes.pz[i] = position.z + Math.sin(a) * r;
      this.motes.vx[i] = Math.cos(a) * (0.5 + Math.random() * 0.9);
      this.motes.vy[i] = 3.2 + Math.random() * (2.6 + t * 3.5);   // rise, and keep rising
      this.motes.vz[i] = Math.sin(a) * (0.5 + Math.random() * 0.9);
      this.motes.grav[i] = 1.4;      // buoyant: stonks only go up
      this.motes.drag[i] = 1.1;
      const ml = 0.55 + Math.random() * 0.5;
      this.motes.life[i] = ml; this.motes.maxLife[i] = ml;
      this.motes.scale[i] = 0.022 + Math.random() * 0.024;
      this.motes.grow[i] = -0.25;
      if (Math.random() < 0.35) {
        this.motes.cr[i] = 3.6; this.motes.cg[i] = 2.7; this.motes.cb[i] = 0.6;   // gold
      } else {
        this.motes.cr[i] = 0.5; this.motes.cg[i] = 3.4; this.motes.cb[i] = 1.1;   // stonks green
      }
    }
    this.ring(position.x, this.groundY + 0.04, position.z, 0.6, 2.4 + t * 3.0, 0.7, 0.55, 3.0, 1.0, 0.75);
  }

  /**
   * Blown it. Red, DOWNWARD, and it hits the floor: the read is a collapse, not a payout.
   */
  bailFlash(position: THREE.Vector3): void {
    for (let k = 0; k < 22; k++) {
      const i = this.motes.alloc();
      if (i < 0) break;
      const a = Math.random() * Math.PI * 2;
      const s = 2.2 + Math.random() * 4.0;
      this.motes.px[i] = position.x; this.motes.py[i] = position.y; this.motes.pz[i] = position.z;
      this.motes.vx[i] = Math.cos(a) * s;
      this.motes.vy[i] = -0.6 - Math.random() * 2.4;   // thrown DOWN
      this.motes.vz[i] = Math.sin(a) * s;
      this.motes.grav[i] = -13; this.motes.drag[i] = 3.0;
      const ml = 0.30 + Math.random() * 0.30;
      this.motes.life[i] = ml; this.motes.maxLife[i] = ml;
      this.motes.scale[i] = 0.028 + Math.random() * 0.03;
      this.motes.grow[i] = 0.2;
      this.motes.cr[i] = 4.2; this.motes.cg[i] = 0.55; this.motes.cb[i] = 0.22;   // alarm red
    }
    for (let k = 0; k < 14; k++) {
      const i = this.dust.alloc();
      if (i < 0) break;
      const a = Math.random() * Math.PI * 2;
      const s = 1.6 + Math.random() * 2.6;
      this.dust.px[i] = position.x + Math.cos(a) * 0.2;
      this.dust.py[i] = Math.max(this.groundY + 0.08, position.y - 0.5);
      this.dust.pz[i] = position.z + Math.sin(a) * 0.2;
      this.dust.vx[i] = Math.cos(a) * s; this.dust.vy[i] = 0.3 + Math.random(); this.dust.vz[i] = Math.sin(a) * s;
      this.dust.grav[i] = -2.2; this.dust.drag[i] = 2.8;
      const ml = 0.6 + Math.random() * 0.5;
      this.dust.life[i] = ml; this.dust.maxLife[i] = ml;
      this.dust.scale[i] = 0.22 + Math.random() * 0.3;
      this.dust.grow[i] = 1.7;
      this.dust.cr[i] = 0.62; this.dust.cg[i] = 0.5; this.dust.cb[i] = 0.44;
    }
    // Fast, tight, red: a slap rather than a bloom.
    this.ring(position.x, this.groundY + 0.03, position.z, 0.4, 2.2, 0.36, 3.2, 0.35, 0.2, 0.85);
  }

  /** Fire one shockwave ring. Oldest is recycled. */
  private ring(
    x: number, y: number, z: number,
    r0: number, r1: number, life: number,
    cr: number, cg: number, cb: number, alpha: number,
  ): void {
    const i = this.ringCursor;
    this.ringCursor = (this.ringCursor + 1) % MAX_RINGS;
    const m = this.rings[i];
    m.position.set(x, y, z);
    m.scale.setScalar(r0);
    m.visible = true;
    this.ringMats[i].color.setRGB(cr, cg, cb);
    this.ringMats[i].opacity = alpha;
    this.ringLife[i] = life;
    this.ringMaxLife[i] = life;
    this.ringR0[i] = r0;
    this.ringR1[i] = r1;
    this.ringAlpha[i] = alpha;
  }

  // =========================================================================
  // Simulation
  // =========================================================================

  update(dt: number): void {
    this.step(this.dust, dt);
    this.step(this.motes, dt);

    for (let i = 0; i < MAX_RINGS; i++) {
      if (this.ringLife[i] <= 0) continue;
      this.ringLife[i] -= dt;
      if (this.ringLife[i] <= 0) {
        this.ringLife[i] = 0;
        this.rings[i].visible = false;
        continue;
      }
      const u = 1 - this.ringLife[i] / this.ringMaxLife[i];
      // Ease-out expansion: fast out of the gate, then coasting — an impact, not a balloon.
      const e = 1 - (1 - u) * (1 - u);
      this.rings[i].scale.setScalar(this.ringR0[i] + (this.ringR1[i] - this.ringR0[i]) * e);
      this.ringMats[i].opacity = this.ringAlpha[i] * (1 - u) * (1 - u);
    }

    this.write(this.dust, this.dustGeo, this.dustPoints, false);
    this.write(this.motes, this.moteGeo, this.motePoints, true);
  }

  private step(b: Batch, dt: number): void {
    const floor = this.groundY + 0.04;
    for (let i = b.count - 1; i >= 0; i--) {
      const damp = Math.max(0, 1 - b.drag[i] * dt);
      b.vx[i] *= damp; b.vz[i] *= damp;
      b.vy[i] = b.vy[i] * damp + b.grav[i] * dt;
      b.px[i] += b.vx[i] * dt;
      b.py[i] += b.vy[i] * dt;
      b.pz[i] += b.vz[i] * dt;
      if (b.py[i] < floor) {
        b.py[i] = floor;
        if (b.vy[i] < 0) b.vy[i] = 0;
        b.vx[i] *= 0.55; b.vz[i] *= 0.55;
      }
      b.life[i] -= dt;
      if (b.life[i] <= 0) b.remove(i);
    }
  }

  private write(b: Batch, geo: THREE.BufferGeometry, obj: THREE.Points, additive: boolean): void {
    const pos = (geo.attributes.position as THREE.BufferAttribute);
    const col = (geo.attributes.aColor as THREE.BufferAttribute);
    const siz = (geo.attributes.aSize as THREE.BufferAttribute);
    const alp = (geo.attributes.aAlpha as THREE.BufferAttribute);
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    const sa = siz.array as Float32Array;
    const aa = alp.array as Float32Array;

    const n = b.count;
    for (let i = 0; i < n; i++) {
      const lr = b.life[i] / b.maxLife[i];
      pa[i * 3] = b.px[i]; pa[i * 3 + 1] = b.py[i]; pa[i * 3 + 2] = b.pz[i];
      ca[i * 3] = b.cr[i]; ca[i * 3 + 1] = b.cg[i]; ca[i * 3 + 2] = b.cb[i];
      // Puffs expand as they dissipate; sparks shrink as they cool.
      sa[i] = b.scale[i] * Math.max(0.15, 1 + (1 - lr) * b.grow[i]);
      const rise = Math.min(1, (1 - lr) * 8);
      aa[i] = additive ? rise * lr * lr : rise * lr * lr * 0.6;
    }

    pos.needsUpdate = true; col.needsUpdate = true; siz.needsUpdate = true; alp.needsUpdate = true;
    geo.setDrawRange(0, n);
    obj.visible = n > 0;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.dustGeo.dispose();
    this.dustMat.dispose();
    this.moteGeo.dispose();
    this.moteMat.dispose();
    if (this.rings[0]) this.rings[0].geometry.dispose();
    for (const m of this.ringMats) m.dispose();
  }
}
