/**
 * PARKING LOT PANIC — the underground garage, rebuilt as a skate level.
 *
 * The old ch1_garage was eight blue boxes, three thin rails and two quarter pipes on a 100 m
 * concrete plane under open grey sky. This is a real basement level: walls, a 5.2 m concrete
 * ceiling, columns, painted bays, parked cars — and a skate line that IS the garage's own
 * circulation, because a parking level is already a loop:
 *
 *        z=+35  ╔══════════════ cooling-bank U (WrapTransition) ══════════════╗
 *               ║ north cross aisle                                            ║
 *        z=+26  ║ bays │  W aisle  │ cars ║spine║ cars │  E aisle  │ bays     ║
 *               ║ (cars)│ kicker ↑ │      ║jersey║      │ ledge ↓   │ (cars)   ║
 *               ║       │ ledge    │ ─── cross-through + ticket booth ──       ║
 *               ║       │          │      ║barrier║     │ kicker ↓  │          ║
 *        z=-26  ║ south cross aisle                                            ║
 *        z=-35  ╚═══ QP wrap ════╡ EXIT ramp ↓ (up 2.4 m) ╞═════ QP wrap ═════╝
 *                       x=-19.5                                      x=+19.5
 *
 * Ride it anticlockwise: down the west aisle over the construction kicker, along the jersey
 * ledge, carve the big U-bank across the north end, back down the east aisle, through the
 * cross-through past the ticket booth, and out up the exit ramp (the escape goal).
 *
 * Everything collides as boxes, the closed wedge/transition shells, or swept trimeshes.
 */
import * as THREE from 'three';
import { MaterialLibrary } from '../materials/MaterialLibrary';
import { makeKickerRamp, mergePropsByMaterial, rampMaterials, wedgeShell, transitionShell,
  type PropCollider, type GrindEdge } from './OfficeProps';
import { buildWrapTransition, pathArc, pathStraight, type CopingPt } from './WrapTransition';
import type { OfficeInterior, OfficeCollider, OfficeRail } from './OfficeLevel';

// ---- the plan ---------------------------------------------------------------------------
export const GARAGE = {
  X0: -19.5, X1: 19.5, Z0: -35, Z1: 35, H: 5.2,
  BAY_D: 5.0, BAY_W: 2.6,
  /** Outer bay rows x ∈ [X0, X0+5] and [X1-5, X1]; aisles 9 m; the island in the middle. */
  AISLE_W: 9.0,
  ISLAND_HALF: 5.5,
  BAY_Z0: -26, BAY_Z1: 26,
  /** The cross-through: island bays removed for z ∈ [-5.2, 5.2]. */
  CROSS_HALF: 5.2,
  EXIT_HALF: 4.0, EXIT_Z_END: -52, EXIT_RISE: 2.4, RAMP_Z0: -36, RAMP_Z1: -48,
  QP_H: 1.8, QP_D: 2.4, QP_GAP: 0.6, RC: 3.0, LEG: 2.0,
} as const;
const G = GARAGE;
const AISLE_W_X = -(G.ISLAND_HALF + G.AISLE_W / 2);   // -10
const AISLE_E_X = +(G.ISLAND_HALF + G.AISLE_W / 2);   // +10

/** Gaps for GoalSystem. */
export const GARAGE_GAPS = [
  { id: 'kicker_w', name: 'Level P1 Gap', bonus: 800, from: [AISLE_W_X, 0, -13] as [number, number, number], to: [AISLE_W_X, 0, -4] as [number, number, number], radius: 3.5 },
  { id: 'kicker_e', name: 'Ticket Line Gap', bonus: 800, from: [AISLE_E_X, 0, 13] as [number, number, number], to: [AISLE_E_X, 0, 4] as [number, number, number], radius: 3.5 },
  { id: 'north_bank', name: 'Bank Transfer', bonus: 1200, from: [-12, 0, 31] as [number, number, number], to: [12, 0, 31] as [number, number, number], radius: 6 },
  { id: 'exit_drop', name: 'Exit Ramp Ollie', bonus: 1200, from: [0, 2.9, -47] as [number, number, number], to: [0, 0.8, -37.5] as [number, number, number], radius: 4.5 },
];

/** Six letters round the loop: kicker air, ledge, bank, booth, exit. */
export const GARAGE_LETTERS: [number, number, number][] = [
  [AISLE_W_X, 1.9, -9.5],        // over the west kicker's landing
  [AISLE_W_X, 1.2, 6],           // on the west jersey ledge
  [0, 2.6, 33.2],                // up the north bank, over the coping
  [AISLE_E_X, 1.9, 9.5],         // over the east kicker's landing
  [0, 1.4, -14],                 // along the island spine barrier
  [0, 3.4, -42],                 // halfway up the exit ramp
];

export const GARAGE_CONES: [number, number, number][] = [[-3, 0, -30.5], [0, 0, -30.5], [3, 0, -30.5]];
export const GARAGE_HIDDEN: [number, number, number] = [-17.5, 2.9, 31.0];   // high in the NW corner of the bank
export const GARAGE_SPAWN = { position: [AISLE_W_X, 0.5, -22] as [number, number, number], rotationDeg: 0 };
export const GARAGE_EXIT_ZONE = { center: [0, 2.6, -49.5] as [number, number, number], radius: 4, height: 6 };

