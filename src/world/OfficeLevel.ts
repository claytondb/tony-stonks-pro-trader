/**
 * OfficeLevel — the enclosed open-plan office floorplate.
 *
 * Builds the whole ch1_office / story_1_office interior shell in one go:
 * carpeted floor, four drywall walls, an outer building shell, a full suspended
 * ceiling-tile grid with recessed fluorescent troffers and pendant lamps, and a
 * dressed cubicle floorplate assembled from OfficeProps.
 *
 * ---------------------------------------------------------------------------
 * LAYOUT DOCTRINE (this is a skate level, not a floor plan)
 *
 * A Tony Hawk level has to read from the wide shot as a set of CONNECTED LINES,
 * not as a maze. The previous version was a machine-regular 8x10 lattice of
 * identical pods at a fixed pitch — every part of it looked like every other
 * part and there was nothing to navigate by. This one is built around:
 *
 *   - A SPINE running the full depth of the plate and a CROSS corridor running
 *     its full width, meeting in an open intersection at the spawn. That is the
 *     readable skate line, and it is the shape you see from any establishing
 *     camera.
 *   - CONTINUOUS cap rails down both edges of both corridors. Eight unbroken
 *     grind runs of 17 m and 17 m, not four hundred 1.8 m panel segments — the
 *     player can commit to a line and hold it, which is the whole game.
 *   - LANDMARKS at the corridor ends and in the pod field (glazed conference
 *     room, manager offices, copier bank, vending alcove) so the player can
 *     navigate by silhouette.
 *   - ACCRETION in the pod field: per-column pitch jitter, three panel heights,
 *     per-pod fabric tints, cleared-out pods full of packing boxes. Real offices
 *     are lumpy; generated ones are not.
 *
 * Everything static is merged per material (OfficeProps.mergePropsByMaterial) so
 * the entire floorplate costs a few dozen draw calls instead of several hundred.
 * Physics colliders, grindable edges and light positions are harvested into world
 * space BEFORE merging (merging destroys per-prop userData) and handed back to the
 * caller, which owns Rapier / GrindSystem / the light budget.
 */

