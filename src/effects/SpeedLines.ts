/**
 * SpeedLines — the sense of velocity.
 *
 * A skate game has to sell speed in a STILL frame, and it has to sell it as a BUILD: barely
 * there at a push-around cruise, overwhelming at flat out. A linear ramp does neither — it is
 * either always on (and so reads as a constant screen texture the eye stops seeing) or always
 * off until terminal velocity.
 *
 * The response here is deliberately two-part:
 *   - a gentle toe from ~5 m/s, so pushing hard is *just* perceptible;
 *   - a steep shoulder above ~11 m/s, where the streak count, streak length, brightness AND
 *     the inner radius all move together, so the frame closes in on the player as they
 *     approach top speed.
 * Four parameters moving at once is what makes the last 30% of the speed range feel like
 * twice the speed it actually is.
 *
 * It also owns the drive signal for the post chain's radial blur / chromatic aberration
 * (`getBlurDrive()`), so the streaks and the lens distortion ramp on the same curve instead
 * of fighting each other. PostFX itself is not touched from here — Game feeds it this number.
 *
 * One draw call, one geometry, zero allocation per frame.
 */

import * as THREE from 'three';

const MAX_LINES = 112;
const VERTS_PER_LINE = 6;   // two triangles

/**
 * WHY QUADS AND NOT `LineSegments`: a GL line is ONE PIXEL wide on every desktop driver
 * (lineWidth > 1 is a no-op in core WebGL). Measured on the 1600x900 capture, forty live
 * streaks at maxColor 1.22 were mathematically present and visually invisible against a
 * bright office. A streak has to have WIDTH to read, and width has to grow with speed, so
 * each streak is a tapered camera-space quad instead.
 */
const RIBBON_VERT = /* glsl */`
attribute float aEdge;      // -1..1 across the ribbon
attribute float aFade;      // 1 at the hot end, 0 at the tail
varying float vEdge;
varying float vFade;
varying vec3 vColor;
void main() {
  vEdge = aEdge;
  vFade = aFade;
  vColor = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const RIBBON_FRAG = /* glsl */`
