/**
 * GrindParticles — the sparks.
 *
 * The grind spark is the signature effect of a Tony Hawk game: it is the entire reward for
 * the riskiest thing the player does, and it has to read at a glance, in motion, from behind
 * the chair. refs/scene-office3.png is the target — a DENSE spray with white-hot cores, long
 * motion streaks trailing metres behind the contact patch, and embers skittering off across
 * the carpet, all anchored by a hot flare bright enough to light the ledge it is cutting.
 *
 * WHAT THIS VERSION FIXES
 * -----------------------
 *  1. TWO REAL CONTACT POINTS. An office chair grinds on its caster ring, not on a point.
 *     `setChairSource()` takes the chair root plus ChairModel's `wheelContactPoints` and each
 *     frame projects the front-most and rear-most caster onto the rail line, so the spray
 *     comes from two separated sources under the base (as in the reference) and follows the
 *     chair's actual yaw. Falls back to a symmetric +/-0.24 m pair if no chair is bound.
 *  2. SPEED SCALING. Emission rate, ejection speed, streak length, cone spread and flare
 *     energy all ride the grind speed. A crawl trickles; flat out throws a rooster tail.
 *  3. REAL PHYSICS WITH FLOOR BOUNCE. Sparks integrate under gravity with anisotropic drag
 *     and BOUNCE off the floor plane, losing energy and skittering — the ember trail across
 *     the carpet in the reference is the single strongest cue that these are hot metal
 *     fragments and not a billboard effect.
 *  4. HDR CORES. Head brightness peaks around 6-8 linear against a bloom threshold of 0.95
 *     and clamp of 12, so the cores genuinely clip and halate instead of sitting under the
 *     gate as pale dots.
 *  5. A LIGHT. Bloom cannot illuminate geometry. One pooled, flickering PointLight sits on
 *     the contact patch so the ledge, the floor and the chair's own base actually catch the
 *     orange, which is what makes the sparks feel like they are being MADE by the friction.
 *
 * BUDGET: three draw calls plus two sprites and one light. All particle state lives in flat
 * typed arrays with swap-remove; zero allocation per frame after construction.
 */

import * as THREE from 'three';

const MAX_SPARKS = 620;

const KIND_FINE = 0;
const KIND_EMBER = 1;

// White-hot -> orange -> ember red. Sampled by remaining-life, so a spark cools as it flies.
const RAMP: Array<[number, number, number]> = [
  [1.00, 0.98, 0.92],
  [1.00, 0.86, 0.46],
  [1.00, 0.55, 0.13],
  [0.86, 0.24, 0.04],
  [0.36, 0.06, 0.01],
];