// ---- small helpers ----------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function signMat(title: string, sub: string, bg = '#123a6b', fg = '#ffffff'): THREE.MeshStandardMaterial {
  const map = canvasTex(512, 160, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 160);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, 496, 144);
    g.fillStyle = fg; g.textAlign = 'center';
    g.font = 'bold 64px Arial'; g.fillText(title, 256, sub ? 82 : 102);
    if (sub) { g.font = '28px Arial'; g.fillText(sub, 256, 128); }
  });
  return new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.35, roughness: 0.6 });
}

function hazardTex(): THREE.CanvasTexture {
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

/** Bay lines, aisle arrows, hatched no-parking, level markings — one alpha decal over the slab. */
function floorPaint(): THREE.CanvasTexture {
  const W = G.X1 - G.X0, D = G.Z1 - G.Z0;
  const px = 40;                                  // pixels per metre
  return canvasTex(Math.round(W * px), Math.round(D * px), (g) => {
    const X = (x: number) => (x - G.X0) * px, Z = (z: number) => (G.Z1 - z) * px;   // north at the top
    g.clearRect(0, 0, W * px, D * px);
    g.lineCap = 'butt';
    // Bay lines: outer rows and island rows.
    g.strokeStyle = 'rgba(236,236,228,0.85)'; g.lineWidth = 0.12 * px;
    const bayRow = (xa: number, xb: number, skip: (i: number) => boolean) => {
      for (let i = 0; i <= 20; i++) {
        const z = G.BAY_Z0 + i * G.BAY_W;
        if (skip(i) && skip(i - 1)) continue;
        g.beginPath(); g.moveTo(X(xa), Z(z)); g.lineTo(X(xb), Z(z)); g.stroke();
      }
    };
    const crossSkip = (i: number) => i >= 8 && i <= 11;
    bayRow(G.X0, G.X0 + G.BAY_D, () => false);
    bayRow(G.X1 - G.BAY_D, G.X1, () => false);
    bayRow(-G.ISLAND_HALF, -0.3, crossSkip);
    bayRow(0.3, G.ISLAND_HALF, crossSkip);
    // Aisle centre dashes (yellow) and direction arrows (white).
    g.strokeStyle = 'rgba(242,194,48,0.9)'; g.lineWidth = 0.14 * px; g.setLineDash([1.5 * px, 1.5 * px]);
    for (const ax of [AISLE_W_X, AISLE_E_X]) { g.beginPath(); g.moveTo(X(ax), Z(G.BAY_Z1)); g.lineTo(X(ax), Z(G.BAY_Z0)); g.stroke(); }
    g.beginPath(); g.moveTo(X(-14), Z(30)); g.lineTo(X(14), Z(30)); g.stroke();
    g.setLineDash([]);
    const arrow = (x: number, z: number, dirSouth: boolean) => {
      g.save(); g.translate(X(x), Z(z)); if (dirSouth) g.rotate(Math.PI);
      g.fillStyle = 'rgba(236,236,228,0.8)';
      g.fillRect(-0.18 * px, -0.2 * px, 0.36 * px, 1.6 * px);
      g.beginPath(); g.moveTo(-0.7 * px, 0); g.lineTo(0, -1.0 * px); g.lineTo(0.7 * px, 0); g.closePath(); g.fill();
      g.restore();
    };
    for (const z of [-18, 14]) { arrow(AISLE_W_X + 2.2, z, false); arrow(AISLE_E_X - 2.2, z + 4, true); }
    // Hatched no-parking under the bank ends and round the booth.
    const hatch = (x0: number, z0: number, x1: number, z1: number) => {
      g.save(); g.beginPath(); g.rect(X(x0), Z(z1), (x1 - x0) * px, (z1 - z0) * px); g.clip();
      g.strokeStyle = 'rgba(242,194,48,0.75)'; g.lineWidth = 0.1 * px;
      for (let s = -40; s < 40; s += 0.6) { g.beginPath(); g.moveTo(X(x0 + s), Z(z0)); g.lineTo(X(x0 + s + (z1 - z0)), Z(z1)); g.stroke(); }
      g.restore();
      g.strokeStyle = 'rgba(242,194,48,0.9)'; g.lineWidth = 0.1 * px; g.strokeRect(X(x0), Z(z1), (x1 - x0) * px, (z1 - z0) * px);
    };
    hatch(-3.2, -2.0, 3.2, 2.0);
    // Level markings.
    g.fillStyle = 'rgba(236,236,228,0.55)'; g.font = `bold ${Math.round(2.2 * px)}px Arial`; g.textAlign = 'center';
    g.fillText('P1', X(AISLE_W_X), Z(-28.5)); g.fillText('P1', X(AISLE_E_X), Z(29.5));
    g.font = `bold ${Math.round(1.2 * px)}px Arial`;
    g.fillText('EXIT', X(0), Z(-31.5));
  });
}

/** A low-poly parked car: extruded side profile, glass greenhouse, wheels, lamps. ~300 tris. */
const CAR_COLOURS = [0x9c2b2b, 0x2b4f8c, 0xd9d6cf, 0x2f3236, 0x6d7a80, 0x8a6a2b, 0x2f5d43, 0xb8bcc0];
function makeCar(rng: () => number, mats: { glass: THREE.Material; tyre: THREE.Material; head: THREE.Material; tail: THREE.Material }): THREE.Group {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: CAR_COLOURS[Math.floor(rng() * CAR_COLOURS.length)], metalness: 0.55, roughness: 0.35 });
  const len = 4.2 + rng() * 0.5, half = len / 2;
  const body = new THREE.Shape();
  body.moveTo(-half, 0.32); body.lineTo(-half - 0.05, 0.78); body.lineTo(-half + 0.25, 0.95);
  body.lineTo(half - 0.9, 0.95); body.lineTo(half - 0.05, 0.82); body.lineTo(half, 0.45); body.lineTo(half - 0.1, 0.32); body.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: 1.76, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  bodyGeo.translate(0, 0, -0.88); bodyGeo.rotateY(Math.PI / 2);   // profile x -> world z (nose at +z)
  const b = new THREE.Mesh(bodyGeo, paint); b.castShadow = true; b.receiveShadow = true; g.add(b);
  const back = -half + 0.55 + rng() * 0.25, front = half - 1.2;
  const gh = new THREE.Shape();
  gh.moveTo(back - 0.1, 0.95); gh.lineTo(back + 0.35, 1.42); gh.lineTo(front - 0.45, 1.42); gh.lineTo(front + 0.25, 0.95); gh.closePath();
  const ghGeo = new THREE.ExtrudeGeometry(gh, { depth: 1.56, bevelEnabled: false });
  ghGeo.translate(0, 0, -0.78); ghGeo.rotateY(Math.PI / 2);
  g.add(new THREE.Mesh(ghGeo, mats.glass));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, front - 0.45 - back - 0.35 + 0.1), paint);
  roof.position.set(0, 1.44, (back + 0.35 + front - 0.45) / 2); roof.castShadow = true; g.add(roof);
  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12); wheel.rotateZ(Math.PI / 2);
  for (const sx of [-0.8, 0.8]) for (const sz of [-half + 0.8, half - 0.8]) {
    const w = new THREE.Mesh(wheel, mats.tyre); w.position.set(sx, 0.33, sz); g.add(w);
  }
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.05), mats.head); h.position.set(sx, 0.72, half + 0.02); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.05), mats.tail); t.position.set(sx, 0.78, -half - 0.03); g.add(t);
  }
  g.userData.len = len;
  g.userData.roofZ = (back + 0.35 + front - 0.45) / 2;
  g.userData.roofLen = front - 0.45 - back - 0.35;
  return g;
}