varying float vEdge;
varying float vFade;
varying vec3 vColor;
void main() {
  // Soft across the width, soft along the length: a streak with hard edges reads as a
  // polygon, and the eye notices polygons.
  float w = 1.0 - vEdge * vEdge;
  float a = w * w * vFade;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( vColor * a, 1.0 );
}`;

const _startLocal = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();

export class SpeedLines {
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private lineSegments: THREE.Mesh;
  private camera: THREE.Camera;

  // --- pooled line state (flat arrays, swap-removed) ------------------------
  private lx = new Float32Array(MAX_LINES);
  private ly = new Float32Array(MAX_LINES);
  private lz = new Float32Array(MAX_LINES);
  private vx = new Float32Array(MAX_LINES);
  private vy = new Float32Array(MAX_LINES);
  private vz = new Float32Array(MAX_LINES);
  private len = new Float32Array(MAX_LINES);
  private life = new Float32Array(MAX_LINES);
  private maxLife = new Float32Array(MAX_LINES);
  private ang = new Float32Array(MAX_LINES);
  private count = 0;

  // Cruise on this level sits around 9-13 m/s and tops out near 20.
  private readonly SPEED_TOE = 5.0;      // first hint of streaks
  private readonly SPEED_KNEE = 11.0;    // where the effect starts to bite
  private readonly SPEED_FULL = 19.0;    // everything maxed
  private readonly LINE_LIFETIME = 0.19;
  private readonly SPAWN_RATE = 150;     // lines/second at full intensity

  private spawnAccumulator = 0;
  private currentIntensity = 0;          // 0-1, smoothed
  private rawSpeed = 0;

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    const n = MAX_LINES * VERTS_PER_LINE;
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geometry.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.geometry.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.geometry.setDrawRange(0, 0);

    // Per-vertex constants: the two triangles of each quad, hot end -> tail.
    const edge = this.geometry.attributes.aEdge.array as Float32Array;
    const fade = this.geometry.attributes.aFade.array as Float32Array;
    for (let i = 0; i < MAX_LINES; i++) {
      const b = i * VERTS_PER_LINE;
      // tri 1: hot-left, hot-right, tail-left   tri 2: hot-right, tail-right, tail-left
      edge[b] = -1; edge[b + 1] = 1; edge[b + 2] = -1;
      edge[b + 3] = 1; edge[b + 4] = 1; edge[b + 5] = -1;
      fade[b] = 1; fade[b + 1] = 1; fade[b + 2] = 0;
      fade[b + 3] = 1; fade[b + 4] = 0; fade[b + 5] = 0;
    }

    this.material = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      vertexColors: true,
      transparent: true,
      toneMapped: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,   // always on top
      side: THREE.DoubleSide,
    });

    this.lineSegments = new THREE.Mesh(this.geometry, this.material);
    this.lineSegments.frustumCulled = false;
    this.lineSegments.renderOrder = 999;
  }

  getMesh(): THREE.Mesh {
    return this.lineSegments;
  }

  /**
   * Map raw speed to a 0-1 feel curve: flat until the toe, gentle to the knee, then steep.
   * The exponent below the knee is what keeps a normal cruise clean.
   */
  private response(speed: number): number {
    if (speed <= this.SPEED_TOE) return 0;
    if (speed <= this.SPEED_KNEE) {
      const u = (speed - this.SPEED_TOE) / (this.SPEED_KNEE - this.SPEED_TOE);
      return u * u * 0.28;                     // 0 -> 0.28, concave: barely there
    }
    const u = Math.min(1, (speed - this.SPEED_KNEE) / (this.SPEED_FULL - this.SPEED_KNEE));
    return 0.28 + Math.pow(u, 0.8) * 0.72;     // 0.28 -> 1.0, convex early: bites fast
  }

  private spawn(): void {
    if (this.count >= MAX_LINES) return;
    const i = this.count++;
    const intensity = this.currentIntensity;

    const angle = Math.random() * Math.PI * 2;

    // As speed builds the streaks encroach from the frame edge toward the centre — the
    // single strongest cue that the world is being pulled past the camera.
    const minRadius = 0.70 - intensity * 0.24;
    const radiusT = Math.pow(Math.random(), 0.5);   // bias toward the outer edge
    // Cap at 0.95 rather than 1.06: beyond ~1.0 the streak spawns OUTSIDE the frustum and
    // dies before it ever crosses the frame, which is how a 165 lines/second effect ends up
    // showing three streaks in a still.
    const radius = minRadius + radiusT * (0.95 - minRadius);

    // Derive the extent from the LIVE camera so the streaks stay pinned to the frame edge
    // through the whole speed-driven FOV ramp instead of drifting inward as the lens widens.
    //
    // THE Z SIGN IS NOT COSMETIC. Camera space in three.js looks down NEGATIVE Z. Every
    // previous version of this file placed the streaks at z = +2 — i.e. two metres BEHIND
    // the lens — so they projected past the far plane (measured NDC z = 1.245) and were
    // clipped. The effect has been running, spawning and updating for its whole life while
    // drawing nothing. This is why "speed lines" never showed up in any capture.
    const distance = -2;
    const cam = this.camera as THREE.PerspectiveCamera;
    const halfH = cam.isPerspectiveCamera
      ? Math.abs(distance) * Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5)
      : 1.1;
    const halfW = halfH * (cam.isPerspectiveCamera ? cam.aspect : 1.78);

    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    this.lx[i] = ca * radius * halfW;
    this.ly[i] = sa * radius * halfH;
    this.lz[i] = distance;   // negative: in FRONT of the camera

    // Streaks rush INWARD and toward the lens; faster at high intensity. +Z here means
    // "closer to the camera", since the streak plane sits at negative z.
    const inward = (7 + Math.random() * 5) * (0.7 + intensity * 1.1);
    this.vx[i] = -ca * inward;
    this.vy[i] = -sa * inward;
    this.vz[i] = inward * 0.30;

    this.len[i] = (0.11 + intensity * intensity * 0.52) * (0.75 + Math.random() * 0.5);
    const ml = this.LINE_LIFETIME * (0.75 + Math.random() * 0.5);
    this.life[i] = ml;
    this.maxLife[i] = ml;
    this.ang[i] = angle;
  }

  private remove(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.lx[i] = this.lx[last]; this.ly[i] = this.ly[last]; this.lz[i] = this.lz[last];
    this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last]; this.vz[i] = this.vz[last];
    this.len[i] = this.len[last]; this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last]; this.ang[i] = this.ang[last];
  }

  /**
   * @param dt         seconds
   * @param speed      horizontal player speed, m/s
   * @param isGrounded airborne gets a bonus: leaving the floor should feel faster
   */
  update(dt: number, speed: number, isGrounded: boolean): void {
    this.rawSpeed = speed;
    const targetIntensity = this.response(speed);

    // Attack faster than release, so accelerating reads as an event and slowing down glides.
    const k = targetIntensity > this.currentIntensity ? 9 : 3.5;
    this.currentIntensity += (targetIntensity - this.currentIntensity) * Math.min(1, k * dt);

    if (this.currentIntensity > 0.03) {
      const airBonus = isGrounded ? 1 : 1.35;
      const rate = this.SPAWN_RATE * Math.pow(this.currentIntensity, 1.3) * airBonus;
      this.spawnAccumulator += dt * rate;
      let budget = 24;
      while (this.spawnAccumulator >= 1 && budget-- > 0) {
        this.spawnAccumulator -= 1;
        this.spawn();
      }
      if (this.spawnAccumulator > 40) this.spawnAccumulator = 0;
    } else {
      this.spawnAccumulator = 0;
    }

    for (let i = this.count - 1; i >= 0; i--) {
      this.lx[i] += this.vx[i] * dt;
      this.ly[i] += this.vy[i] * dt;
      this.lz[i] += this.vz[i] * dt;
      this.life[i] -= dt;
      // Retire before a streak can cross the lens plane and wrap around behind the camera.
      if (this.life[i] <= 0 || this.lz[i] > -0.45) this.remove(i);
    }

    this.updateGeometry();
  }

  private updateGeometry(): void {
    const positions = this.geometry.attributes.position.array as Float32Array;
    const colors = this.geometry.attributes.color.array as Float32Array;

    this.camera.getWorldPosition(_camPos);
    this.camera.getWorldQuaternion(_camQuat);

    // Streak width grows with intensity: at a cruise these are hairlines, flat out they are
    // bars. Width is in camera-space units at the reference plane |z| = 2 and is scaled per
    // streak by its own depth, so a streak sweeping past the lens keeps a roughly constant
    // SCREEN width instead of ballooning into a white slab.
    const halfW = 0.003 + this.currentIntensity * this.currentIntensity * 0.010;

    const n = this.count;
    for (let i = 0; i < n; i++) {
      const b = i * VERTS_PER_LINE;
      const lifeRatio = this.life[i] / this.maxLife[i];
      const ca = Math.cos(this.ang[i]);
      const sa = Math.sin(this.ang[i]);
      // Perpendicular to the streak, in the camera plane.
      const wScale = Math.min(1.6, Math.abs(this.lz[i]) * 0.5);
      const nx = -sa * halfW * wScale;
      const ny = ca * halfW * wScale;

      // Hot (inner) end and tail (outer) end.
      const hx = this.lx[i], hy = this.ly[i], hz = this.lz[i];
      const tx = hx + ca * this.len[i];
      const ty = hy + sa * this.len[i];

      // 0: hot-left  1: hot-right  2: tail-left  3: hot-right  4: tail-right  5: tail-left
      this.writeVert(positions, b + 0, hx - nx, hy - ny, hz);
      this.writeVert(positions, b + 1, hx + nx, hy + ny, hz);
      this.writeVert(positions, b + 2, tx - nx, ty - ny, hz);
      this.writeVert(positions, b + 3, hx + nx, hy + ny, hz);
      this.writeVert(positions, b + 4, tx + nx, ty + ny, hz);
      this.writeVert(positions, b + 5, tx - nx, ty - ny, hz);

      // Brightness is superlinear in intensity and goes over 1 at the top, so the streaks
      // themselves start to halate in the bloom pass right when the player is flat out.
      const f = lifeRatio * lifeRatio;
      const bright = f * this.currentIntensity * (0.35 + this.currentIntensity * 0.85);
      for (let v = 0; v < VERTS_PER_LINE; v++) {
        const c = (b + v) * 3;
        colors[c] = 1.00 * bright;
        colors[c + 1] = 0.97 * bright;
        colors[c + 2] = 0.92 * bright;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.setDrawRange(0, n * VERTS_PER_LINE);
    this.lineSegments.visible = n > 0;
  }

  /** Camera-space vertex -> world, using the scratch vectors. */
  private writeVert(out: Float32Array, index: number, x: number, y: number, z: number): void {
    _startLocal.set(x, y, z).applyQuaternion(_camQuat).add(_camPos);
    const o = index * 3;
    out[o] = _startLocal.x;
    out[o + 1] = _startLocal.y;
    out[o + 2] = _startLocal.z;
  }

  /** Current streak intensity, 0-1. */
  getIntensity(): number {
    return this.currentIntensity;
  }

  /**
   * Drive value for the post chain's radial blur / CA, on the SAME curve as the streaks so
   * the two effects arrive together. Weighted toward the streak intensity but keeping a
   * little raw-speed floor, so a boost that pins intensity still tracks actual velocity.
   */
  getBlurDrive(): number {
    const raw = Math.max(0, Math.min(1, (this.rawSpeed - this.SPEED_TOE) / (this.SPEED_FULL - this.SPEED_TOE)));
    return Math.max(0, Math.min(1, this.currentIntensity * 0.75 + raw * 0.35));
  }

  /** Force the streaks on — used by speed boosts, decays back on its own. */
  setIntensity(intensity: number): void {
    this.currentIntensity = Math.max(this.currentIntensity, Math.max(0, Math.min(1, intensity)));
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