function sampleRamp(t: number, out: THREE.Vector3): void {
  const x = THREE.MathUtils.clamp(1 - t, 0, 0.9999) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[Math.min(i + 1, RAMP.length - 1)];
  out.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

/** Radial glow sprite: hot core, wide soft skirt. Generated once, shared. */
let SPARK_TEX: THREE.CanvasTexture | null = null;
function sparkTexture(): THREE.CanvasTexture {
  if (SPARK_TEX) return SPARK_TEX;
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
      const core = Math.max(0, 1 - r / 0.30);
      const skirt = Math.max(0, 1 - r);
      const v = Math.min(1, core * core * 1.0 + Math.pow(skirt, 2.6) * 0.72);
      const i = (y * S + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  SPARK_TEX = tex;
  return tex;
}

const HEAD_VERT = /* glsl */`
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
  // Perspective-correct sizing, clamped so a spark right on the lens does not fill the screen.
  gl_PointSize = clamp( aSize * 340.0 / max( -mv.z, 0.15 ), 1.0, 58.0 );
}`;

const HEAD_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec3 vColor;
void main() {
  vec4 t = texture2D( uMap, gl_PointCoord );
  if ( t.a < 0.004 ) discard;
  gl_FragColor = vec4( vColor * t.a, 1.0 );
}`;

// Module scratch — reused every frame, never reallocated.
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _emitA = new THREE.Vector3();
const _emitB = new THREE.Vector3();
const _world = new THREE.Vector3();
const _col = new THREE.Vector3();

export class GrindParticles {
  private scene: THREE.Scene;
  private group = new THREE.Group();

  // --- particle pool (structure of arrays, swap-removed) ---------------------
  private px = new Float32Array(MAX_SPARKS);
  private py = new Float32Array(MAX_SPARKS);
  private pz = new Float32Array(MAX_SPARKS);
  private vx = new Float32Array(MAX_SPARKS);
  private vy = new Float32Array(MAX_SPARKS);
  private vz = new Float32Array(MAX_SPARKS);
  private life = new Float32Array(MAX_SPARKS);
  private maxLife = new Float32Array(MAX_SPARKS);
  private size = new Float32Array(MAX_SPARKS);
  private seed = new Float32Array(MAX_SPARKS);
  private kind = new Uint8Array(MAX_SPARKS);
  private bounces = new Uint8Array(MAX_SPARKS);
  private count = 0;

  private headGeo: THREE.BufferGeometry;
  private headMat: THREE.ShaderMaterial;
  private heads: THREE.Points;

  private streakGeo: THREE.BufferGeometry;
  private streakMat: THREE.LineBasicMaterial;
  private streaks: THREE.LineSegments;

  /** Wide warm halo + tight white core. Two sprites so the flare has a value range. */
  private flare: THREE.Sprite;
  private core: THREE.Sprite;
  private light: THREE.PointLight;
  private flareEnergy = 0;
  private flarePos = new THREE.Vector3();

  private spawnAccumulator = 0;
  private groundY = 0;
  private time = 0;

  /** Optional chair binding, so sparks leave the real caster contact patches. */
  private chairRoot: THREE.Object3D | null = null;
  private contacts: THREE.Vector3[] | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'grindSparks';
    this.group.frustumCulled = false;

    // --- heads --------------------------------------------------------------
    this.headGeo = new THREE.BufferGeometry();
    this.headGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
    this.headGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
    this.headGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS), 1));
    this.headGeo.setDrawRange(0, 0);

    this.headMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: sparkTexture() } },
      vertexShader: HEAD_VERT,
      fragmentShader: HEAD_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });

    this.heads = new THREE.Points(this.headGeo, this.headMat);
    this.heads.frustumCulled = false;
    this.heads.renderOrder = 8;
    this.group.add(this.heads);

    // --- streaks ------------------------------------------------------------
    this.streakGeo = new THREE.BufferGeometry();
    this.streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 6), 3));
    this.streakGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 6), 3));
    this.streakGeo.setDrawRange(0, 0);
    this.streakMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.streaks = new THREE.LineSegments(this.streakGeo, this.streakMat);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 7;
    this.group.add(this.streaks);

    // --- contact flare ------------------------------------------------------
    this.flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sparkTexture(),
      // >1 on purpose: this is the anchor the bloom is supposed to bite on.
      color: new THREE.Color(3.4, 1.55, 0.42),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }));
    this.flare.name = 'grindFlare';
    this.flare.visible = false;
    this.flare.renderOrder = 9;
    this.group.add(this.flare);

    this.core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sparkTexture(),
      color: new THREE.Color(6.0, 5.2, 3.4),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }));
    this.core.name = 'grindCore';
    this.core.visible = false;
    this.core.renderOrder = 10;
    this.group.add(this.core);

    // --- contact light ------------------------------------------------------
    // Created up front (never added/removed at runtime) so the one-time material
    // recompile that a light-count change forces happens at level build, not mid-grind.
    this.light = new THREE.PointLight(0xff7a1e, 0, 6.5, 2);
    this.light.name = 'grindLight';
    this.light.castShadow = false;
    this.group.add(this.light);

    this.scene.add(this.group);
  }

  /**
   * Bind the chair so sparks are emitted from the real caster contact patches.
   * @param root          chair root object (world transform is read each frame).
   * @param localContacts ChairModel `wheelContactPoints` — root-local, y === 0.
   */
  setChairSource(root: THREE.Object3D | null, localContacts?: THREE.Vector3[] | null): void {
    this.chairRoot = root;
    this.contacts = localContacts && localContacts.length > 0 ? localContacts : null;
  }

  /** Floor height the embers bounce off. Levels are built on y = 0. */
  setGroundLevel(y: number): void {
    this.groundY = y;
  }

  private allocate(): number {
    if (this.count >= MAX_SPARKS) return -1;
    return this.count++;
  }

  /**
   * Emit a burst. `direction` is the grind travel direction; sparks fire mostly BACKWARDS
   * along it, which is what makes the spray read as friction rather than as a fountain.
   *
   * @param speed grind speed in m/s — drives ejection velocity and cone spread.
   */
  spawn(position: THREE.Vector3, direction: THREE.Vector3, count = 3, speed = 8): void {
    _side.crossVectors(direction, _up);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
    else _side.normalize();

    const sp = Math.max(2, speed);
    for (let k = 0; k < count; k++) {
      const i = this.allocate();
      if (i < 0) return;

      const ember = Math.random() < 0.26;

      // Backward ejection scales with grind speed — this is what turns a trickle into a
      // rooster tail as the player picks up pace.
      const back = -(0.22 + Math.random() * 0.55) * sp;
      const fan = (Math.random() - 0.5) * (ember ? 0.9 : 1.9) * (0.55 + sp * 0.075);
      const rise = (ember ? 0.5 : 1.1) + Math.random() * (ember ? 1.4 : 2.9);

      this.px[i] = position.x + direction.x * (Math.random() - 0.5) * 0.10 + _side.x * (Math.random() - 0.5) * 0.06;
      this.py[i] = position.y + (Math.random() - 0.5) * 0.03;
      this.pz[i] = position.z + direction.z * (Math.random() - 0.5) * 0.10 + _side.z * (Math.random() - 0.5) * 0.06;

      this.vx[i] = direction.x * back + _side.x * fan + (Math.random() - 0.5) * 0.6;
      this.vy[i] = rise + (Math.random() - 0.5) * 0.8;
      this.vz[i] = direction.z * back + _side.z * fan + (Math.random() - 0.5) * 0.6;

      const ml = ember ? 0.60 + Math.random() * 0.85 : 0.13 + Math.random() * 0.24;
      this.life[i] = ml;
      this.maxLife[i] = ml;
      this.size[i] = ember ? 0.026 + Math.random() * 0.022 : 0.012 + Math.random() * 0.018;
      this.kind[i] = ember ? KIND_EMBER : KIND_FINE;
      this.bounces[i] = 0;
      this.seed[i] = Math.random() * 100;
    }
  }

  /**
   * @param speed grind speed in m/s. Defaults to a mid cruise if the caller has none.
   */
  update(
    dt: number,
    isGrinding: boolean,
    grindPosition?: THREE.Vector3,
    grindDirection?: THREE.Vector3,
    speed = 9,
  ): void {
    this.time += dt;

    if (grindDirection && grindDirection.lengthSq() > 1e-6) _dir.copy(grindDirection).normalize();
    else _dir.set(0, 0, -1);

    if (isGrinding && grindPosition) {
      this.resolveEmitters(grindPosition, _dir);

      // Density rides speed: ~150/s at a crawl, ~560/s flat out.
      const rate = 130 + Math.min(1, speed / 15) * 430;
      this.spawnAccumulator += dt * rate;
      let budget = 24; // cap per frame so a long stall cannot dump the whole pool at once
      while (this.spawnAccumulator >= 1 && budget-- > 0) {
        this.spawnAccumulator -= 1;
        // The trailing caster does most of the cutting; the leading one throws a smaller
        // secondary spray. Two sources is what makes the base read as WIDE.
        if (Math.random() < 0.62) this.spawn(_emitB, _dir, 1, speed);
        else this.spawn(_emitA, _dir, 1, speed);
      }
      if (this.spawnAccumulator > 40) this.spawnAccumulator = 0;

      this.flareEnergy = Math.min(1, this.flareEnergy + dt * 11);
      this.flarePos.lerpVectors(_emitA, _emitB, 0.5);
    } else {
      this.spawnAccumulator = 0;
      this.flareEnergy = Math.max(0, this.flareEnergy - dt * 7);
    }

    this.updateFlare(speed);
    this.integrate(dt);
    this.writeBuffers();
  }

  /** Front-most and rear-most caster contacts, projected onto the rail line. */
  private resolveEmitters(grindPosition: THREE.Vector3, dir: THREE.Vector3): void {
    let minT = 0, maxT = 0, found = false;
    if (this.chairRoot && this.contacts) {
      this.chairRoot.updateWorldMatrix(true, false);
      for (let i = 0; i < this.contacts.length; i++) {
        _world.copy(this.contacts[i]).applyMatrix4(this.chairRoot.matrixWorld);
        const t = (_world.x - grindPosition.x) * dir.x + (_world.z - grindPosition.z) * dir.z;
        if (!found) { minT = maxT = t; found = true; }
        else if (t < minT) minT = t;
        else if (t > maxT) maxT = t;
      }
      // Guard against a degenerate binding collapsing both emitters onto one point.
      if (maxT - minT < 0.12) { minT = -0.24; maxT = 0.24; }
    }
    if (!found) { minT = -0.24; maxT = 0.24; }

    _emitA.copy(grindPosition).addScaledVector(dir, maxT);   // leading contact
    _emitB.copy(grindPosition).addScaledVector(dir, minT);   // trailing contact
  }

  private updateFlare(speed: number): void {
    // Flicker hard: a steady glow reads as a lamp, a flickering one reads as friction.
    const t = this.time;
    const flick = 0.58 + 0.42 * Math.sin(t * 47.3) * Math.sin(t * 18.1 + 1.3);
    const e = this.flareEnergy * flick * (0.55 + Math.min(1, speed / 14) * 0.45);

    const on = e > 0.02;
    this.flare.visible = on;
    this.core.visible = on;
    if (on) {
      this.flare.position.copy(this.flarePos);
      this.core.position.copy(this.flarePos);
      const s = 0.34 + e * 0.52;
      this.flare.scale.set(s, s, s);
      this.core.scale.set(s * 0.30, s * 0.30, s * 0.30);
      (this.flare.material as THREE.SpriteMaterial).opacity = Math.min(1, e * 1.3);
      (this.core.material as THREE.SpriteMaterial).opacity = Math.min(1, e * 1.5);
    }

    // The light is the part bloom cannot do: it puts orange on the ledge and the carpet.
    this.light.intensity = e * 9.0;
    if (this.light.intensity > 0.001) this.light.position.copy(this.flarePos);
  }

  private integrate(dt: number): void {
    const g = -21.0 * dt;
    const floor = this.groundY;
    for (let i = this.count - 1; i >= 0; i--) {
      this.vy[i] += g;
      // Air drag: fine sparks decelerate hard, which is what gives the spray its cone.
      const drag = this.kind[i] === KIND_EMBER ? 1.15 : 4.0;
      const damp = Math.max(0, 1 - drag * dt);
      this.vx[i] *= damp; this.vy[i] *= damp; this.vz[i] *= damp;

      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;

      if (this.py[i] <= floor + 0.01 && this.vy[i] < 0) {
        if (this.kind[i] === KIND_FINE) {
          // A fine spark burns out the instant it touches down.
          this.life[i] = 0;
        } else {
          this.py[i] = floor + 0.012;
          this.vy[i] = -this.vy[i] * 0.36;
          this.vx[i] *= 0.66;
          this.vz[i] *= 0.66;
          this.bounces[i]++;
          if (this.bounces[i] >= 4 || Math.abs(this.vy[i]) < 0.35) {
            // Settled: skitter along the floor and burn out fast.
            this.vy[i] = 0;
            this.py[i] = floor + 0.012;
            this.life[i] = Math.min(this.life[i], 0.22);
          }
        }
      }

      this.life[i] -= dt;
      if (this.life[i] <= 0) this.swapRemove(i);
    }
  }

  private swapRemove(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.px[i] = this.px[last]; this.py[i] = this.py[last]; this.pz[i] = this.pz[last];
    this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last]; this.vz[i] = this.vz[last];
    this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last];
    this.size[i] = this.size[last]; this.seed[i] = this.seed[last];
    this.kind[i] = this.kind[last]; this.bounces[i] = this.bounces[last];
  }

  private writeBuffers(): void {
    const hp = this.headGeo.attributes.position as THREE.BufferAttribute;
    const hc = this.headGeo.attributes.aColor as THREE.BufferAttribute;
    const hs = this.headGeo.attributes.aSize as THREE.BufferAttribute;
    const sp = this.streakGeo.attributes.position as THREE.BufferAttribute;
    const sc = this.streakGeo.attributes.color as THREE.BufferAttribute;

    const hpa = hp.array as Float32Array;
    const hca = hc.array as Float32Array;
    const hsa = hs.array as Float32Array;
    const spa = sp.array as Float32Array;
    const sca = sc.array as Float32Array;

    const n = this.count;
    for (let i = 0; i < n; i++) {
      const t = this.life[i] / this.maxLife[i];
      sampleRamp(t, _col);

      // Sparks twinkle: a per-particle phase makes the spray shimmer instead of dissolving
      // uniformly, which is most of what sells "hot metal" at 60 fps.
      const fine = this.kind[i] === KIND_FINE;
      const twinkle = fine ? 0.55 + 0.45 * Math.sin(this.seed[i] + (1 - t) * 34) : 1;
      // HDR: a fresh fine spark peaks around 7 linear, well past the 0.95 bloom gate and
      // under the 12.0 input clamp, so it clips to a white core with a tight halo.
      const bright = (fine ? 0.6 + t * t * 6.6 : 0.45 + t * 2.6) * twinkle;

      hpa[i * 3] = this.px[i];
      hpa[i * 3 + 1] = this.py[i];
      hpa[i * 3 + 2] = this.pz[i];
      hca[i * 3] = _col.x * bright;
      hca[i * 3 + 1] = _col.y * bright;
      hca[i * 3 + 2] = _col.z * bright;
      hsa[i] = this.size[i] * (0.6 + t * 0.8);

      // Streak: back along the velocity, length proportional to speed. Long trails are the
      // difference between "sparks" and "orange dust".
      const vlen = Math.sqrt(this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i] + this.vz[i] * this.vz[i]);
      const k = Math.min(0.055, 0.014 + vlen * 0.0055);
      const b = i * 6;
      spa[b] = this.px[i];
      spa[b + 1] = this.py[i];
      spa[b + 2] = this.pz[i];
      spa[b + 3] = this.px[i] - this.vx[i] * k;
      spa[b + 4] = this.py[i] - this.vy[i] * k;
      spa[b + 5] = this.pz[i] - this.vz[i] * k;

      const hb = bright * 0.8;
      sca[b] = _col.x * hb;
      sca[b + 1] = _col.y * hb;
      sca[b + 2] = _col.z * hb;
      sca[b + 3] = 0;
      sca[b + 4] = 0;
      sca[b + 5] = 0;
    }

    hp.needsUpdate = true;
    hc.needsUpdate = true;
    hs.needsUpdate = true;
    sp.needsUpdate = true;
    sc.needsUpdate = true;
    this.headGeo.setDrawRange(0, n);
    this.streakGeo.setDrawRange(0, n * 2);
    this.heads.visible = n > 0;
    this.streaks.visible = n > 0;
  }

  /** Live spark count — for perf HUDs and tests. */
  get sparkCount(): number {
    return this.count;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.headGeo.dispose();
    this.headMat.dispose();
    this.streakGeo.dispose();
    this.streakMat.dispose();
    (this.flare.material as THREE.SpriteMaterial).dispose();
    (this.core.material as THREE.SpriteMaterial).dispose();
  }
}
