/**
 * OfficeLevel — the enclosed open-plan office floorplate.
 *
 * Builds the whole ch1_office / story_1_office interior shell in one go:
 * carpeted floor, four drywall walls, a full suspended ceiling-tile grid with
 * recessed fluorescent troffers and pendant lamps, and a dense cubicle farm
 * assembled from OfficeProps.
 *
 * Everything static is merged per material (OfficeProps.mergePropsByMaterial) so
 * the entire floorplate costs a few dozen draw calls instead of several hundred.
 * Physics colliders, grindable cubicle-top edges and light positions are harvested
 * into world space BEFORE merging (merging destroys per-prop userData) and handed
 * back to the caller, which owns Rapier / GrindSystem / the light budget.
 */

import * as THREE from 'three';
import { MaterialLibrary } from '../materials/MaterialLibrary';
import {
  makeCardboardBox,
  makeCeilingTileGrid,
  makeCorkBoard,
  makeCubiclePod,
  makeExitSign,
  makeFilingCabinet,
  makeFluorescentPanel,
  makePendantLamp,
  makePottedPlant,
  makePrinter,
  makeScatterPaper,
  makeTrashCan,
  makeWallClock,
  makeWaterCooler,
  mergePropsByMaterial,
  type GrindEdge,
  type LightHint,
  type PropCollider,
} from './OfficeProps';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OfficeCollider {
  position: THREE.Vector3;
  halfExtents: THREE.Vector3;
  rotationY: number;
}

export interface OfficeRail {
  start: THREE.Vector3;
  end: THREE.Vector3;
}

/** An axis-aligned XZ rectangle that must stay free of props. */
export interface KeepClearRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface OfficeInterior {
  /** Add this to the scene. Contains every static mesh of the floorplate. */
  root: THREE.Group;
  /**
   * The suspended ceiling batch. Hide it when the camera climbs above the
   * ceiling plane (see OfficeInterior.setCameraHeight) — otherwise an overhead
   * shot sees the backfaces of the tiles and a floating T-bar grid.
   */
  ceiling: THREE.Group;
  /** Roof-cutaway helper. Call once per frame with the camera's world Y. */
  setCameraHeight(y: number): void;
  /** Feed to physics.createStaticBox(position, halfExtents, new Euler(0, rotationY, 0)). */
  colliders: OfficeCollider[];
  /** Feed to grindSystem.addRail(start, end). Cubicle-panel tops at y = 1.40. */
  rails: OfficeRail[];
  /** Already parented under `root`. Kept out of the merge so they stay movable. */
  lights: THREE.PointLight[];
  size: { width: number; depth: number; height: number };
  triangles: number;
}

export interface OfficeInteriorOptions {
  width?: number;
  depth?: number;
  /** Underside of the suspended ceiling, metres. */
  height?: number;
  seed?: number;
  /** Areas the level data already owns (ramps, fun box, stairs, spawn). */
  keepClear?: KeepClearRect[];
  /** Max point lights created from pendant lamps. */
  lightBudget?: number;
}

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers — every geometry we author carries uv1, because several
// MaterialLibrary surfaces bind an aoMap and three r162 samples aoMap from uv1.
// ---------------------------------------------------------------------------

function withUV1(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = g.getAttribute('uv');
  if (uv && !g.getAttribute('uv1')) g.setAttribute('uv1', uv.clone());
  return g;
}

function plane(w: number, h: number): THREE.BufferGeometry {
  return withUV1(new THREE.PlaneGeometry(w, h));
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return withUV1(new THREE.BoxGeometry(w, h, d));
}

// ---------------------------------------------------------------------------
// Build accumulator
// ---------------------------------------------------------------------------

interface Acc {
  staticProps: THREE.Object3D[];
  ceilingProps: THREE.Object3D[];
  colliders: OfficeCollider[];
  rails: OfficeRail[];
  lightSpots: { pos: THREE.Vector3; hint: LightHint }[];
}

interface PlaceOpts {
  /** false = skip, true = all, number = first N colliders only. */
  collide?: boolean | number;
  grind?: boolean;
  lights?: boolean;
  /** Put the prop in the ceiling batch (never casts shadows). */
  ceiling?: boolean;
}

