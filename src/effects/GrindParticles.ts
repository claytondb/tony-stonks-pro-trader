/**
 * GrindParticles — the sparks.
 *
 * refs/scene-office3.png sells the whole grind on one thing: a dense orange spray of sparks
 * painting a hot streak along the cubicle cap, with a bright core at the contact point and
 * embers skittering away across the carpet. The previous implementation was 100 flat
 * `PointsMaterial` dots at a fixed 0.15 screen size with a two-stop colour ramp, which at
 * gameplay distance read as a handful of pale specks.
 *
 * This version is built as three layers, three draw calls total:
 *   1. STREAKS  — a LineSegments pass drawing each spark from its position back along its own
 *                 velocity. Motion streaks are what make sparks read as sparks rather than as
 *                 dust, and they are essentially free.
 *   2. HEADS    — an additive Points pass with a procedural radial-glow sprite and per-particle
 *                 size, so a spark has a hot core and a soft bloom skirt for PostFX to catch.
 *   3. FLARE    — a single camera-facing quad pinned to the contact point, which is the bright
 *                 anchor the eye actually locks onto.
 *
 * Colour runs a real blackbody-ish ramp: white-hot 0xfff4d2 -> 0xffa020 -> deep 0x8c2408, so the
 * spray has internal value range instead of being one flat orange.
 */

import * as THREE from 'three';

interface Spark {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  /** Chunky embers bounce off the floor; fine sparks burn out in the air. */
  ember: boolean;
  seed: number;
}

const MAX_SPARKS = 260;

// White-hot -> orange -> ember red. Sampled by remaining-life, so a spark cools as it flies.
const RAMP: Array<[number, number, number]> = [
  [1.00, 0.96, 0.86],
  [1.00, 0.80, 0.36],
  [1.00, 0.53, 0.12],
  [0.78, 0.21, 0.05],
  [0.35, 0.06, 0.02],
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
  gl_PointSize = clamp( aSize * 320.0 / max( -mv.z, 0.15 ), 1.0, 46.0 );
}`;

const HEAD_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec3 vColor;
void main() {
  vec4 t = texture2D( uMap, gl_PointCoord );
  if ( t.a < 0.004 ) discard;
  gl_FragColor = vec4( vColor * t.a, 1.0 );
}`;

export class GrindParticles {
  private sparks: Spark[] = [];
  private scene: THREE.Scene;

  private headGeo: THREE.BufferGeometry;
  private headMat: THREE.ShaderMaterial;
  private heads: THREE.Points;

  private streakGeo: THREE.BufferGeometry;
  private streakMat: THREE.LineBasicMaterial;
  private streaks: THREE.LineSegments;

  private flare: THREE.Sprite;
  private flareEnergy = 0;

  private spawnAccumulator = 0;
  private readonly SPAWN_RATE = 190;   // sparks/second while grinding
  private group = new THREE.Group();
  private tmpColor = new THREE.Vector3();

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
      color: new THREE.Color(1.0, 0.72, 0.34),
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

