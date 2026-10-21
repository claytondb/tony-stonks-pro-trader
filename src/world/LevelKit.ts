/**
 * LEVEL KIT — the shared toolkit the hand-built levels (garage, story chapters) are made with.
 *
 * Every level returns an OfficeInterior (root, colliders, rails, lights …) so Game installs it
 * through one path (Game.installInterior). The kit accumulates meshes (merged by material at
 * the end), box / trimesh colliders, grind rails and point lights, and carries the helpers
 * that kept recurring: canvas signs, hazard stripes, swept banks (WrapTransition), sloped
 * slabs and railings, and props from OfficeProps with their colliders and grind edges.
 */
import * as THREE from 'three';
import { mergePropsByMaterial, wedgeShell, transitionShell, type PropCollider, type GrindEdge } from './OfficeProps';
import { buildWrapTransition, type CopingPt } from './WrapTransition';
import type { OfficeInterior, OfficeCollider, OfficeRail } from './OfficeLevel';

export type V3 = [number, number, number];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function signMat(title: string, sub = '', bg = '#123a6b', fg = '#ffffff', glow = 0.35): THREE.MeshStandardMaterial {
  const map = canvasTex(512, 160, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 160);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, 496, 144);
    g.fillStyle = fg; g.textAlign = 'center';
    g.font = 'bold 64px Arial'; g.fillText(title, 256, sub ? 82 : 102);
    if (sub) { g.font = '28px Arial'; g.fillText(sub, 256, 128); }
  });
  return new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: glow, roughness: 0.6 });
}