import * as THREE from 'three';
import { MaterialLibrary, LIGHT_POOL_OFFICE } from '../materials/MaterialLibrary';
import { makeFloorWear, type DecalPlacement } from './FloorDecals';
import {
  makeBoxStack,
  makeCardboardBox,
  makeCeilingTileGrid,
  makeConferenceBox,
  makeCopier,
  makeCorkBoard,
  makeCubiclePod,
  makeCubicleWall,
  makeExitSign,
  makeFilingCabinet,
  makeFireExtinguisher,
  makeFluorescentPanel,
  makeKickerRamp,
  makeManagerOffice,
  makePendantLamp,
  makePottedPlant,
  makePrinter,
  makeScatterPaper,
  makeTrashCan,
  makeVendingMachine,
  makeWallClock,
  makeWaterCooler,
  makeWhiteboard,
  mergePropsByMaterial,
  PANEL_HEIGHTS,
  POD_FABRIC_TINTS,
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
   * The suspended ceiling batch. Hidden when the camera climbs above the ceiling
   * plane (see OfficeInterior.setCameraHeight) so an overhead camera can see the
   * floorplate. What it reveals is the building shell, never the clear colour.
   */
  ceiling: THREE.Group;
  /** Roof-cutaway helper. Call once per frame with the camera's world Y. */
  setCameraHeight(y: number): void;
  /** Feed to physics.createStaticBox(position, halfExtents, new Euler(0, rotationY, 0)). */
  colliders: OfficeCollider[];
  /** Feed to grindSystem.addRail(start, end). */
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
  /** Max point lights created from pendant lamps and lit fixtures. */
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
  /** Places paper is likely to have blown to: ramp feet, rail ends, pod corners. */
  paperSeeds: { x: number; z: number; radius?: number }[];
  wear: DecalPlacement[];
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

const POD_SIZE = 4.4;      // makeCubiclePod footprint
const POD_PITCH = 5.7;     // 1.3 m service aisles between pods
const SPINE_HALF = 5.2;    // half-width of the main skate spine (runs along Z)
const CROSS_HALF = 4.6;    // half-depth of the cross corridor (runs along X)
const WALL_GAP = 0.36;     // service gap between a corridor wall and the pods behind it
const TILE = 1.22;         // ceiling module
const WALL_SEG = 5.7;      // corridor-wall panel length

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
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

  const root = new THREE.Group();
  root.name = 'OfficeInterior';

  const acc: Acc = {
    staticProps: [],
    ceilingProps: [],
    colliders: [],
    rails: [],
    lightSpots: [],
    paperSeeds: [],
    wear: [],
  };

  // ---------------------------------------------------------------- shell ---
  // Floor: commercial loop-pile carpet.
  //
  // The repeat stays at one map tile per 2.6 m ON PURPOSE: MaterialLibrary's officeCarpet
  // spec applies repeatScale 2.9 on top, which lands the real loop pile at ~0.9 m per tile.
  // Multiplying here as well would put the pile frequency into moire territory.
  //
  // The tint is a stop darker than it was. The carpet is the largest surface in every frame
  // and at 0xcbb794 it was the BRIGHTEST large surface on screen, which flattened every
  // cubicle and desk against it. Pushing it down widens the value range the whole level
  // is composed in, and warming it widens the warm/cool split against the slate panels.
  const floor = new THREE.Mesh(
    plane(W, D),
    MaterialLibrary.get('officeCarpet', { repeat: [W / 2.6, D / 2.6], color: 0xb99a6c }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.castShadow = false;
  floor.name = 'officeFloor';
  root.add(floor);

  // Phase-lock the carpet shader's fluorescent light-pool overlay to the troffer grid this
  // build actually lays down (see the ceiling section). Without this the pools drift out of
  // phase with the fixtures and read as a texture artifact rather than as light.
  const panelPitch = TILE * 3;
  const panelCountX = Math.floor(W / panelPitch);
  const panelCountZ = Math.floor(D / panelPitch);
  MaterialLibrary.setInteriorLightPool({
    ...LIGHT_POOL_OFFICE,
    pitch: panelPitch,
    offset: [
      ((panelCountX - 1) / 2) * panelPitch + panelPitch / 2,
      ((panelCountZ - 1) / 2) * panelPitch + panelPitch / 2,
    ],
  });

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

  // ---------------------------------------------------- BUILDING SHELL ------
  // An inverted box enclosing the whole floorplate with room to spare above it.
  //
  // This is the fix for the establishing shot rendering a pure black void across the top
  // third of frame. The moment the camera climbs above the ceiling plane the suspended tile
  // grid has to be hidden — otherwise you look at the backfaces of the tiles — and until now
  // that revealed the clear colour. Now it reveals the inside of a building: a lit, fogged
  // shell that the far walls silhouette against instead of terminating on nothing.
  //
  // Costs 12 triangles and one draw call, and is fully occluded during gameplay.
  const shell = new THREE.Mesh(
    withUV1(new THREE.BoxGeometry(W + 4, H + 9, D + 4)),
    MaterialLibrary.get('drywall', { repeat: [6, 3], color: 0x8f8b83 }),
  );
  shell.material.side = THREE.BackSide;
  shell.position.set(0, (H + 9) / 2 - 0.6, 0);
  shell.name = 'officeBuildingShell';
  shell.castShadow = false;
  shell.receiveShadow = false;
  root.add(shell);

  // -------------------------------------------------------------- ceiling ---
  const ceiling = makeCeilingTileGrid(W, D);
  place(acc, ceiling, 0, H, 0, 0, { collide: false, ceiling: true });

  // Recessed troffers on a 3-tile pitch, snapped to the tile grid. The refs put
  // a troffer every few metres; a sparser grid leaves the near ceiling bare.
  for (let i = 0; i < panelCountX; i++) {
    for (let j = 0; j < panelCountZ; j++) {
      const px = (i - (panelCountX - 1) / 2) * panelPitch;
      const pz = (j - (panelCountZ - 1) / 2) * panelPitch;
      const panel = makeFluorescentPanel({ variant: 1, seed: i * 31 + j * 7 + 3 });
      place(acc, panel, px, H, pz, 0, { collide: false, ceiling: true });
    }
  }

  // Pendant lamps down the spine — the dark navy cones in the refs.
  for (let pz = -halfD + 5; pz < halfD - 4; pz += 6.1) {
    for (const px of [-3.2, 3.2]) {
      const lamp = makePendantLamp({ seed: Math.round(pz * 13 + px * 5) });
      place(acc, lamp, px, H, pz, 0, { collide: false, lights: true, ceiling: true });
    }
  }

  // ------------------------------------------------------ corridor walls ----
  /**
   * Lay a continuous run of cubicle panelling and register ONE unbroken grind rail for the
   * whole run. Geometry is chunked into WALL_SEG panels (real cubicle systems are panelised,
   * and it keeps per-chunk bounding spheres tight for culling) but the SKATE LINE is single:
   * the player commits to it once and holds it for 17 m.
   */
  function runWall(x0: number, z0: number, x1: number, z1: number, height: number): void {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1) return;
    const yaw = Math.atan2(dx, dz) - Math.PI / 2; // wall's local +X runs along the segment
    const n = Math.max(1, Math.round(len / WALL_SEG));
    const segLen = len / n;

    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const wall = makeCubicleWall(segLen, {
        variant: 1,
        seed: 900 + Math.round(x0 * 7 + z0 * 13 + i * 3),
        height,
      });
      // grind:false — the run registers its own single rail below.
      place(acc, wall, x0 + dx * t, 0, z0 + dz * t, yaw, { collide: true, grind: false });
    }

    const top = height + 0.08;
    acc.rails.push({
      start: new THREE.Vector3(x0, top, z0),
      end: new THREE.Vector3(x1, top, z1),
    });
  }

  const AISLE_H = 1.32; // the hero grind line height, constant along every corridor
  const spineEndZ = halfD - 2.4;
  const crossEndX = halfW - 2.4;

  for (const sx of [-1, 1]) {
    // Spine: two unbroken runs per side, split by the cross-corridor intersection.
    runWall(sx * SPINE_HALF, CROSS_HALF, sx * SPINE_HALF, spineEndZ, AISLE_H);
    runWall(sx * SPINE_HALF, -CROSS_HALF, sx * SPINE_HALF, -spineEndZ, AISLE_H);
    for (const sz of [-1, 1]) {
      // Cross corridor: one unbroken run per quadrant.
      runWall(sx * SPINE_HALF, sz * CROSS_HALF, sx * crossEndX, sz * CROSS_HALF, AISLE_H);
    }
  }

  // Paper piles at the corridor corners — the natural place for blown paperwork to end up.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      acc.paperSeeds.push({ x: sx * (SPINE_HALF - 0.9), z: sz * (CROSS_HALF - 0.9), radius: 1.4 });
      acc.wear.push({
        x: sx * (SPINE_HALF - 1.2),
        z: sz * (CROSS_HALF - 1.2),
        width: 2.4,
        depth: 2.4,
        rotation: rand(0, 3.14),
        strength: 0.5,
      });
    }
  }

  // The spawn intersection is the one place in the level the player is guaranteed to look at,
  // and with the corridor walls stopping short of the corner it was four bare carpet corners.
  // Dress each one tight against the wall (never in the skate line) and make three of the four
  // props a saturated accent, so the establishing frame always carries chroma.
  const cornerProps: (() => THREE.Object3D)[] = [
    () => makeFireExtinguisher({ seed: 811 }),
    () => makeTrashCan({ variant: 0, seed: 813, accent: true }),
    () => makePottedPlant({ variant: 0, seed: 815 }),
    () => makeFilingCabinet({ variant: 0, seed: 817, accent: true }),
  ];
  let corner = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (SPINE_HALF - 0.5);
      const cz = sz * (CROSS_HALF + 1.4);
      if (blocked(keepClear, cx, cz, 0.6, 0.6)) continue;
      place(acc, cornerProps[corner % cornerProps.length](), cx, 0, cz, sx > 0 ? -Math.PI / 2 : Math.PI / 2, {
        collide: true,
      });
      corner++;
    }
  }

  // ---------------------------------------------------------- cubicle farm ---
  // The pod field fills the four quadrants OUTSIDE the corridors. Columns are jittered per
  // column and pods jittered per pod, heights are mixed, and a fraction of the cells are
  // consumed by landmarks or cleared out entirely.
  const colBase = SPINE_HALF + WALL_GAP + POD_SIZE / 2;
  const rowBase = CROSS_HALF + WALL_GAP + POD_SIZE / 2;

  const cols: number[] = [];
  for (let x = colBase, i = 0; x + POD_SIZE / 2 < halfW - 1.6; x += POD_PITCH + rand(-0.45, 0.5), i++) {
    cols.push(Number(x.toFixed(2)));
  }
  const rows: number[] = [];
  for (let z = rowBase; z + POD_SIZE / 2 < halfD - 1.6; z += POD_PITCH + rand(-0.45, 0.5)) {
    rows.push(Number(z.toFixed(2)));
  }

  // Landmark cells, addressed as `${sx}${sz}:${ci},${ri}`. Hand-placed, not rolled: the
  // point of a landmark is that the player learns where it is.
  const CONFERENCE_CELL = '1,1:1,1';
  const MANAGER_CELLS = ['-1,-1:1,1', '-1,1:0,2'];
  const consumed = new Set<string>();

  let podIndex = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let ci = 0; ci < cols.length; ci++) {
        for (let ri = 0; ri < rows.length; ri++) {
          const key = `${sx},${sz}:${ci},${ri}`;
          if (consumed.has(key)) continue;

          const baseX = sx * cols[ci];
          const baseZ = sz * rows[ri];

          // ---- landmark: glazed conference room (one per floorplate) --------
          if (key === CONFERENCE_CELL && !blocked(keepClear, baseX, baseZ, 2.8, 2.4)) {
            consumed.add(key);
            const room = makeConferenceBox(5.0, 4.2, { seed: 501 });
            place(acc, room, baseX, 0, baseZ, 0, { collide: true, grind: true });
            acc.paperSeeds.push({ x: baseX - 3.2, z: baseZ, radius: 1.0 });
            continue;
          }

          // ---- landmark: manager office spanning two cells ------------------
          if (MANAGER_CELLS.includes(key) && ci + 1 < cols.length) {
            const nextKey = `${sx},${sz}:${ci + 1},${ri}`;
            if (!consumed.has(nextKey)) {
              const cx = (sx * cols[ci] + sx * cols[ci + 1]) / 2;
              const span = Math.abs(cols[ci + 1] - cols[ci]) + POD_SIZE - 0.6;
              if (!blocked(keepClear, cx, baseZ, span / 2, 2.4)) {
                consumed.add(key);
                consumed.add(nextKey);
                const office = makeManagerOffice(span, 4.3, { seed: 600 + podIndex });
                // Door always faces the nearest corridor.
                place(acc, office, cx, 0, baseZ, sz > 0 ? Math.PI : 0, { collide: true });
                podIndex++;
                continue;
              }
            }
          }

          const x = baseX + rand(-0.16, 0.16);
          const z = baseZ + rand(-0.16, 0.16);
          if (blocked(keepClear, x, z, POD_SIZE / 2, POD_SIZE / 2)) continue;

          // Detail falls off with distance from the corridor, not from the origin:
          // the column the player skates past is always hero detail.
          const variant = ci === 0 ? 0 : ci === 1 ? 1 : 2;
          const cleared = ci > 0 && chance(0.09);
          const pod = makeCubiclePod({
            variant: cleared ? 1 : variant,
            seed: 101 + podIndex * 7,
            // Aisle-facing pods keep the house height so the skyline behind the hero grind
            // line stays legible; everything deeper mixes.
            panelHeight: ci === 0 ? 1.32 : pick(PANEL_HEIGHTS),
            fabricTint: pick(POD_FABRIC_TINTS),
            cleared,
          });
          podIndex++;

          // Full desk colliders only in the corridor-facing column; outer pods get
          // just the panel boxes, which is all the player can ever touch.
          const collide = variant === 0 ? true : 8;
          // Pod tops are a secondary grind line — register the two near columns.
          const grind = variant <= 1 && !cleared;

          place(acc, pod, x, 0, z, (ci + ri) % 2 === 0 ? rand(-0.02, 0.02) : Math.PI / 2 + rand(-0.02, 0.02), {
            collide,
            grind,
          });

          if (ci === 0 && chance(0.4)) {
            acc.paperSeeds.push({ x: x - sx * (POD_SIZE / 2 + 0.5), z: z + rand(-1.4, 1.4), radius: 1.1 });
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ landmarks ---
  // Copier bank at the +X end of the cross corridor, vending alcove at the -X end. Both are
  // visible straight down the corridor from the spawn intersection, which is what a player
  // needs in order to have any idea where they are.
  for (let i = -1; i <= 1; i++) {
    const copier = makeCopier({ seed: 700 + i });
    place(acc, copier, crossEndX + 1.0, 0, i * 1.0, -Math.PI / 2, { collide: true });
  }
  place(acc, makeTrashCan({ variant: 0, seed: 711, accent: true }), crossEndX + 0.9, 0, 2.3, 0, { collide: true });
  place(acc, makeCardboardBox({ variant: 0, seed: 713 }), crossEndX + 0.7, 0, -2.4, 0.4, { collide: true });
  acc.paperSeeds.push({ x: crossEndX - 0.6, z: 0, radius: 1.6 });
  acc.wear.push({ x: crossEndX - 1.2, z: 0, width: 3.6, depth: 2.8, strength: 0.55 });

  for (const vz of [-1.1, 1.1]) {
    place(acc, makeVendingMachine({ seed: 720 + Math.round(vz * 10) }), -crossEndX - 0.9, 0, vz, Math.PI / 2, {
      collide: true,
      lights: true,
    });
  }
  place(acc, makeFireExtinguisher({ seed: 731 }), -crossEndX - 0.9, 0, 2.6, 0, { collide: true });
  acc.wear.push({ x: -crossEndX + 1.0, z: 0, width: 3.0, depth: 2.6, strength: 0.45 });

  // ------------------------------------------------------- skate furniture ---
  // Paired kickers with a landing gap in each arm of the cross corridor. A wide shot has to
  // show at least three readable lines; the spine has the level-data ramps, the arms have
  // these, and the corridor rails tie them together.
  const kickerPairs: { x: number; z: number; rotY: number }[] = [
    { x: 10.2, z: 1.8, rotY: Math.PI / 2 },
    { x: 15.8, z: 1.8, rotY: -Math.PI / 2 },
    { x: -10.2, z: -1.8, rotY: -Math.PI / 2 },
    { x: -15.8, z: -1.8, rotY: Math.PI / 2 },
  ];
  for (const k of kickerPairs) {
    if (blocked(keepClear, k.x, k.z, 1.8, 1.2)) continue;
    const ramp = makeKickerRamp({ width: 2.9, depth: 1.7, height: 0.72, seed: Math.round(k.x * 7) });
    place(acc, ramp, k.x, 0, k.z, k.rotY, { collide: true, grind: true });
    acc.paperSeeds.push({ x: k.x, z: k.z - 1.6, radius: 1.0 });
    acc.wear.push({ x: k.x, z: k.z - 1.4, width: 2.2, depth: 1.9, strength: 0.6 });
  }

  // Aisle clutter so the spine itself isn't a bare carpet strip: boxes, bins
  // and plants tucked against the corridor wall, never in the skate line.
  const aisleEdge = SPINE_HALF - 0.5;
  for (let z = -halfD + 6; z < halfD - 6; z += rand(3.4, 7.5)) {
    if (Math.abs(z) < CROSS_HALF + 1.2) continue;
    const sx = chance(0.5) ? 1 : -1;
    const x = sx * aisleEdge;
    if (blocked(keepClear, x, z, 0.6, 0.6)) continue;
    const roll = rng();
    const accent = chance(0.22);
    let prop: THREE.Object3D;
    if (roll < 0.28) prop = makeCardboardBox({ variant: 1, seed: Math.round(z * 3) + 61 });
    else if (roll < 0.5) prop = makeTrashCan({ variant: 1, seed: Math.round(z * 7) + 67, accent });
    else if (roll < 0.7) prop = makePottedPlant({ variant: 0, seed: Math.round(z * 11) + 71 });
    else if (roll < 0.86) prop = makePrinter({ variant: 1, seed: Math.round(z * 13) + 73 });
    else prop = makeFireExtinguisher({ seed: Math.round(z * 17) + 79 });
    place(acc, prop, x, 0, z, rand(0, Math.PI * 2), { collide: true });
    if (chance(0.35)) acc.paperSeeds.push({ x: x - sx * 0.9, z: z + rand(-1.2, 1.2), radius: 0.9 });
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
      // Roughly 1 in 6 of the perimeter run carries a saturated body colour, so the eye has
      // a chroma note to land on wherever it looks along the wall.
      const accent = chance(0.17);
      let prop: THREE.Object3D;
      if (roll < 0.46) {
        prop = makeFilingCabinet({ variant: 1, seed: Math.round(t * 17) + 5, accent });
      } else if (roll < 0.6) {
        prop = makeCardboardBox({ variant: 1, seed: Math.round(t * 23) + 11 });
      } else if (roll < 0.7) {
        prop = makePrinter({ variant: 1, seed: Math.round(t * 29) + 13 });
      } else if (roll < 0.79) {
        prop = makePottedPlant({ variant: 0, seed: Math.round(t * 31) + 17 });
      } else if (roll < 0.87) {
        prop = makeWaterCooler({ variant: 1, seed: Math.round(t * 37) + 19 });
      } else if (roll < 0.94) {
        prop = makeTrashCan({ variant: 1, seed: Math.round(t * 41) + 23, accent });
      } else {
        prop = makeFireExtinguisher({ seed: Math.round(t * 43) + 27 });
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

    // A pile of packing boxes in each corner of the plate: the "this floor is being
    // decommissioned" story the refs tell with their loose cardboard.
    const corner = makeBoxStack({ seed: Math.round(run.base * 31) + 3 });
    const cx = run.along === 'x' ? -run.nz * (halfW - 2.6) : run.base + run.nx * 1.9;
    const cz = run.along === 'x' ? run.base + run.nz * 1.9 : run.nx * (halfD - 2.6);
    if (!blocked(keepClear, cx, cz, 1.2, 1.2)) {
      place(acc, corner, cx, 0, cz, rand(0, Math.PI), { collide: true });
      acc.wear.push({ x: cx, z: cz, width: 3.2, depth: 3.2, rotation: rand(0, 3), strength: 0.6 });
    }

    // Wall furniture: cork boards, whiteboards, clocks, exit signs.
    const wallY = 1.75;
    for (let t = -span / 2 + 6; t < span / 2 - 6; t += rand(6, 11)) {
      const x = run.along === 'x' ? t : run.base - run.nx * 0.28;
      const z = run.along === 'x' ? run.base - run.nz * 0.28 : t;
      const roll = rng();
      if (roll < 0.4) {
        place(acc, makeCorkBoard({ seed: Math.round(t * 11) + 3 }), x, wallY, z, yaw, { collide: false });
      } else if (roll < 0.66) {
        place(acc, makeWhiteboard({ seed: Math.round(t * 17) + 5 }), x, wallY + 0.1, z, yaw, { collide: false });
      } else if (roll < 0.85) {
        place(acc, makeWallClock({ seed: Math.round(t * 13) + 7 }), x, 2.35, z, yaw, { collide: false });
      } else {
        place(acc, makeExitSign({ seed: Math.round(t * 19) + 9 }), x, 2.72, z, yaw, {
          collide: false,
          lights: true,
        });
      }
    }
  }

  // ------------------------------------------------------------ floor dress --
  // Loose paperwork, CLUSTERED. 220 sheets scattered uniformly across the whole plate with
  // no contact shadow was the loudest cheapness tell in the build: it read as a broken decal
  // system, not as blown paperwork. Paper piles where it was dropped.
  const paper = makeScatterPaper(74, W - 6, D - 6, { seed: 7, clusters: acc.paperSeeds });
  place(acc, paper, 0, 0, 0, 0, { collide: false });

  // Traffic-lane wear down both corridors plus the point stains collected above.
  for (let z = -halfD + 5; z < halfD - 5; z += 5.4) {
    acc.wear.push({ x: rand(-1.8, 1.8), z, width: 3.4, depth: 4.2, rotation: rand(0, 3.14), strength: 0.22 });
  }
  for (let x = -halfW + 5; x < halfW - 5; x += 5.6) {
    if (Math.abs(x) < SPINE_HALF) continue;
    acc.wear.push({ x, z: rand(-1.8, 1.8), width: 4.2, depth: 3.4, rotation: rand(0, 3.14), strength: 0.20 });
  }
  for (let i = 0; i < 22; i++) {
    acc.wear.push({
      x: rand(-halfW + 3, halfW - 3),
      z: rand(-halfD + 3, halfD - 3),
      width: rand(0.45, 1.1),
      depth: rand(0.45, 1.1),
      rotation: rand(0, 3.14),
      strength: rand(0.3, 0.6),
    });
  }
  const wearBatch = makeFloorWear(acc.wear);
  root.add(wearBatch);

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

  // Sanity check: nothing in the ceiling batch may sit below the ceiling plane. A troffer
  // that loses its Y translation during the merge lands on the carpet as a blown-out white
  // slab, which is indistinguishable from a broken lightmap. Fail loud in dev instead.
  if (typeof console !== 'undefined') {
    let minY = Infinity;
    ceilingBatch.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      if (bb) minY = Math.min(minY, bb.min.y + m.position.y);
    });
    if (minY < H - 1.9) {
      console.warn(`[OfficeLevel] ceiling batch reaches y=${minY.toFixed(2)}, expected >= ${(H - 1.9).toFixed(2)}`);
    }
  }

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
      // ONLY the suspended tile grid hides. The building shell stays (so the frame never
      // clears to a void) and the fixture point lights stay (killing them on the same branch
      // is what made every wide shot lose all local light and go flat).
      const inside = y < H - 0.15;
      if (ceilingBatch.visible !== inside) ceilingBatch.visible = inside;
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