const ROT_X = (ox: number, oz: number, c: number, s: number) => ox * c + oz * s;
const ROT_Z = (ox: number, oz: number, c: number, s: number) => -ox * s + oz * c;

function place(
  acc: Acc,
  prop: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  rotY = 0,
  o: PlaceOpts = {},
): void {
  prop.position.set(x, y, z);
  prop.rotation.y = rotY;

  const c = Math.cos(rotY);
  const s = Math.sin(rotY);

  const collide = o.collide ?? true;
  if (collide !== false) {
    const list = (prop.userData.colliders as PropCollider[] | undefined) ?? [];
    const limit = typeof collide === 'number' ? Math.min(collide, list.length) : list.length;
    for (let i = 0; i < limit; i++) {
      const col = list[i];
      acc.colliders.push({
        position: new THREE.Vector3(
          x + ROT_X(col.offset[0], col.offset[2], c, s),
          y + col.offset[1],
          z + ROT_Z(col.offset[0], col.offset[2], c, s),
        ),
        halfExtents: new THREE.Vector3(col.size[0] / 2, col.size[1] / 2, col.size[2] / 2),
        rotationY: rotY + (col.rotationY ?? 0),
      });
    }
  }

  if (o.grind) {
    const edges = (prop.userData.grindEdges as GrindEdge[] | undefined) ?? [];
    for (const e of edges) {
      acc.rails.push({
        start: new THREE.Vector3(
          x + ROT_X(e.start[0], e.start[2], c, s),
          y + e.start[1],
          z + ROT_Z(e.start[0], e.start[2], c, s),
        ),
        end: new THREE.Vector3(
          x + ROT_X(e.end[0], e.end[2], c, s),
          y + e.end[1],
          z + ROT_Z(e.end[0], e.end[2], c, s),
        ),
      });
    }
  }

  if (o.lights) {
    const hints = (prop.userData.lightHints as LightHint[] | undefined) ?? [];
    for (const h of hints) {
      acc.lightSpots.push({
        pos: new THREE.Vector3(
          x + ROT_X(h.offset[0], h.offset[2], c, s),
          y + h.offset[1],
          z + ROT_Z(h.offset[0], h.offset[2], c, s),
        ),
        hint: h,
      });
    }
  }

  (o.ceiling ? acc.ceilingProps : acc.staticProps).push(prop);
}

