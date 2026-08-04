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

const _startLocal = new THREE.Vector3();
const _endLocal = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();

export class SpeedLines {
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;
  private lineSegments: THREE.LineSegments;
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
  private readonly SPAWN_RATE = 260;     // lines/second at full intensity

  private spawnAccumulator = 0;
  private currentIntensity = 0;          // 0-1, smoothed
  private rawSpeed = 0;

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LINES * 6), 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_LINES * 6), 3));

    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,   // always on top
    });

    this.lineSegments = new THREE.LineSegments(this.geometry, this.material);
    this.lineSegments.frustumCulled = false;
    this.lineSegments.renderOrder = 999;
  }

  getMesh(): THREE.LineSegments {
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
    const minRadius = 0.62 - intensity * 0.28;
    const radiusT = Math.pow(Math.random(), 0.5);   // bias toward the outer edge
    const radius = minRadius + radiusT * (1.06 - minRadius);

    // Derive the extent from the LIVE camera so the streaks stay pinned to the frame edge
    // through the whole speed-driven FOV ramp instead of drifting inward as the lens widens.
    const distance = 2;
    const cam = this.camera as THREE.PerspectiveCamera;
    const halfH = cam.isPerspectiveCamera
      ? distance * Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5)
      : 1.1;
    const halfW = halfH * (cam.isPerspectiveCamera ? cam.aspect : 1.78);

    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    this.lx[i] = ca * radius * halfW;
    this.ly[i] = sa * radius * halfH;
    this.lz[i] = distance;

    // Streaks rush INWARD and past the camera; faster at high intensity.
    const inward = (7 + Math.random() * 5) * (0.7 + intensity * 1.1);
    this.vx[i] = -ca * inward;
    this.vy[i] = -sa * inward;
    this.vz[i] = inward * 0.55;

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
      if (this.life[i] <= 0) this.remove(i);
    }

    this.updateGeometry();
  }

  private updateGeometry(): void {
    const positions = this.geometry.attributes.position.array as Float32Array;
    const colors = this.geometry.attributes.color.array as Float32Array;

    this.camera.getWorldPosition(_camPos);
    this.camera.getWorldQuaternion(_camQuat);

    const n = this.count;
    for (let i = 0; i < n; i++) {
      const b = i * 6;
      const lifeRatio = this.life[i] / this.maxLife[i];

      _startLocal.set(this.lx[i], this.ly[i], this.lz[i]);
      _endLocal.set(
        this.lx[i] + Math.cos(this.ang[i]) * this.len[i],
        this.ly[i] + Math.sin(this.ang[i]) * this.len[i],
        this.lz[i],
      );
      _startLocal.applyQuaternion(_camQuat).add(_camPos);
      _endLocal.applyQuaternion(_camQuat).add(_camPos);

      positions[b] = _startLocal.x;
      positions[b + 1] = _startLocal.y;
      positions[b + 2] = _startLocal.z;
      positions[b + 3] = _endLocal.x;
      positions[b + 4] = _endLocal.y;
      positions[b + 5] = _endLocal.z;

      // Brightness is superlinear in intensity and goes over 1 at the top, so the streaks
      // themselves start to halate in the bloom pass right when the player is flat out.
      const fade = lifeRatio * lifeRatio;
      const bright = fade * this.currentIntensity * (0.55 + this.currentIntensity * 1.15);

      // Inner end hot and near-white, outer end cooling to nothing: each streak has a
      // direction, so the frame reads radially instead of as a ring of even dashes.
      colors[b] = 1.00 * bright;
      colors[b + 1] = 0.97 * bright;
      colors[b + 2] = 0.92 * bright;
      colors[b + 3] = 0.22 * bright;
      colors[b + 4] = 0.20 * bright;
      colors[b + 5] = 0.18 * bright;
    }

    for (let i = n; i < MAX_LINES; i++) {
      const b = i * 6;
      positions[b] = positions[b + 3] = 0;
      positions[b + 1] = positions[b + 4] = -1000;
      positions[b + 2] = positions[b + 5] = 0;
      colors[b] = colors[b + 1] = colors[b + 2] = 0;
      colors[b + 3] = colors[b + 4] = colors[b + 5] = 0;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.lineSegments.visible = n > 0;
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