    this.scene.add(this.group);
  }

  /**
   * Emit a burst. `direction` is the grind travel direction; sparks fire mostly BACKWARDS along
   * it in a tight cone, which is what makes the spray read as friction rather than as a fountain.
   */
  spawn(position: THREE.Vector3, direction: THREE.Vector3, count = 3): void {
    for (let i = 0; i < count && this.sparks.length < MAX_SPARKS; i++) {
      const ember = Math.random() < 0.22;
      const back = -(2.2 + Math.random() * 5.0);
      const spread = ember ? 1.4 : 2.4;

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        // Sparks leave the contact patch downward-ish and then get flung; a pure upward
        // fountain is the classic "particle system" tell.
        (Math.random() - 0.25) * 2.6 + 1.1,
        (Math.random() - 0.5) * spread,
      );
      velocity.addScaledVector(direction, back * (0.35 + Math.random() * 0.65));

      const maxLife = ember ? 0.55 + Math.random() * 0.55 : 0.16 + Math.random() * 0.22;
      this.sparks.push({
        position: position.clone().addScaledVector(direction, (Math.random() - 0.5) * 0.10),
        velocity,
        life: maxLife,
        maxLife,
        size: ember ? 0.020 + Math.random() * 0.016 : 0.010 + Math.random() * 0.014,
        ember,
        seed: Math.random() * 100,
      });
    }
  }

  update(dt: number, isGrinding: boolean, grindPosition?: THREE.Vector3, grindDirection?: THREE.Vector3): void {
    const dir = grindDirection && grindDirection.lengthSq() > 1e-6
      ? grindDirection.clone().normalize()
      : new THREE.Vector3(0, 0, -1);

    if (isGrinding && grindPosition) {
      this.spawnAccumulator += dt * this.SPAWN_RATE;
      while (this.spawnAccumulator >= 1 && this.sparks.length < MAX_SPARKS) {
        this.spawnAccumulator -= 1;
        this.spawn(grindPosition, dir, 1);
      }
      this.flareEnergy = Math.min(1, this.flareEnergy + dt * 9);
      this.flare.position.copy(grindPosition);
    } else {
      this.spawnAccumulator = 0;
      this.flareEnergy = Math.max(0, this.flareEnergy - dt * 7);
    }

    // Flicker hard: a steady glow reads as a light, a flickering one reads as friction.
    const flick = 0.62 + 0.38 * Math.sin(performance.now() * 0.055) * Math.sin(performance.now() * 0.021);
    const e = this.flareEnergy * flick;
    this.flare.visible = e > 0.02;
    if (this.flare.visible) {
      const s = 0.26 + e * 0.34;
      this.flare.scale.set(s, s, s);
      (this.flare.material as THREE.SpriteMaterial).opacity = Math.min(1, e * 1.25);
    }

    const g = -17.5 * dt;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.velocity.y += g;
      // Air drag: fine sparks decelerate hard, which is what gives the spray its cone shape.
      const drag = p.ember ? 1.4 : 4.2;
      p.velocity.multiplyScalar(Math.max(0, 1 - drag * dt));
      p.position.addScaledVector(p.velocity, dt);
      p.life -= dt;
      if (p.life <= 0) this.sparks.splice(i, 1);
    }

    this.writeBuffers();
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

    const n = this.sparks.length;
    for (let i = 0; i < n; i++) {
      const p = this.sparks[i];
      const t = p.life / p.maxLife;
      sampleRamp(t, this.tmpColor);

      // Sparks twinkle: a per-particle phase makes the spray shimmer instead of dissolving
      // uniformly, which is most of what sells "hot metal" at 60 fps.
      const twinkle = p.ember ? 1 : 0.55 + 0.45 * Math.sin(p.seed + (1 - t) * 34);
      const bright = (0.35 + t * 1.55) * twinkle;

      hpa[i * 3] = p.position.x;
      hpa[i * 3 + 1] = p.position.y;
      hpa[i * 3 + 2] = p.position.z;
      hca[i * 3] = this.tmpColor.x * bright;
      hca[i * 3 + 1] = this.tmpColor.y * bright;
      hca[i * 3 + 2] = this.tmpColor.z * bright;
      hsa[i] = p.size * (0.55 + t * 0.75);

      // Streak: back along the velocity, length proportional to speed.
      const k = Math.min(0.030, 0.016 + p.velocity.length() * 0.0022);
      const b = i * 6;
      spa[b] = p.position.x;
      spa[b + 1] = p.position.y;
      spa[b + 2] = p.position.z;
      spa[b + 3] = p.position.x - p.velocity.x * k;
      spa[b + 4] = p.position.y - p.velocity.y * k;
      spa[b + 5] = p.position.z - p.velocity.z * k;

      const hb = bright * 0.85;
      sca[b] = this.tmpColor.x * hb;
      sca[b + 1] = this.tmpColor.y * hb;
      sca[b + 2] = this.tmpColor.z * hb;
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

  dispose(): void {
    this.scene.remove(this.group);
    this.headGeo.dispose();
    this.headMat.dispose();
    this.streakGeo.dispose();
    this.streakMat.dispose();
    (this.flare.material as THREE.SpriteMaterial).dispose();
  }
}