/** Jersey barrier profile, extruded along local z. Top at 0.81 m. */
function jerseyGeo(len: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.08); s.lineTo(0.17, 0.33); s.lineTo(0.08, 0.81);
  s.lineTo(-0.08, 0.81); s.lineTo(-0.17, 0.33); s.lineTo(-0.3, 0.08); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  geo.translate(0, 0, -len / 2);
  return geo;
}

// ---- the builder --------------------------------------------------------------------------
export function buildGarageInterior(seed = 20261021): OfficeInterior {
  const rng = mulberry32(seed);
  const root = new THREE.Group(); root.name = 'garageInterior';
  const ceiling = new THREE.Group(); ceiling.name = 'garageCeiling';
  const colliders: OfficeCollider[] = [];
  const rails: OfficeRail[] = [];
  const lights: THREE.PointLight[] = [];
  const meshes: THREE.Object3D[] = [];
  const ceilMeshes: THREE.Object3D[] = [];
  const add = (o: THREE.Object3D) => { meshes.push(o); };
  const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0) =>
    colliders.push({ position: new THREE.Vector3(cx, cy, cz), halfExtents: new THREE.Vector3(hx, hy, hz), rotationY: rotY });
  const rail = (a: [number, number, number], b: [number, number, number]) =>
    rails.push({ start: new THREE.Vector3(...a), end: new THREE.Vector3(...b) });

  const W = G.X1 - G.X0, D = G.Z1 - G.Z0;
  const floorMat = MaterialLibrary.get('concreteFloor', { repeat: [W / 4, D / 4], color: 0x9a978f });
  const wallMat = MaterialLibrary.get('concreteFloor', { repeat: [6, 1.5], color: 0xa8a59c });
  const ceilMat = MaterialLibrary.get('concreteFloor', { repeat: [W / 6, D / 6], color: 0x6f6d68 });
  const colMat = MaterialLibrary.get('concreteFloor', { repeat: [0.4, 1.4], color: 0xb4b1a8 });
  const jerseyMat = MaterialLibrary.get('concreteFloor', { repeat: [2, 0.4], color: 0xc4c0b5 });
  const hazMat = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.7 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.75, roughness: 0.35 });
  const yellowSteel = new THREE.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.4, roughness: 0.45 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x7d8a6e, roughness: 0.6, metalness: 0.3 });
  const carMats = {
    glass: new THREE.MeshStandardMaterial({ color: 0x7a8c9c, metalness: 0.15, roughness: 0.12 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
    head: new THREE.MeshStandardMaterial({ color: 0xd8dde3, emissive: 0xdde6ff, emissiveIntensity: 0.05 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x7a0b0b, emissive: 0x500000, emissiveIntensity: 0.4 }),
  };

  // ---- slab, paint, ceiling --------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.002, 0); floor.receiveShadow = true; add(floor);
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: floorPaint(), transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  paint.rotation.x = -Math.PI / 2; paint.position.set(0, 0.006, 0); paint.receiveShadow = true; root.add(paint);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, G.H, 0); ceilMeshes.push(ceil);
  // Downstand beams across the ceiling every 7.8 m, and services: a sprinkler main and a duct.
  for (let z = G.BAY_Z0; z <= G.BAY_Z1 + 0.1; z += 7.8) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.55, 0.45), ceilMat);
    beam.position.set(0, G.H - 0.275, z); ceilMeshes.push(beam);
  }
  for (const x of [-G.ISLAND_HALF - 0.6, G.ISLAND_HALF + 0.6]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, D - 1, 8), pipeMat);
    p.rotation.x = Math.PI / 2; p.position.set(x, G.H - 0.7, 0); ceilMeshes.push(p);
  }
  {
    const duct = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 60), steelMat);
    duct.position.set(0, G.H - 0.85, 2); ceilMeshes.push(duct);
  }

  // ---- walls (south wall split for the exit) -------------------------------------------
  const wall = (x0: number, z0: number, x1: number, z1: number, h: number = G.H, y = 0) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.3), wallMat);
    const yaw = Math.atan2(z1 - z0, x1 - x0);
    m.rotation.y = -yaw; m.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2); m.receiveShadow = true; add(m);
    // Painted dado: the garage's grey band and yellow kerb stripe.
    box((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, len / 2, h / 2 + 0.5, 0.15, -yaw);
  };
  const t = 0.15;
  wall(G.X0 - t, G.Z0, G.X0 - t, G.Z1);
  wall(G.X1 + t, G.Z0, G.X1 + t, G.Z1);
  wall(G.X0, G.Z1 + t, G.X1, G.Z1 + t);
  wall(G.X0, G.Z0 - t, -G.EXIT_HALF, G.Z0 - t);
  wall(G.EXIT_HALF, G.Z0 - t, G.X1, G.Z0 - t);
  wall(-G.EXIT_HALF, G.Z0 - t, G.EXIT_HALF, G.Z0 - t, G.H - 3.6, 3.6);   // lintel over the exit
  // Wall paint: a dark dado band with a yellow line, all the way round (visual).
  {
    const band = new THREE.MeshStandardMaterial({ color: 0x3d4a5a, roughness: 0.8 });
    const line = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 });
    const run = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(z1 - z0, x1 - x0);
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, 0.02), band);
      b.rotation.y = -yaw; b.position.set((x0 + x1) / 2 + nx * 0.01, 0.55, (z0 + z1) / 2 + nz * 0.01); add(b);
      const l = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.025), line);
      l.rotation.y = -yaw; l.position.set((x0 + x1) / 2 + nx * 0.012, 1.16, (z0 + z1) / 2 + nz * 0.012); add(l);
    };
    run(G.X0, G.Z0, G.X0, G.Z1, 1, 0); run(G.X1, G.Z0, G.X1, G.Z1, -1, 0);
    run(G.X0, G.Z1, G.X1, G.Z1, 0, -1);
    run(G.X0, G.Z0, -G.EXIT_HALF, G.Z0, 0, 1); run(G.EXIT_HALF, G.Z0, G.X1, G.Z0, 0, 1);
  }

  // ---- columns ---------------------------------------------------------------------------
  const column = (x: number, z: number) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.55, G.H, 0.55), colMat);
    c.position.set(x, G.H / 2, z); c.castShadow = true; c.receiveShadow = true; add(c);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.2, 0.58), hazMat);
    h.position.set(x, 0.6, z); add(h);
    box(x, G.H / 2, z, 0.275, G.H / 2, 0.275);
  };
  const bayZ = (i: number) => G.BAY_Z0 + i * G.BAY_W;
  // On the bay lines BETWEEN parked cars, mid-depth — never at the aisle edge. In the first
  // cut they stood on the aisle kerb line and took a third of the swerve agent's hard hits;
  // a real garage puts them where the cars are, and so the aisles stay clean.
  for (const i of [3, 6, 10, 14, 17]) {
    column(G.X0 + G.BAY_D / 2 + 0.3, bayZ(i));
    column(G.X1 - G.BAY_D / 2 - 0.3, bayZ(i));
  }
  for (const i of [3, 6, 14, 17]) {
    column(-G.ISLAND_HALF / 2, bayZ(i));
    column(G.ISLAND_HALF / 2, bayZ(i));
  }

  // ---- parked cars -----------------------------------------------------------------------
  // Outer rows nose-in to the wall; island rows nose-in to the spine. Some bays stay empty:
  // they are how you get between the aisles and the spine ledge.
  const parkRow = (xFace: number, faceSign: number, empty: Set<number>, skipCross: boolean) => {
    for (let i = 0; i < 20; i++) {
      if (empty.has(i) || (skipCross && i >= 8 && i <= 11)) continue;
      const car = makeCar(rng, carMats);
      const len = car.userData.len as number;
      const zc = bayZ(i) + G.BAY_W / 2;
      const xc = xFace + faceSign * (0.35 + len / 2);
      car.rotation.y = faceSign > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.position.set(xc, 0, zc); add(car);
      // Body to the beltline, then the cabin: you can ollie onto a bonnet, not through a car.
      box(xc, 0.5, zc, len / 2, 0.5, 0.9);   // car length runs along x here
      const rz = car.userData.roofZ as number, rl = car.userData.roofLen as number;
      const rcx = xc + (faceSign > 0 ? rz : -rz);
      box(rcx, 1.2, zc, rl / 2 + 0.3, 0.25, 0.78);
      // Roof edges grind, THPS-style: ollie up beside a car, hold E.
      for (const e of [-0.74, 0.74]) rail([rcx - rl / 2 + 0.1, 1.47, zc + e], [rcx + rl / 2 - 0.1, 1.47, zc + e]);
    }
  };
  // faceSign: direction from the car's nose-end wall toward the aisle.
  parkRow(G.X0, +1, new Set([4, 11, 15]), false);
  parkRow(G.X1, -1, new Set([2, 9, 16]), false);
  parkRow(-0.3, -1, new Set([2, 5, 13, 17]), true);    // island west row, noses at the spine
  parkRow(0.3, +1, new Set([3, 6, 14, 18]), true);     // island east row

  // Wheel stops at every bay of the outer rows (visual; under step height).
  for (let i = 0; i < 20; i++) for (const [x] of [[G.X0 + 0.55], [G.X1 - 0.55]]) {
    const ws = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 1.6), jerseyMat);
    ws.position.set(x, 0.06, bayZ(i) + G.BAY_W / 2); add(ws);
  }

  // ---- the island spine: a jersey-barrier ledge each side of the cross-through -------------
  const jersey = (x: number, z0: number, z1: number) => {
    const len = z1 - z0, zc = (z0 + z1) / 2;
    const m = new THREE.Mesh(jerseyGeo(len), jerseyMat);
    m.position.set(x, 0, zc); m.castShadow = true; m.receiveShadow = true; add(m);
    box(x, 0.405, zc, 0.22, 0.405, len / 2);
    rail([x, 0.83, z0 + 0.2], [x, 0.83, z1 - 0.2]);
  };
  jersey(0, G.BAY_Z0 + 0.3, -G.CROSS_HALF - 0.3);
  jersey(0, G.CROSS_HALF + 0.3, G.BAY_Z1 - 0.3);
  // Aisle ledges: a line of barriers down each aisle after its kicker.
  jersey(AISLE_W_X, 1.5, 11.5);
  jersey(AISLE_E_X, -11.5, -1.5);

  // ---- construction kickers in the aisles ------------------------------------------------
  const placeProp = (prop: THREE.Object3D, x: number, y: number, z: number, yaw: number, grind = true) => {
    prop.position.set(x, y, z); prop.rotation.y = yaw; add(prop);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rx = (ox: number, oz: number) => ox * c + oz * s, rz = (ox: number, oz: number) => -ox * s + oz * c;
    for (const col of (prop.userData.colliders as PropCollider[] | undefined) ?? []) {
      const pos = new THREE.Vector3(x + rx(col.offset[0], col.offset[2]), y + col.offset[1], z + rz(col.offset[0], col.offset[2]));
      const he = new THREE.Vector3(col.size[0] / 2, col.size[1] / 2, col.size[2] / 2);
      if (col.type === 'wedge' || col.type === 'transition') {
        colliders.push({ position: pos, halfExtents: he, rotationY: yaw,
          trimesh: col.type === 'wedge' ? wedgeShell(col.size[0], col.size[1], col.size[2]) : transitionShell(col.size[0], col.size[1], col.size[2]) });
      } else colliders.push({ position: pos, halfExtents: he, rotationY: yaw + (col.rotationY ?? 0) });
    }
    if (grind) for (const e of (prop.userData.grindEdges as GrindEdge[] | undefined) ?? []) {
      rails.push({
        start: new THREE.Vector3(x + rx(e.start[0], e.start[2]), y + e.start[1], z + rz(e.start[0], e.start[2])),
        end: new THREE.Vector3(x + rx(e.end[0], e.end[2]), y + e.end[1], z + rz(e.end[0], e.end[2])),
      });
    }
  };
  placeProp(makeKickerRamp({ width: 2.8, depth: 1.7, height: 0.75, seed: 7301 }), AISLE_W_X, 0, -13.5, 0);
  placeProp(makeKickerRamp({ width: 2.8, depth: 1.7, height: 0.75, seed: 7302 }), AISLE_E_X, 0, 13.5, Math.PI);
  // Saw-horses either side of each kicker: a construction zone, not a skatepark.
  for (const [kx, kz] of [[AISLE_W_X, -13.5], [AISLE_E_X, 13.5]]) for (const s of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 1.4), hazMat);
    bar.position.set(kx + s * 2.0, 0.8, kz); add(bar);
    for (const dz of [-0.6, 0.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), steelMat);
      leg.position.set(kx + s * 2.0, 0.4, kz + dz); add(leg);
    }
  }

  // ---- speed bumps across the aisles (visual only: 8 cm) ---------------------------------
  for (const [ax, z] of [[AISLE_W_X, -21], [AISLE_W_X, 18], [AISLE_E_X, 21], [AISLE_E_X, -18]]) {
    const bump = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, G.AISLE_W - 0.6, 14, 1, false, -Math.PI / 2, Math.PI), hazMat);
    bump.rotation.z = Math.PI / 2; bump.scale.set(0.16, 1, 1); bump.position.set(ax, 0, z); add(bump);
  }

  // ---- the cross-through: ticket booth island --------------------------------------------
  {
    const kerbH = 0.22, ix = 3.0, iz = 1.6;
    const isl = new THREE.Mesh(new THREE.BoxGeometry(ix * 2, kerbH, iz * 2), jerseyMat);
    isl.position.set(0, kerbH / 2, 0); isl.receiveShadow = true; add(isl);
    const kerbPaint = new THREE.Mesh(new THREE.BoxGeometry(ix * 2 + 0.02, 0.08, iz * 2 + 0.02), hazMat);
    kerbPaint.position.set(0, kerbH - 0.04, 0); add(kerbPaint);
    box(0, kerbH / 2, 0, ix, kerbH / 2, iz);
    for (const s of [-1, 1]) rail([-ix + 0.2, kerbH + 0.02, s * iz], [ix - 0.2, kerbH + 0.02, s * iz]);
    // The booth: glazed hut.
    const hut = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.3, 1.6), new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.6 }));
    hut.position.set(0, kerbH + 1.15, 0); hut.castShadow = true; add(hut);
    for (const s of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.04), carMats.glass);
      win.position.set(0, kerbH + 1.5, s * 0.81); add(win);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 2.2), steelMat);
    roof.position.set(0, kerbH + 2.36, 0); add(roof);
    box(0, kerbH + 1.15, 0, 0.9, 1.15, 0.8);
    // Boom gates, raised (they were never going to stop a chair).
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 0.3), yellowSteel);
      post.position.set(s * 2.4, kerbH + 0.5, s * 1.1); add(post);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.6), hazMat);
      arm.position.set(s * 2.4, kerbH + 2.1, s * 1.1 + s * 1.2); arm.rotation.x = s * 0.95; add(arm);
    }
  }

  // ---- the banks: a U across the north wall, two halves along the south wall -----------------
  const rm = rampMaterials();
  const bankMat = MaterialLibrary.get('concreteFloor', { repeat: [1, 1], color: 0xb9b5ab });
  const smoothBank = bankMat.clone(); smoothBank.flatShading = false;
  void rm;
  const deckTo = (zWall: number, xWallW: number, xWallE: number) => (p: CopingPt) => {
    const tx = p.nx > 1e-3 ? (p.x - xWallW) / p.nx : p.nx < -1e-3 ? (xWallE - p.x) / -p.nx : 1e9;
    const tz = Math.abs(p.nz) > 1e-3 ? Math.abs(zWall - p.z) / Math.abs(p.nz) : 1e9;
    return Math.min(tx, tz);
  };
  const addWrap = (path: CopingPt[], opts: { taperStart?: number; taperEnd?: number }, zWall: number, grind: [number, number, number][]) => {
    const wrap = buildWrapTransition(path, {
      height: G.QP_H, depth: G.QP_D, taperStart: opts.taperStart, taperEnd: opts.taperEnd,
      deck: deckTo(zWall, G.X0, G.X1), uvScale: 4,
    });
    const m = new THREE.Mesh(wrap.geometry, smoothBank); m.receiveShadow = true; add(m);
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wrap.coping), 120, 0.05, 8, false), yellowSteel);
    pipe.castShadow = true; add(pipe);
    colliders.push({ position: new THREE.Vector3(0, 0, 0), halfExtents: new THREE.Vector3(W / 2, G.QP_H / 2, 2), rotationY: 0, trimesh: wrap.trimesh });
    for (let i = 0; i + 1 < grind.length; i += 2) rails.push({ start: new THREE.Vector3(...grind[i]), end: new THREE.Vector3(...grind[i + 1]) });
  };
  {
    const zc = G.Z1 - G.QP_GAP, xa = G.X0 + G.QP_GAP, xb = G.X1 - G.QP_GAP, rc = G.RC, L = G.LEG;
    const path = [
      ...pathStraight(xa, zc - rc - L, xa, zc - rc, 1, 0, 6),
      ...pathArc(xa + rc, zc - rc, rc, Math.PI, Math.PI / 2, 10),
      ...pathStraight(xa + rc, zc, xb - rc, zc, 0, -1, 16, true),
      ...pathArc(xb - rc, zc - rc, rc, Math.PI / 2, 0, 10),
      ...pathStraight(xb, zc - rc, xb, zc - rc - L, -1, 0, 6, true),
    ];
    addWrap(path, { taperStart: 3, taperEnd: 3 }, G.Z1, [[xa + rc, G.QP_H + 0.07, zc - 0.05], [xb - rc, G.QP_H + 0.07, zc - 0.05]]);
  }
  for (const side of [-1, 1]) {
    // From the exit opening (tapering out of the floor) to the outer corner and up the side wall.
    const zc = G.Z0 + G.QP_GAP, rc = G.RC, L = G.LEG;
    const xIn = side * (G.EXIT_HALF + 1.2), xOut = side * (G.X1 - G.QP_GAP);
    const cx = xOut - side * rc;
    const a0 = -Math.PI / 2, a1 = side > 0 ? 0 : -Math.PI;
    const path = [
      ...pathStraight(xIn, zc, cx, zc, 0, 1, 10),
      ...pathArc(cx, zc + rc, rc, a0, a1, 10),
      ...pathStraight(xOut, zc + rc, xOut, zc + rc + L, -side, 0, 6, true),
    ];
    addWrap(path, { taperStart: 2.5, taperEnd: 3 }, G.Z0, [[xIn + side * 2.6, G.QP_H + 0.07, zc + 0.05], [cx, G.QP_H + 0.07, zc + 0.05]]);
  }

  // ---- the exit: a corridor south through the wall, a ramp up 2.4 m, a landing and the door --
  {
    const hx = G.EXIT_HALF, z0 = G.Z0, zr0 = G.RAMP_Z0, zr1 = G.RAMP_Z1, zEnd = G.EXIT_Z_END, rise = G.EXIT_RISE;
    // Corridor walls and ceiling.
    wall(-hx - t, z0, -hx - t, zEnd); wall(hx + t, z0, hx + t, zEnd);
    wall(-hx, zEnd - t, hx, zEnd - t);
    const cc = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, z0 - zEnd), ceilMat);
    cc.rotation.x = Math.PI / 2; cc.position.set(0, G.H + rise * 0.5, (z0 + zEnd) / 2); ceilMeshes.push(cc);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, z0 - zr0), floorMat);
    fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.003, (z0 + zr0) / 2); add(fl);
    // Ramp surface as a closed wedge-ish trimesh (top, sides, end), landing deck as a box.
    const v = [
      -hx, 0, zr0, hx, 0, zr0, hx, rise, zr1, -hx, rise, zr1,      // top
      -hx, 0, zr1, hx, 0, zr1,                                      // bottom back edge
    ];
    const idx = [0, 2, 1, 0, 3, 2, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5];
    colliders.push({ position: new THREE.Vector3(0, 0, 0), halfExtents: new THREE.Vector3(hx, rise / 2, (zr0 - zr1) / 2), rotationY: 0,
      trimesh: { vertices: new Float32Array(v), indices: new Uint32Array(idx) } });
    const rampLen = Math.hypot(zr0 - zr1, rise);
    const rampMesh = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, rampLen), floorMat);
    rampMesh.rotation.x = -Math.PI / 2 - Math.atan2(rise, zr0 - zr1);
    rampMesh.position.set(0, rise / 2 + 0.004, (zr0 + zr1) / 2); add(rampMesh);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, rise, zr1 - zEnd), jerseyMat);
    deck.position.set(0, rise / 2, (zr1 + zEnd) / 2); add(deck);
    box(0, rise / 2, (zr1 + zEnd) / 2, hx, rise / 2, (zr1 - zEnd) / 2);
    // Hand rails up both sides: the down-rail every garage has.
    for (const s of [-1, 1]) {
      const x = s * (hx - 0.35);
      const a = new THREE.Vector3(x, 0.92, zr0 - 0.4), b = new THREE.Vector3(x, rise + 0.92, zr1 + 0.2);
      const len = a.distanceTo(b);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), steelMat);
      tube.position.copy(a).add(b).multiplyScalar(0.5);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); add(tube);
      for (let k = 0; k <= 3; k++) {
        const p = a.clone().lerp(b, k / 3);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.92, 6), steelMat);
        post.position.set(x, p.y - 0.46, p.z); add(post);
      }
      rails.push({ start: a.clone().setY(a.y + 0.04), end: b.clone().setY(b.y + 0.04) });
    }
    // The door out: a roller shutter half up, daylight under it.
    const day = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2 - 0.4, 2.6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1.6 }));
    day.position.set(0, rise + 1.3, zEnd + 0.02); root.add(day);
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 - 0.2, 1.4, 0.08), steelMat);
    shutter.position.set(0, rise + 3.3, zEnd + 0.1); add(shutter);
    const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), signMat('EXIT', 'Street level', '#0d6b3a'));
    exitSign.position.set(0, rise + 4.3, zEnd + 0.06); root.add(exitSign);
    const l = new THREE.PointLight(0xfff1dc, 1.2, 16, 1.8); l.position.set(0, rise + 3.4, zEnd + 3); root.add(l); lights.push(l);
    const l2 = new THREE.PointLight(0xdcf2e6, 0.8, 14, 1.8); l2.position.set(0, G.H - 0.6, (z0 + zr1) / 2); root.add(l2); lights.push(l2);
  }

  // ---- signage ---------------------------------------------------------------------------
  {
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), signMat('P1', 'Level 1  •  Max height 2.1 m'));
    s1.position.set(0, 3.0, G.Z1 - 0.18); s1.rotation.y = Math.PI; root.add(s1);
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.8), signMat('EXIT ↓', 'Pay at booth', '#0d6b3a'));
    s2.position.set(0, 4.35, G.Z0 + 0.02); root.add(s2);
    for (const [x, z, ry, text] of [[G.X0 + 0.18, 0, Math.PI / 2, 'STAIRS'], [G.X1 - 0.18, 0, -Math.PI / 2, 'LIFTS']] as [number, number, number, string][]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), signMat(text, '', '#3d4a5a'));
      s.position.set(x, 2.6, z); s.rotation.y = ry; root.add(s);
    }
  }

  // ---- strip lights over the aisles and the cross aisles ---------------------------------------
  {
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe6fff0, emissiveIntensity: 1.3 });
    const housing = new THREE.MeshStandardMaterial({ color: 0x8c918e, roughness: 0.6 });
    const strip = (x: number, z: number, along: 'x' | 'z') => {
      const geo = along === 'z' ? new THREE.BoxGeometry(0.16, 0.06, 1.5) : new THREE.BoxGeometry(1.5, 0.06, 0.16);
      const tube = new THREE.Mesh(geo, tubeMat); tube.position.set(x, G.H - 0.62, z); ceilMeshes.push(tube);
      const h = new THREE.Mesh(along === 'z' ? new THREE.BoxGeometry(0.26, 0.08, 1.6) : new THREE.BoxGeometry(1.6, 0.08, 0.26), housing);
      h.position.set(x, G.H - 0.56, z); ceilMeshes.push(h);
    };
    for (let z = G.BAY_Z0 + 2; z < G.BAY_Z1; z += 5.2) { strip(AISLE_W_X, z, 'z'); strip(AISLE_E_X, z, 'z'); }
    for (let x = -14; x <= 14; x += 5.6) { strip(x, 30.5, 'x'); strip(x, -30.5, 'x'); }
    for (const [x, z] of [[AISLE_W_X, -16], [AISLE_W_X, 8], [AISLE_E_X, 16], [AISLE_E_X, -8], [0, 30], [0, 0]]) {
      const l = new THREE.PointLight(0xdcf2e6, 0.9, 18, 1.8); l.position.set(x, G.H - 0.9, z); root.add(l); lights.push(l);
    }
  }

  // ---- merge + finish ---------------------------------------------------------------------
  root.add(mergePropsByMaterial(meshes));
  ceiling.add(mergePropsByMaterial(ceilMeshes));
  root.add(ceiling);
  let triangles = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const g = m.geometry; triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    }
  });
  const ceilY = G.H;
  return {
    root, ceiling,
    setCameraHeight(y: number) { ceiling.visible = y < ceilY + 0.5; },
    colliders, rails, movers: [], lights,
    size: { width: W, depth: D, height: G.H },
    groundHalf: Math.max(W / 2, -G.EXIT_Z_END) + 2,
    triangles: Math.round(triangles),
  };
}