export function hazardTex(): THREE.CanvasTexture {
  const t = canvasTex(128, 128, (g) => {
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#1b1b1b';
    for (let i = -2; i < 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 128); g.lineTo(i * 64 + 32, 128); g.lineTo(i * 64 + 160, 0); g.lineTo(i * 64 + 128, 0); g.closePath(); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Closed box between two points along z at (possibly) different heights: a sloped slab. */
export function slabMesh(x0: number, x1: number, zA: number, yA: number, zB: number, yB: number, thick: number): { vertices: Float32Array; indices: Uint32Array } {
  const v = [
    x0, yA, zA, x1, yA, zA, x1, yB, zB, x0, yB, zB,                     // top 0..3
    x0, yA - thick, zA, x1, yA - thick, zA, x1, yB - thick, zB, x0, yB - thick, zB, // bottom 4..7
  ];
  const q = (a: number, b: number, c: number, d: number) => [a, b, c, a, c, d];
  const idx = [
    ...q(0, 3, 2, 1),            // top (normal up for zB > zA … winding is symmetric enough for Rapier)
    ...q(4, 5, 6, 7),            // bottom
    ...q(0, 1, 5, 4), ...q(2, 3, 7, 6), ...q(1, 2, 6, 5), ...q(3, 0, 4, 7),
  ];
  return { vertices: new Float32Array(v), indices: new Uint32Array(idx) };
}

export class LevelKit {
  readonly root = new THREE.Group();
  readonly ceiling = new THREE.Group();
  readonly colliders: OfficeCollider[] = [];
  readonly rails: OfficeRail[] = [];
  readonly lights: THREE.PointLight[] = [];
  private meshes: THREE.Object3D[] = [];
  private ceilMeshes: THREE.Object3D[] = [];
  /** Objects that must not be merged (transparent decals, emissive signs with their own maps). */
  private loose: THREE.Object3D[] = [];

  constructor(name: string) { this.root.name = name; this.ceiling.name = `${name}Ceiling`; }

  add(o: THREE.Object3D): THREE.Object3D { this.meshes.push(o); return o; }
  addCeil(o: THREE.Object3D): THREE.Object3D { this.ceilMeshes.push(o); return o; }
  addLoose(o: THREE.Object3D): THREE.Object3D { this.loose.push(o); return o; }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, opts: { ry?: number; rx?: number; rz?: number; cast?: boolean; receive?: boolean; ceil?: boolean } = {}): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
    m.castShadow = opts.cast ?? false; m.receiveShadow = opts.receive ?? true;
    if (opts.ceil) this.addCeil(m); else this.add(m);
    return m;
  }

  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0): void {
    this.colliders.push({ position: new THREE.Vector3(cx, cy, cz), halfExtents: new THREE.Vector3(hx, hy, hz), rotationY: rotY });
  }

  /** A visible box with a matching collider. */
  solid(mat: THREE.Material, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotY = 0, cast = true): THREE.Mesh {
    const m = this.mesh(new THREE.BoxGeometry(sx, sy, sz), mat, cx, cy, cz, { ry: rotY, cast });
    this.box(cx, cy, cz, sx / 2, sy / 2, sz / 2, rotY);
    return m;
  }

  trimesh(t: { vertices: Float32Array; indices: Uint32Array }): void {
    this.colliders.push({ position: new THREE.Vector3(0, 0, 0), halfExtents: new THREE.Vector3(1, 1, 1), rotationY: 0, trimesh: t });
  }

  rail(a: V3, b: V3): void {
    this.rails.push({ start: new THREE.Vector3(...a), end: new THREE.Vector3(...b) });
  }

  light(x: number, y: number, z: number, color = 0xfff1dc, intensity = 0.9, dist = 16): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, dist, 1.8);
    l.position.set(x, y, z); this.root.add(l); this.lights.push(l);
    return l;
  }

  /** A wall segment (box) from (x0,z0) to (x1,z1), with its collider. */
  wall(mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, h: number, y = 0, thick = 0.3): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05) return;
    const yaw = Math.atan2(z1 - z0, x1 - x0);
    this.mesh(new THREE.BoxGeometry(len, h, thick), mat, (x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, { ry: -yaw });
    this.box((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, len / 2, h / 2, thick / 2, -yaw);
  }

  /** An OfficeProps prop with its colliders and grind edges. */
  placeProp(prop: THREE.Object3D, x: number, y: number, z: number, yaw: number, grind = true, collide = true): void {
    prop.position.set(x, y, z); prop.rotation.y = yaw; this.add(prop);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rx = (ox: number, oz: number) => ox * c + oz * s, rz = (ox: number, oz: number) => -ox * s + oz * c;
    if (collide) for (const col of (prop.userData.colliders as PropCollider[] | undefined) ?? []) {
      const pos = new THREE.Vector3(x + rx(col.offset[0], col.offset[2]), y + col.offset[1], z + rz(col.offset[0], col.offset[2]));
      const he = new THREE.Vector3(col.size[0] / 2, col.size[1] / 2, col.size[2] / 2);
      if (col.type === 'wedge' || col.type === 'transition') {
        this.colliders.push({ position: pos, halfExtents: he, rotationY: yaw,
          trimesh: col.type === 'wedge' ? wedgeShell(col.size[0], col.size[1], col.size[2]) : transitionShell(col.size[0], col.size[1], col.size[2]) });
      } else this.colliders.push({ position: pos, halfExtents: he, rotationY: yaw + (col.rotationY ?? 0) });
    }
    if (grind) for (const e of (prop.userData.grindEdges as GrindEdge[] | undefined) ?? []) {
      this.rails.push({
        start: new THREE.Vector3(x + rx(e.start[0], e.start[2]), y + e.start[1], z + rz(e.start[0], e.start[2])),
        end: new THREE.Vector3(x + rx(e.end[0], e.end[2]), y + e.end[1], z + rz(e.end[0], e.end[2])),
      });
    }
  }

  /**
   * A swept bank (see WrapTransition) at floor height `y`, with a coping pipe and optional
   * grind segments (pairs of points).
   */
  bank(path: CopingPt[], o: { height: number; depth: number; taperStart?: number; taperEnd?: number; deck?: (p: CopingPt) => number; y?: number; uvScale?: number },
    mat: THREE.Material, copingMat: THREE.Material, grind: V3[] = []): void {
    const y = o.y ?? 0;
    const wrap = buildWrapTransition(path, { height: o.height, depth: o.depth, taperStart: o.taperStart, taperEnd: o.taperEnd, deck: o.deck, uvScale: o.uvScale ?? 4 });
    if (y !== 0) {
      wrap.geometry.translate(0, y, 0);
      for (let i = 1; i < wrap.trimesh.vertices.length; i += 3) wrap.trimesh.vertices[i] += y;
      for (const p of wrap.coping) p.y += y;
    }
    const m = new THREE.Mesh(wrap.geometry, mat); m.receiveShadow = true; this.add(m);
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wrap.coping), Math.max(16, path.length * 3), 0.05, 8, false), copingMat);
    pipe.castShadow = true; this.add(pipe);
    this.trimesh(wrap.trimesh);
    for (let i = 0; i + 1 < grind.length; i += 2) this.rail(grind[i], grind[i + 1]);
  }

  /** A sloped slab (ramp or flight) from (zA, yA) to (zB, yB) across x0..x1, collided. Pass a DoubleSide material. */
  slab(mat: THREE.Material, x0: number, x1: number, zA: number, yA: number, zB: number, yB: number, thick = 0.3): void {
    const t = slabMesh(x0, x1, zA, yA, zB, yB, thick);
    this.trimesh(t);
    const geo = new THREE.BufferGeometry();
    // Visual: top + underside + two long sides, with UVs in metres / 2.
    const P = t.vertices;
    const tri: number[] = [], uv: number[] = [];
    const push = (i: number, u: number, v: number) => { tri.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); uv.push(u, v); };
    const len = Math.hypot(zB - zA, yB - yA) / 2, w = (x1 - x0) / 2, th = thick / 2;
    const quad = (a: number, b: number, c: number, d: number, U: number, V: number) => {
      push(a, 0, 0); push(b, U, 0); push(c, U, V); push(a, 0, 0); push(c, U, V); push(d, 0, V);
    };
    const up = zB > zA;
    if (up) quad(0, 3, 2, 1, len, w); else quad(0, 1, 2, 3, w, len);
    if (up) quad(4, 5, 6, 7, w, len); else quad(4, 7, 6, 5, len, w);
    quad(1, 5, 6, 2, th, len); quad(0, 3, 7, 4, len, th);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('uv1', geo.getAttribute('uv'));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = true;
    this.add(m);
  }

  /**
   * A railing along a slope (posts + top tube), collided as a thin sloped wall so it keeps
   * you on the flight, grindable along its top.
   */
  railing(mat: THREE.Material, x: number, zA: number, yA: number, zB: number, yB: number, h = 1.0, grind = true, collide = true, colliderH = h): void {
    const a = new THREE.Vector3(x, yA + h, zA), b = new THREE.Vector3(x, yB + h, zB);
    const len = a.distanceTo(b);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), mat);
    tube.position.copy(a).add(b).multiplyScalar(0.5);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); tube.castShadow = true; this.add(tube);
    const n = Math.max(1, Math.round(Math.abs(zB - zA) / 2.4));
    for (let k = 0; k <= n; k++) {
      const p = a.clone().lerp(b, k / n);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 6), mat);
      post.position.set(x, p.y - h / 2, p.z); this.add(post);
    }
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), mat);
    mid.position.copy(tube.position).setY(tube.position.y - h / 2); mid.quaternion.copy(tube.quaternion); this.add(mid);
    if (collide) {
      const t = 0.06;
      const v = [
        x - t, yA, zA, x + t, yA, zA, x + t, yB, zB, x - t, yB, zB,
        x - t, yA + colliderH, zA, x + t, yA + colliderH, zA, x + t, yB + colliderH, zB, x - t, yB + colliderH, zB,
      ];
      const q = (a: number, b: number, c: number, d: number) => [a, b, c, a, c, d];
      this.trimesh({ vertices: new Float32Array(v), indices: new Uint32Array([
        ...q(0, 1, 2, 3), ...q(4, 7, 6, 5), ...q(0, 4, 5, 1), ...q(1, 5, 6, 2), ...q(2, 6, 7, 3), ...q(3, 7, 4, 0)]) });
    }
    if (grind) this.rail([x, yA + h + 0.04, zA], [x, yB + h + 0.04, zB]);
  }

  finish(size: { width: number; depth: number; height: number }, groundHalf: number, ceilingCutY = Infinity): OfficeInterior {
    if (this.meshes.length) this.root.add(mergePropsByMaterial(this.meshes));
    if (this.ceilMeshes.length) this.ceiling.add(mergePropsByMaterial(this.ceilMeshes));
    for (const o of this.loose) this.root.add(o);
    this.root.add(this.ceiling);
    let triangles = 0;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) {
        const g = m.geometry; triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      }
    });
    const ceiling = this.ceiling;
    return {
      root: this.root, ceiling,
      setCameraHeight(y: number) { ceiling.visible = y < ceilingCutY; },
      colliders: this.colliders, rails: this.rails, movers: [], lights: this.lights,
      size, groundHalf, triangles: Math.round(triangles),
    };
  }
}