function blocked(rects: KeepClearRect[], x: number, z: number, halfX: number, halfZ: number): boolean {
  for (const r of rects) {
    if (x + halfX > r.minX && x - halfX < r.maxX && z + halfZ > r.minZ && z - halfZ < r.maxZ) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const POD_SIZE = 4.4;    // makeCubiclePod footprint
const POD_PITCH = 5.7;   // 1.3 m service aisles between pods
const RUNWAY_HALF = 5.2; // half-width of the main skate aisle (X only)
const TILE = 1.22;       // ceiling module

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildOfficeInterior(opts: OfficeInteriorOptions = {}): OfficeInterior {
  const W = opts.width ?? 68;
  const D = opts.depth ?? 68;
  const H = opts.height ?? 3.25;
  const halfW = W / 2;
  const halfD = D / 2;
  const keepClear = opts.keepClear ?? [];
  const lightBudget = opts.lightBudget ?? 8;
  const rng = mulberry32((opts.seed ?? 20260730) >>> 0);
  const rand = (a: number, b: number) => a + rng() * (b - a);
  const chance = (p: number) => rng() < p;

  const root = new THREE.Group();
  root.name = 'OfficeInterior';

  const acc: Acc = { staticProps: [], ceilingProps: [], colliders: [], rails: [], lightSpots: [] };

  // ---------------------------------------------------------------- shell ---
  // Floor: commercial loop-pile carpet, one tile per 2 m.
  const floor = new THREE.Mesh(
    plane(W, D),
    // The carpet map is authored as a neutral greige so the key light supplies
    // the tan. Indoors the key is cool, so tint it warm here instead.
    MaterialLibrary.get('officeCarpet', { repeat: [W / 2.6, D / 2.6], color: 0xcbb794 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.castShadow = false;
  floor.name = 'officeFloor';
  root.add(floor);

  // Walls: inward-facing planes (the camera is always inside) + a skirting board.
  const wallMat = MaterialLibrary.get('drywall', { repeat: [W / 4, H / 2.6] });
  const skirtMat = MaterialLibrary.get('cubicleTrim', { repeat: [W / 2, 1] });
  const wallSpecs: { w: number; x: number; z: number; rotY: number }[] = [
    { w: W, x: 0, z: -halfD, rotY: 0 },            // faces +Z
    { w: W, x: 0, z: halfD, rotY: Math.PI },       // faces -Z
    { w: D, x: -halfW, z: 0, rotY: Math.PI / 2 },  // faces +X
    { w: D, x: halfW, z: 0, rotY: -Math.PI / 2 },  // faces -X
  ];
  for (const spec of wallSpecs) {
    const wall = new THREE.Mesh(plane(spec.w, H), wallMat);
    wall.position.set(spec.x, H / 2, spec.z);
    wall.rotation.y = spec.rotY;
    wall.receiveShadow = true;
    wall.castShadow = false;
    root.add(wall);

    const skirt = new THREE.Mesh(box(spec.w, 0.14, 0.06), skirtMat);
    skirt.position.set(
      spec.x + Math.sin(spec.rotY) * 0.03,
      0.07,
      spec.z + Math.cos(spec.rotY) * 0.03,
    );
    skirt.rotation.y = spec.rotY;
    skirt.receiveShadow = true;
    skirt.castShadow = false;
    root.add(skirt);

    // Solid wall collider just inside the visible plane.
    const nx = Math.sin(spec.rotY);
    const nz = Math.cos(spec.rotY);
    acc.colliders.push({
      position: new THREE.Vector3(spec.x - nx * 0.3, H / 2 + 1.0, spec.z - nz * 0.3),
      halfExtents: new THREE.Vector3(spec.w / 2, H / 2 + 1.0, 0.3),
      rotationY: spec.rotY,
    });
  }

  // -------------------------------------------------------------- ceiling ---
  const ceiling = makeCeilingTileGrid(W, D);
  place(acc, ceiling, 0, H, 0, 0, { collide: false, ceiling: true });

  // Recessed troffers on a 3-tile pitch, snapped to the tile grid. The refs put
  // a troffer every few metres; a sparser grid leaves the near ceiling bare.
  const panelPitch = TILE * 3;
  const panelCountX = Math.floor(W / panelPitch);
  const panelCountZ = Math.floor(D / panelPitch);
  for (let i = 0; i < panelCountX; i++) {
    for (let j = 0; j < panelCountZ; j++) {
      const px = (i - (panelCountX - 1) / 2) * panelPitch;
      const pz = (j - (panelCountZ - 1) / 2) * panelPitch;
      const panel = makeFluorescentPanel({ variant: 1, seed: i * 31 + j * 7 + 3 });
      place(acc, panel, px, H, pz, 0, { collide: false, ceiling: true });
    }
  }

  // Pendant lamps down the main aisle — the dark navy cones in the refs.
  for (let pz = -halfD + 5; pz < halfD - 4; pz += 6.1) {
    for (const px of [-3.2, 3.2]) {
      const lamp = makePendantLamp({ seed: Math.round(pz * 13 + px * 5) });
      place(acc, lamp, px, H, pz, 0, { collide: false, lights: true, ceiling: true });
    }
  }

  // ---------------------------------------------------------- cubicle farm ---
  // Composition is taken straight from refs/scene-office2+3: ONE main aisle
  // running the length of the plate, walled on both sides by an unbroken run of
  // cubicle panels the player grinds along, with 1.3 m service aisles between
  // pods. No big empty plaza — the refs are claustrophobic, not cavernous.
  const cols: number[] = [];
  for (let x = RUNWAY_HALF + POD_SIZE / 2; x + POD_SIZE / 2 < halfW - 0.9; x += POD_PITCH) {
    cols.push(Number(x.toFixed(2)));
  }
  // Rows run the full depth with a narrow service aisle straddling z = 0.
  const rows: number[] = [];
  for (let z = POD_SIZE / 2 + 0.65; z + POD_SIZE / 2 < halfD - 0.9; z += POD_PITCH) {
    rows.push(Number(z.toFixed(2)));
  }

  let podIndex = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let ci = 0; ci < cols.length; ci++) {
        for (let ri = 0; ri < rows.length; ri++) {
          const x = sx * cols[ci];
          const z = sz * rows[ri];
          if (blocked(keepClear, x, z, POD_SIZE / 2, POD_SIZE / 2)) continue;

          // Detail falls off with distance from the aisle, not from the origin:
          // the column the player skates past is always hero detail.
          const variant = ci === 0 ? 0 : ci === 1 ? 1 : 2;
          const pod = makeCubiclePod({ variant, seed: 101 + podIndex * 7 });
          podIndex++;

          // Full desk colliders only in the aisle-facing column; outer pods get
          // just the eight panel boxes, which is all the player can ever touch.
          const collide = variant === 0 ? true : 8;
          // Cubicle tops are the hero grind line — register the two near columns.
          const grind = variant <= 1;

          // Alternate pod orientation so the doorways don't all line up.
          place(acc, pod, x, 0, z, (ci + ri) % 2 === 0 ? 0 : Math.PI / 2, { collide, grind });
        }
      }
    }
  }

  // Aisle clutter so the runway itself isn't a bare carpet strip: boxes, bins
  // and plants tucked against the cubicle run, never in the skate line.
  const aisleEdge = RUNWAY_HALF - 0.45;
  for (let z = -halfD + 6; z < halfD - 6; z += rand(3.4, 7.5)) {
    const sx = chance(0.5) ? 1 : -1;
    const x = sx * aisleEdge;
    if (blocked(keepClear, x, z, 0.6, 0.6)) continue;
    const roll = rng();
    let prop: THREE.Object3D;
    if (roll < 0.34) prop = makeCardboardBox({ variant: 1, seed: Math.round(z * 3) + 61 });
    else if (roll < 0.6) prop = makeTrashCan({ variant: 1, seed: Math.round(z * 7) + 67 });
    else if (roll < 0.82) prop = makePottedPlant({ variant: 0, seed: Math.round(z * 11) + 71 });
    else prop = makePrinter({ variant: 1, seed: Math.round(z * 13) + 73 });
    place(acc, prop, x, 0, z, rand(0, Math.PI * 2), { collide: true });
  }

  // ------------------------------------------------------- perimeter dress ---
  // Filing cabinet runs backed onto the walls, printers and coolers in the gaps.
  const wallRuns: { nx: number; nz: number; along: 'x' | 'z'; base: number }[] = [
    { nx: 0, nz: 1, along: 'x', base: -halfD + 0.34 },
    { nx: 0, nz: -1, along: 'x', base: halfD - 0.34 },
    { nx: 1, nz: 0, along: 'z', base: -halfW + 0.34 },
    { nx: -1, nz: 0, along: 'z', base: halfW - 0.34 },
  ];

  for (const run of wallRuns) {
    const yaw = Math.atan2(run.nx, run.nz); // face into the room
    const span = run.along === 'x' ? W : D;
    for (let t = -span / 2 + 2.2; t < span / 2 - 2.2; t += rand(0.95, 3.4)) {
      const x = run.along === 'x' ? t : run.base;
      const z = run.along === 'x' ? run.base : t;
      if (blocked(keepClear, x, z, 0.7, 0.7)) continue;

      const roll = rng();
      let prop: THREE.Object3D;
      if (roll < 0.52) {
        prop = makeFilingCabinet({ variant: 1, seed: Math.round(t * 17) + 5 });
      } else if (roll < 0.66) {
        prop = makeCardboardBox({ variant: 1, seed: Math.round(t * 23) + 11 });
      } else if (roll < 0.76) {
        prop = makePrinter({ variant: 1, seed: Math.round(t * 29) + 13 });
      } else if (roll < 0.85) {
        prop = makePottedPlant({ variant: 0, seed: Math.round(t * 31) + 17 });
      } else if (roll < 0.93) {
        prop = makeWaterCooler({ variant: 1, seed: Math.round(t * 37) + 19 });
      } else {
        prop = makeTrashCan({ variant: 1, seed: Math.round(t * 41) + 23 });
      }
      place(acc, prop, x, 0, z, yaw + rand(-0.05, 0.05), { collide: true });

      // A stacked box on top of a cabinet reads as "moving day" like the refs.
      if (roll < 0.2 && chance(0.5)) {
        const stacked = makeCardboardBox({ variant: 1, seed: Math.round(t * 43) + 29 });
        place(acc, stacked, x + rand(-0.1, 0.1), 1.32, z + rand(-0.1, 0.1), rand(0, Math.PI), {
          collide: false,
        });
      }
    }

    // Wall furniture: cork boards, clocks, exit signs.
    const wallY = 1.75;
    for (let t = -span / 2 + 6; t < span / 2 - 6; t += rand(7, 13)) {
      const x = run.along === 'x' ? t : run.base - run.nx * 0.28;
      const z = run.along === 'x' ? run.base - run.nz * 0.28 : t;
      const roll = rng();
      if (roll < 0.55) {
        place(acc, makeCorkBoard({ seed: Math.round(t * 11) + 3 }), x, wallY, z, yaw, {
          collide: false,
        });
      } else if (roll < 0.8) {
        place(acc, makeWallClock({ seed: Math.round(t * 13) + 7 }), x, 2.35, z, yaw, {
          collide: false,
        });
      } else {
        place(acc, makeExitSign({ seed: Math.round(t * 19) + 9 }), x, 2.72, z, yaw, {
          collide: false,
          lights: true,
        });
      }
    }
  }

  // Loose paperwork blown across the floor — the signature of both refs.
  const paper = makeScatterPaper(220, W - 4, D - 4, { seed: 7 });
  paper.traverse((o) => {
    o.castShadow = false;
  });
  place(acc, paper, 0, 0, 0, 0, { collide: false });

  // -------------------------------------------------------------- lighting ---
  // Props never make lights; we pick the ones closest to the play space.
  const lights: THREE.PointLight[] = [];
  acc.lightSpots.sort((a, b) => a.pos.lengthSq() - b.pos.lengthSq());
  for (const spot of acc.lightSpots.slice(0, lightBudget)) {
    const l = new THREE.PointLight(spot.hint.color, spot.hint.intensity * 0.55, spot.hint.distance * 0.8, 2);
    l.position.copy(spot.pos);
    l.castShadow = false;
    root.add(l);
    lights.push(l);
  }

  // ----------------------------------------------------------------- merge ---
  const floorBatch = mergePropsByMaterial(acc.staticProps);
  floorBatch.name = 'officeFloorProps';
  root.add(floorBatch);

  const ceilingBatch = mergePropsByMaterial(acc.ceilingProps);
  ceilingBatch.name = 'officeCeiling';
  ceilingBatch.traverse((o) => {
    o.castShadow = false;
  });
  root.add(ceilingBatch);

  let triangles = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const g = m.geometry;
    const attr = g.getAttribute('position');
    if (!attr) return;
    const tris = g.index ? g.index.count / 3 : attr.count / 3;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    triangles += tris * inst;
  });

  return {
    root,
    ceiling: ceilingBatch,
    setCameraHeight(y: number) {
      const inside = y < H - 0.15;
      if (ceilingBatch.visible !== inside) ceilingBatch.visible = inside;
      for (const l of lights) l.visible = inside;
    },
    colliders: acc.colliders,
    rails: acc.rails,
    lights,
    size: { width: W, depth: D, height: H },
    triangles: Math.round(triangles),
  };
}

/** Free the geometry this build owns. Materials belong to MaterialLibrary. */
export function disposeOfficeInterior(o: OfficeInterior): void {
  o.root.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.isMesh && m.geometry) m.geometry.dispose();
  });
  o.root.clear();
  o.colliders.length = 0;
  o.rails.length = 0;
  o.lights.length = 0;
}