/** Minimap rectangles for the garage: walls, car rows, ledges, kickers, banks, the exit. */
export function garageMinimapFootprints(): { x: number; z: number; w: number; d: number; rail: boolean }[] {
  const out: { x: number; z: number; w: number; d: number; rail: boolean }[] = [];
  const r = (x0: number, z0: number, x1: number, z1: number, rail = false) =>
    out.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: Math.abs(x1 - x0), d: Math.abs(z1 - z0), rail });
  // Walls.
  r(G.X0 - 0.3, G.Z0, G.X0, G.Z1); r(G.X1, G.Z0, G.X1 + 0.3, G.Z1);
  r(G.X0, G.Z1, G.X1, G.Z1 + 0.3);
  r(G.X0, G.Z0 - 0.3, -G.EXIT_HALF, G.Z0); r(G.EXIT_HALF, G.Z0 - 0.3, G.X1, G.Z0);
  r(-G.EXIT_HALF - 0.3, G.EXIT_Z_END, -G.EXIT_HALF, G.Z0); r(G.EXIT_HALF, G.EXIT_Z_END, G.EXIT_HALF + 0.3, G.Z0);
  // Car rows.
  r(G.X0, G.BAY_Z0, G.X0 + G.BAY_D, G.BAY_Z1); r(G.X1 - G.BAY_D, G.BAY_Z0, G.X1, G.BAY_Z1);
  r(-G.ISLAND_HALF, G.BAY_Z0, G.ISLAND_HALF, -G.CROSS_HALF); r(-G.ISLAND_HALF, G.CROSS_HALF, G.ISLAND_HALF, G.BAY_Z1);
  // Banks.
  r(G.X0, G.Z1 - G.QP_GAP - G.QP_D, G.X1, G.Z1 - G.QP_GAP);
  r(G.X0, G.Z0 + G.QP_GAP, -G.EXIT_HALF - 1.2, G.Z0 + G.QP_GAP + G.QP_D);
  r(G.EXIT_HALF + 1.2, G.Z0 + G.QP_GAP, G.X1, G.Z0 + G.QP_GAP + G.QP_D);
  // Ledges and kickers (rails drawn as rails).
  r(AISLE_W_X - 0.3, 1.5, AISLE_W_X + 0.3, 11.5, true); r(AISLE_E_X - 0.3, -11.5, AISLE_E_X + 0.3, -1.5, true);
  r(AISLE_W_X - 1.4, -14.4, AISLE_W_X + 1.4, -12.6); r(AISLE_E_X - 1.4, 12.6, AISLE_E_X + 1.4, 14.4);
  r(-3, -1.6, 3, 1.6);
  return out;
}

/**
 * Where loose knockables (bins, boxes, cones) may sit: along the aisle edges beside the parked
 * cars, never down the middle of an aisle where the kickers and ledges are.
 */
export function garageScatterOk(x: number, z: number): boolean {
  const ax = Math.abs(x);
  if (Math.abs(z) > G.BAY_Z1 - 1) return false;
  return (ax > 12.6 && ax < 13.9) || (ax > 6.1 && ax < 7.4);
}
