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
  makeDeskChair,
  makeExitSign,
  makeFilingCabinet,
  makeFireExtinguisher,
  makeFluorescentPanel,
  makeKickerRamp,
  makeLedgeBlock,
  makeManagerOffice,
  makePendantLamp,
  makePlanterLedge,
  makePottedPlant,
  makePrinter,
  makeQuarterPipe,
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

/**
 * Give a stock three primitive the same attribute signature every OfficeProps geometry has:
 * NON-INDEXED, with a uv1.
 *
 * The de-indexing is not cosmetic. BufferGeometryUtils.mergeGeometries refuses to merge a
 * bucket whose members disagree about whether an index buffer exists, and it refuses by
 * returning null — at which point the caller drops the entire bucket. OfficeProps runs every
 * geometry it authors through `finalize()`, which de-indexes; the shell, the walls and the
 * floor here are raw PlaneGeometry / BoxGeometry, which are indexed. For as long as those
 * pieces each had a private material this never came up, because a one-geometry bucket is not
 * merged. The moment the wall bands were consolidated onto the shared laminate and trim
 * materials — which is the point of the consolidation — four indexed strips landed in a bucket
 * of forty-seven non-indexed ones and took the whole bucket down with them.
 *
 * uv1 matters for the same reason it does in OfficeProps: three samples aoMap from the second
 * UV set, and several of these surfaces bind a packed ORM.
 */
function withUV1(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let out = g;
  if (out.index) {
    const flat = out.toNonIndexed();
    out.dispose();
    out = flat;
  }
  const uv = out.getAttribute('uv');
  if (uv && !out.getAttribute('uv1')) out.setAttribute('uv1', uv.clone());
  return out;
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

/**
 * Hard cap on the floorplate. The panel's note on the previous build was "a grey-beige archviz
 * walkthrough of an EMPTY cubicle farm" — and the largest single contributor to that read was
 * simply that the room is bigger than the level that has been designed into it. A 50 m plate
 * puts 12 m of bare carpet between the outermost pod column and the wall, which no amount of
 * dressing fixes because there is nothing out there to dress.
 *
 * 46 m keeps every level-data object (the funbox at z = -18, the stairs at z = 20, bounds at
 * ±24) comfortably inside, while cutting the floor area by 15% and — because the pod pitch is
 * unchanged — pushing the perimeter dressing up against the outer pod column where the camera
 * can actually see it.
 */
const MAX_PLATE = 46;

export function buildOfficeInterior(opts: OfficeInteriorOptions = {}): OfficeInterior {
  const W = Math.min(opts.width ?? 68, MAX_PLATE);
  const D = Math.min(opts.depth ?? 68, MAX_PLATE);
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

  // ------------------------------------------------------------- walls -----
  // A THREE-BAND WALL, not one flat plane of drywall.
  //
  // "Grey-beige archviz" was the panel's word for it, and the wall was the biggest grey-beige
  // surface in the frame after the carpet. Commercial interiors are banded — skirting, a
  // saturated dado, a rail, painted plaster above — and that banding is free art direction:
  // it puts a horizon line behind the cubicle field at a different height from the cap rails,
  // it supplies the saturated navy the concept art gets its identity from, and it gives the
  // room a dark value at floor level so the carpet is no longer the darkest thing in shot.
  //
  // The bands are pushed through `place()` into the merged static batch, so the whole wall
  // assembly — 4 planes, 4 dados, 4 rails, 4 skirtings — costs three draw calls, not sixteen.
  //
  // ONE TEXTURE SET FOR THE WHOLE WALL. Every band used to ask MaterialLibrary for `drywall`
  // (or laminate, or trim) at its OWN `repeat`, which forks the texture set, which forks the
  // merge bucket in OfficeProps.mergePropsByMaterial — five extra draw calls, permanently, for
  // 160 triangles of banding. Because the merge consolidates materials that differ only in
  // `.color` into one vertex-coloured family, sharing a single repeat across the three drywall
  // bands collapses them into the family the props already use, and the rail and skirting fall
  // into the level's existing deskLaminate / cubicleTrim buckets. Net: five buckets to zero.
  const DADO_H = 1.15;
  const RAIL_H = 0.085;
  const WALL_REPEAT: [number, number] = [W / 4, H / 2.6];
  const wallMat = MaterialLibrary.get('drywall', { repeat: WALL_REPEAT, color: 0xd6cfc2 });
  const dadoMat = MaterialLibrary.get('drywall', { repeat: WALL_REPEAT, color: 0x33405c });
  const railMat = MaterialLibrary.get('deskLaminate', { color: 0xc9a877 });
  const skirtMat = MaterialLibrary.get('cubicleTrim');
  const wallSpecs: { w: number; x: number; z: number; rotY: number }[] = [
    { w: W, x: 0, z: -halfD, rotY: 0 },            // faces +Z
    { w: W, x: 0, z: halfD, rotY: Math.PI },       // faces -Z
    { w: D, x: -halfW, z: 0, rotY: Math.PI / 2 },  // faces +X
    { w: D, x: halfW, z: 0, rotY: -Math.PI / 2 },  // faces -X
  ];
  for (const spec of wallSpecs) {
    const nx = Math.sin(spec.rotY);
    const nz = Math.cos(spec.rotY);
    const inX = spec.x + nx * 0.0;
    const inZ = spec.z + nz * 0.0;

    // Painted plaster above the rail.
    const upper = new THREE.Mesh(plane(spec.w, H - DADO_H - RAIL_H), wallMat);
    upper.receiveShadow = true;
    upper.castShadow = false;
    place(acc, upper, inX, (H + DADO_H + RAIL_H) / 2, inZ, spec.rotY, { collide: false });

    // Saturated dado. Proud of the plaster by 25 mm so the rail throws a real shadow line.
    const dado = new THREE.Mesh(box(spec.w, DADO_H, 0.05), dadoMat);
    dado.receiveShadow = true;
    dado.castShadow = false;
    place(acc, dado, inX + nx * 0.025, DADO_H / 2, inZ + nz * 0.025, spec.rotY, { collide: false });

    // Timber chair rail — the warm note, and the horizon the cubicle skyline reads against.
    const rail = new THREE.Mesh(box(spec.w, RAIL_H, 0.085), railMat);
    rail.receiveShadow = true;
    rail.castShadow = true;
    place(acc, rail, inX + nx * 0.042, DADO_H + RAIL_H / 2, inZ + nz * 0.042, spec.rotY, { collide: false });

    const skirt = new THREE.Mesh(box(spec.w, 0.14, 0.075), skirtMat);
    skirt.receiveShadow = true;
    skirt.castShadow = false;
    place(acc, skirt, inX + nx * 0.038, 0.07, inZ + nz * 0.038, spec.rotY, { collide: false });

    // Solid wall collider just inside the visible plane.
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
  //
  // The tint is deliberately light: every face of a BackSide box has its normal pointing
  // INWARD, so the sun never lights the underside of the roof and a mid-grey shell crushes to
  // near-black exactly where the establishing camera looks. Light albedo + a shell height
  // that keeps the roof inside the fog's far plane is what keeps that band readable.
  const SHELL_H = H + 6;
  const shell = new THREE.Mesh(
    withUV1(new THREE.BoxGeometry(W + 4, SHELL_H, D + 4)),
    // The small self-emission is the point: the roof face of a BackSide box has its normal
    // pointing straight down, so no directional light will ever touch it and it crushes to
    // black. A flat ~0.4 emissive pinned near the fog value makes the shell behave like
    // aerial perspective instead of like a hole in the world. Far under the bloom threshold.
    MaterialLibrary.get('drywall', {
      repeat: [6, 3],
      color: 0xb3ad9f,
      emissive: 0x6f6a60,
      emissiveIntensity: 0.5,
    }),
  );
  shell.material.side = THREE.BackSide;
  shell.position.set(0, SHELL_H / 2 - 0.6, 0);
  shell.name = 'officeBuildingShell';
  shell.castShadow = false;
  shell.receiveShadow = false;
  root.add(shell);

  // -------------------------------------------------------- upper wall band ---
  // The far wall used to terminate at the ceiling line and hand straight over to the shell,
  // which is the "flat void" the panel called out: two flat beiges meeting on a hard horizon
  // with nothing in between.
  //
  // The fix is a dark parapet band above the ceiling line. It gives the wall/shell junction a
  // VALUE step and a real edge instead of a tonal seam, and — because it is the darkest thing
  // in the upper third — it frames the floorplate the way the concept art frames its scenes
  // with deep shadow at the top of the composition.
  //
  // Deliberately NOT modelled as beams and ductwork: everything above the ceiling plane is
  // between the cutaway camera and the floor, so overhead structure does not add depth to the
  // establishing shot, it stripes it out. A vertical band at the perimeter never occludes.
  const parapetMat = MaterialLibrary.get('drywall', { repeat: WALL_REPEAT, color: 0x5a5348 });
  for (const spec of wallSpecs) {
    const band = new THREE.Mesh(plane(spec.w, 1.9), parapetMat);
    band.castShadow = false;
    band.receiveShadow = false;
    place(acc, band, spec.x, H + 0.9, spec.z, spec.rotY, { collide: false });
  }

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
          //
          // The OUTER column used to drop to variant 2 — panels plus four featureless slabs —
          // and from any establishing camera that column is a third of the floorplate reading
          // as empty navy boxes. Triangles are not the constraint here (draw calls are, and
          // the whole field is one merge), so the outer column now gets real desks, monitors
          // and chairs; only its collider and grind sets stay cheap.
          const variant = ci === 0 ? 0 : 1;
          const cleared = ci > 0 && chance(0.18);

          // ---- PER-POD CHARACTER ------------------------------------------
          // The floorplate used to roll the same dressing distribution for every pod, which is
          // the mathematically reliable way to make thirty pods look like one pod stamped
          // thirty times. Instead, give each pod ONE personality roll and let it drive
          // everything downstream. The distribution is deliberately barbelled — a real office
          // has genuinely pristine desks and genuinely feral ones, and very few average ones,
          // and it is the CONTRAST between neighbours that reads as authorship.
          const roll = rng();
          const mess =
            roll < 0.22 ? rand(0.0, 0.18)   // the tidy desk nobody uses
              : roll < 0.55 ? rand(0.3, 0.55) // normal
                : roll < 0.85 ? rand(0.6, 0.82) // busy
                  : rand(0.85, 1.0);            // feral

          // Fabric runs in BLOCKS, not per pod: real floorplates were fitted out one bay at a
          // time, so colour changes on a bay boundary. Blocking the tint by (quadrant, column)
          // gives the wide shot large legible colour masses instead of confetti.
          const tintIndex = (ci * 2 + (sx > 0 ? 1 : 0) + (sz > 0 ? 3 : 0) + Math.floor(ri / 2)) % POD_FABRIC_TINTS.length;

          const pod = makeCubiclePod({
            variant: cleared ? 1 : variant,
            seed: 101 + podIndex * 7,
            // Aisle-facing pods keep the house height so the skyline behind the hero grind
            // line stays legible; everything deeper mixes.
            panelHeight: ci === 0 ? 1.32 : pick(PANEL_HEIGHTS),
            fabricTint: POD_FABRIC_TINTS[tintIndex],
            cleared,
            mess,
            chairs: true,
          });
          podIndex++;

          // A feral pod leaks: paper on the aisle carpet outside it, and a chair somebody
          // shoved out of the way.
          if (mess > 0.72) {
            acc.paperSeeds.push({ x: x - sx * (POD_SIZE / 2 + 0.6), z: z + rand(-1.6, 1.6), radius: 1.2 });
            if (chance(0.45)) {
              const stray = makeDeskChair({
                variant: 1,
                seed: 4100 + podIndex,
                knocked: chance(0.45),
              });
              // OUTBOARD, into the service gap between pod columns — never into the corridor,
              // which is the skate line and stays clean.
              place(acc, stray, x + sx * (POD_SIZE / 2 + 0.62), 0, z + rand(-1.5, 1.5), rand(0, Math.PI * 2), {
                collide: 1,
              });
            }
          }

          // Full desk colliders only in the corridor-facing column; outer pods get
          // just the panel boxes, which is all the player can ever touch.
          const collide = variant === 0 ? true : 8;
          // Pod tops are a secondary grind line — register the two near columns.
          const grind = ci <= 1 && !cleared;

          // Orientation used to be a strict CHECKERBOARD — (ci + ri) parity — which from any
          // wide camera is the most legible pattern a human eye can find, and it read as
          // wallpaper. Real fit-outs run in BAYS: several pods sharing an orientation, then a
          // break. Rolling per pod with a heavy bias toward the previous bay's orientation gives
          // runs of two to four, with the occasional pod turned right around because the tenant
          // wanted a window. Aisle-facing pods stay square to the corridor so the hero grind
          // line keeps a clean edge behind it.
          const podYaw =
            ci === 0
              ? rand(-0.02, 0.02)
              : (Math.floor(ri / (1 + (ci % 3)) + ci) % 2) * (Math.PI / 2)
                + (chance(0.16) ? Math.PI / 2 : 0)
                + rand(-0.035, 0.035);

          place(acc, pod, x, 0, z, podYaw, { collide, grind });

          if (ci === 0 && chance(0.4)) {
            acc.paperSeeds.push({ x: x - sx * (POD_SIZE / 2 + 0.5), z: z + rand(-1.4, 1.4), radius: 1.1 });
          }

          // Between-pod service gap dressing: the 1.3 m aisle between pod columns was empty on
          // every one of the thirty pods. One prop in three of those gaps is what stops the pod
          // field reading as a lattice of identical islands separated by clean carpet.
          if (ci > 0 && chance(0.34)) {
            const gx = x - sx * (POD_PITCH / 2);
            const gz = z + rand(-1.8, 1.8);
            if (!blocked(keepClear, gx, gz, 0.5, 0.5)) {
              const g = rng();
              const gp =
                g < 0.26 ? makeBoxStack({ seed: podIndex * 13 + 5 })
                  : g < 0.46 ? makeCardboardBox({ variant: 1, seed: podIndex * 17 + 7 })
                    : g < 0.62 ? makeFilingCabinet({ variant: 1, seed: podIndex * 19 + 11, accent: chance(0.2) })
                      : g < 0.76 ? makeTrashCan({ variant: 1, seed: podIndex * 23 + 13 })
                        : g < 0.88 ? makePottedPlant({ variant: 0, seed: podIndex * 29 + 17 })
                          : makeDeskChair({ variant: 1, seed: podIndex * 31 + 19, knocked: chance(0.5) });
              place(acc, gp, gx, 0, gz, rand(0, Math.PI * 2), { collide: 1 });
            }
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

  // ============================================================ THE PLAZA ====
  // THIS IS THE FIX FOR "TOO BIG AND TOO EMPTY IN THE MIDDLE".
  //
  // The intersection and the two arms of the cross corridor were 10 m of unbroken carpet in
  // every establishing shot — a car park with cubicles around it. A skate plaza is not an open
  // floor with obstacles pushed to the edges; it is an ISLAND CHAIN you can link end to end
  // without ever putting a wheel on flat ground. So: a pair of hero ledges flanking the spawn,
  // planters on the intersection corners, and a ledge / planter / hubba sequence threaded down
  // each arm between the existing kickers.
  //
  // Every position here is checked against what the level data already owns:
  //   spine    kickers at x = ±2.4 (z = ±8.5, ±13), floor rails at x = ±4.0 (|z| > 5.5)
  //   +X arm   floor rail at z = -2.6 (x 7.5 … 18.5), kickers at x = 10.2 / 15.8
  //   -X arm   floor rail at z = +2.6, kickers at x = -10.2 / -15.8
  // so the plaza takes the OPPOSITE side of each arm and the gaps between the kickers.
  const ACCENT_ORANGE = 0xe8722a;
  const ACCENT_TEAL = 0x2f6f7d;

  // --- hero pair at the spawn ------------------------------------------------
  // Two ledges either side of the spawn point, running along the spine. The player lands on
  // the floor between them and has a grind within two metres in either direction, which is
  // what an opening shot of a skate level is supposed to promise.
  for (const sx of [-1, 1]) {
    const lx = sx * 3.45;
    if (blocked(keepClear, lx, 0, 0.55, 2.7)) continue;
    const ledge = makeLedgeBlock({
      width: 5.2,
      depth: 0.95,
      height: 0.4,
      seed: 3300 + sx,
      stripe: sx > 0 ? ACCENT_ORANGE : ACCENT_TEAL,
    });
    place(acc, ledge, lx, 0, 0, Math.PI / 2, { collide: true, grind: true });
    acc.wear.push({ x: lx, z: sx * 3.2, width: 2.2, depth: 2.6, strength: 0.5 });
  }

  // --- intersection corners --------------------------------------------------
  for (const sx of [-1, 1]) {
    const px = sx * 4.05;
    const pz = -sx * 3.55;
    if (blocked(keepClear, px, pz, 1.3, 0.7)) continue;
    place(acc, makePlanterLedge({ width: 2.3, depth: 0.9, height: 0.46, seed: 3400 + sx }), px, 0, pz, 0, {
      collide: true,
      grind: true,
    });
  }

  // --- the arms --------------------------------------------------------------
  // Sequence per arm, mirrored: ledge → planter → hubba, all on the side of the arm the
  // level's floor rail does not use, so the two lines run parallel and can be transferred
  // between rather than fighting each other.
  for (const sx of [-1, 1]) {
    const lane = sx > 0 ? 3.05 : -3.05;
    const items: { x: number; build: () => THREE.Object3D }[] = [
      { x: 7.3, build: () => makeLedgeBlock({ width: 3.6, depth: 0.9, height: 0.4, seed: 3500 + sx, stripe: ACCENT_TEAL }) },
      { x: 13.0, build: () => makePlanterLedge({ width: 3.4, depth: 1.0, height: 0.5, seed: 3600 + sx }) },
      { x: 19.0, build: () => makeLedgeBlock({ width: 3.4, depth: 1.0, height: 0.62, seed: 3700 + sx, stripe: ACCENT_ORANGE }) },
    ];
    for (const it of items) {
      const px = sx * it.x;
      if (Math.abs(px) + 1.9 > halfW - 1.2) continue;
      if (blocked(keepClear, px, lane, 2.0, 0.7)) continue;
      place(acc, it.build(), px, 0, lane, 0, { collide: true, grind: true });
      acc.wear.push({ x: px, z: lane - Math.sign(lane) * 1.5, width: 3.0, depth: 2.2, strength: 0.4 });
      acc.paperSeeds.push({ x: px + rand(-1.2, 1.2), z: lane - Math.sign(lane) * 1.3, radius: 1.0 });
    }
  }

  // ================================================== TRANSITION AGAINST THE WALL ====
  // THIS IS THE FIX FOR "THE DEAD CENTRE IS A WAREHOUSE FLOOR".
  //
  // Every skateable object on this plate was a straight line at one of two heights: cap rails
  // at 1.40 m and ledges at 0.4-0.6 m. A park built only out of straight lines is a park you
  // can only travel ALONG — you enter an arm at one end, you leave it at the other, and the
  // nine metres of carpet between the two lines has no reason to exist. That is precisely what
  // an "architectural walkthrough" looks like from a wide camera: circulation, not a park.
  //
  // A transition is the primitive that fixes it, because it sends the player UP and turns them
  // AROUND, which is what makes an open floor a place you circulate IN. So each arm of the
  // cross corridor gets a run of quarter pipes backed hard onto the corridor wall.
  //
  // THE COPING IS DELIBERATELY FLUSH WITH THE CORRIDOR CAP RAIL. The wall top sits at
  // AISLE_H + 0.08 = 1.40 and the QP lip is authored to land there, so carving up the
  // transition puts the player's wheels exactly on the continuous 17 m grind line running
  // along the top of the wall behind it. Pump the ramp, pop the lip, hold the rail: that is a
  // designed line rather than a field of props, and it costs 1.5 m off the corridor width,
  // which tightens the space at the same time.
  const CAP_TOP = AISLE_H + 0.08;
  const QP_DEPTH = 1.55;
  for (const sx of [-1, 1]) {
    // The rail the level data owns runs down ONE side of each arm; the transitions take the
    // other, so the two lines are parallel and transferable instead of fighting.
    const wallZ = sx > 0 ? -CROSS_HALF : CROSS_HALF;
    const cz = wallZ - Math.sign(wallZ) * (QP_DEPTH / 2 + 0.06);
    for (const bx of [8.6, 14.2, 19.6]) {
      const px = sx * bx;
      if (Math.abs(px) + 2.4 > crossEndX) continue;
      if (blocked(keepClear, px, cz, 2.4, QP_DEPTH / 2)) continue;
      const qp = makeQuarterPipe({
        width: 4.4,
        depth: QP_DEPTH,
        height: CAP_TOP - 0.06,
        seed: 3800 + Math.round(bx * 3) + sx,
      });
      // rotY = 0 puts the tall end at +Z. The wall is at -Z on the +X arm, so flip there.
      place(acc, qp, px, 0, cz, wallZ < 0 ? Math.PI : 0, { collide: true, grind: true });
      acc.wear.push({ x: px, z: cz - Math.sign(wallZ) * 1.7, width: 4.6, depth: 2.6, strength: 0.5 });
      acc.paperSeeds.push({ x: px + rand(-1.6, 1.6), z: cz - Math.sign(wallZ) * 1.5, radius: 1.3 });
    }
  }

  // --- spawn banks ------------------------------------------------------------
  // Two low banks flanking the spawn, one at the mouth of each arm of the cross corridor,
  // facing outward. The player spawns between them, so the opening frame says "there is
  // transition here" rather than "there is a corridor here" — and it says it sideways, which
  // is the direction the level otherwise gives the player no reason to look in.
  //
  // x = ±6.1 is the one lane in the arm that nothing else claims: the hero ledges stop at
  // x = 3.9, the corridor walls start at 5.2 and turn the corner there, and the arm plaza's
  // first item is at 7.3.
  for (const sx of [-1, 1]) {
    const bx = sx * 6.1;
    if (blocked(keepClear, bx, 0, 0.7, 1.7)) continue;
    // rotY = +PI/2 maps the ramp's local +Z (its tall end) onto +X.
    place(acc, makeQuarterPipe({ variant: 1, width: 3.2, depth: 1.2, height: 0.66, seed: 3900 + sx }), bx, 0, 0,
      sx * Math.PI / 2, { collide: true, grind: true });
    acc.wear.push({ x: bx - sx * 1.5, z: 0, width: 2.4, depth: 3.4, strength: 0.45 });
  }

  // --- spine islands ----------------------------------------------------------
  // The spine's centre lane was the widest unbroken strip of carpet on the plate: the level
  // data's kickers sit at x = ±2.4 and its floor rails at x = ±4.0, so the two metres either
  // side of the centre line carried nothing at all. A funbox — kicker, flat, kicker — turns
  // that dead lane into the connector between the two rail lines, and because it is composed
  // out of props that already exist it enters the same merge buckets and costs zero draw calls.
  //
  // GEOMETRY, NOT TASTE, PICKS THE POSITION. The only gap on the spine that a full funbox fits
  // in is between the intersection and the level's first kicker: that ramp occupies
  // z = 7.6…9.4 and the second one 12.1…13.9, so the usable band is z = 4.0…7.5 and a funbox
  // of flat length L needs L + 1.84 m. L = 1.6 lands the assembly in 4.03…7.47 with 5 cm to
  // spare at each end. The stretch beyond it is covered by the 8 m hubba below, which is why
  // there is only one island per half and not two.
  const ISLAND_W = 2.0;
  const ISLAND_LEN = 1.6;
  for (const sz of [-1, 1]) {
    const cz = sz * 5.75;
    if (blocked(keepClear, 0, cz, ISLAND_W / 2 + 0.2, ISLAND_LEN / 2 + 1.4)) continue;
    place(acc, makeLedgeBlock({
      width: ISLAND_W,
      depth: ISLAND_LEN,
      height: 0.42,
      seed: 4000 + sz,
      stripe: sz > 0 ? ACCENT_ORANGE : ACCENT_TEAL,
    }), 0, 0, cz, 0, { collide: true, grind: true });
    // A kick at each end so the island is rideable from both directions.
    for (const end of [-1, 1]) {
      place(acc, makeKickerRamp({
        variant: 1,
        width: ISLAND_W,
        depth: 0.92,
        height: 0.42,
        seed: 4050 + end * 3 + sz,
      }), 0, 0, cz + sz * end * (ISLAND_LEN / 2 + 0.46), sz * end > 0 ? Math.PI : 0, {
        collide: true,
        grind: false,
      });
    }
    acc.wear.push({ x: 0, z: cz, width: 3.0, depth: ISLAND_LEN + 3.4, strength: 0.4 });
    acc.paperSeeds.push({ x: rand(-1.4, 1.4), z: cz + sz * rand(1.6, 2.6), radius: 1.2 });
  }

  // --- spine hubbas -----------------------------------------------------------
  // The level data's kickers alternate sides down the spine — both +Z kickers sit at x = -2.4,
  // both -Z kickers at x = +2.4 — so each half of the corridor has one side carrying every
  // obstacle and the other side carrying eight metres of bare carpet. That asymmetry is very
  // visible from the follow camera, because the empty side is exactly where the camera lags.
  //
  // An 8 m ledge in the empty lane balances it and, more usefully, gives each half of the spine
  // a THIRD parallel line: kicker lane, ledge, floor rail. Three lines a metre and a half
  // apart is a corridor you can slalom; one line is a corridor you drive down.
  for (const sz of [-1, 1]) {
    const lx = sz > 0 ? 2.72 : -2.72;   // opposite the kickers in that half
    const cz = sz * 10.4;
    if (blocked(keepClear, lx, cz, 0.6, 4.2)) continue;
    place(acc, makeLedgeBlock({
      width: 8.0,
      depth: 0.92,
      height: 0.52,
      seed: 4200 + sz,
      stripe: sz > 0 ? ACCENT_TEAL : ACCENT_ORANGE,
    }), lx, 0, cz, Math.PI / 2, { collide: true, grind: true });
    acc.wear.push({ x: lx - Math.sign(lx) * 1.3, z: cz, width: 2.4, depth: 8.4, strength: 0.35 });
    for (let k = -1; k <= 1; k++) {
      acc.paperSeeds.push({ x: lx - Math.sign(lx) * rand(0.9, 1.8), z: cz + k * 3.0, radius: 1.1 });
    }
  }

  // ---------------------------------------------------- cross-arm wall clutter ---
  // The arms only ever got skate furniture; the 1.5 m strip between the furniture and the
  // corridor wall stayed showroom-clean for eighteen metres in both directions, which is a
  // large share of what reads as "empty". Same rules as the spine: hard against the wall,
  // never in the skate line.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wz = sz * (CROSS_HALF - 0.55);
      // This arm's transitions live on the wall opposite the level's floor rail; on that side
      // the clutter loop has to step around them.
      const transitionSide = (sx > 0 ? -1 : 1) === sz;
      for (let x = sx * (SPINE_HALF + 1.6); Math.abs(x) < crossEndX - 1.0; x += sx * rand(1.8, 4.2)) {
        if (transitionSide && [8.6, 14.2, 19.6].some((b) => Math.abs(Math.abs(x) - b) < 2.9)) continue;
        if (blocked(keepClear, x, wz, 0.6, 0.6)) continue;
        const roll = rng();
        const accent = chance(0.2);
        let prop: THREE.Object3D;
        if (roll < 0.18) prop = makeBoxStack({ seed: Math.round(x * 5) + 131 });
        else if (roll < 0.34) prop = makeCardboardBox({ variant: 1, seed: Math.round(x * 7) + 137 });
        else if (roll < 0.48) prop = makeTrashCan({ variant: 1, seed: Math.round(x * 11) + 139, accent });
        else if (roll < 0.60) prop = makePottedPlant({ variant: 0, seed: Math.round(x * 13) + 149 });
        else if (roll < 0.70) prop = makeFilingCabinet({ variant: 1, seed: Math.round(x * 17) + 151, accent });
        else if (roll < 0.78) prop = makeWaterCooler({ variant: 1, seed: Math.round(x * 19) + 157 });
        else if (roll < 0.86) prop = makePrinter({ variant: 1, seed: Math.round(x * 23) + 163 });
        else prop = makeDeskChair({ variant: 1, seed: Math.round(x * 29) + 167, knocked: roll > 0.94 });
        place(acc, prop, x, 0, wz, rand(0, Math.PI * 2), { collide: 2 });
        if (chance(0.55)) acc.paperSeeds.push({ x: x + rand(-1.1, 1.1), z: wz - sz * 0.9, radius: 1.0 });
      }
    }
  }

  // Aisle clutter so the spine itself isn't a bare carpet strip: boxes, bins, plants and the
  // chairs somebody rolled out of the way, tucked against the corridor wall, never in the
  // skate line. Twice the previous density: the refs are MESSY, and one prop every six metres
  // of a 46 m corridor is not messy, it is tidy.
  // BOTH walls, not one at random. Rolling a side per step meant a 46 m corridor got roughly
  // ten props spread over ninety metres of wall, i.e. one every nine metres, which no camera
  // reads as clutter. Walking both walls independently doubles it, and the props stay in the
  // 0.5 m service strip the skate line never touches.
  const aisleEdge = SPINE_HALF - 0.5;
  for (const sx of [-1, 1]) {
    for (let z = -halfD + 4; z < halfD - 4; z += rand(1.7, 3.4)) {
      if (Math.abs(z) < CROSS_HALF + 1.2) continue;
      const x = sx * aisleEdge;
      if (blocked(keepClear, x, z, 0.6, 0.6)) continue;
      const roll = rng();
      const accent = chance(0.22);
      let prop: THREE.Object3D;
      if (roll < 0.20) prop = makeCardboardBox({ variant: 1, seed: Math.round(z * 3) + 61 * sx });
      else if (roll < 0.36) prop = makeTrashCan({ variant: 1, seed: Math.round(z * 7) + 67, accent });
      else if (roll < 0.50) prop = makePottedPlant({ variant: 0, seed: Math.round(z * 11) + 71 });
      else if (roll < 0.62) prop = makePrinter({ variant: 1, seed: Math.round(z * 13) + 73 });
      else if (roll < 0.70) prop = makeFireExtinguisher({ seed: Math.round(z * 17) + 79 });
      else if (roll < 0.82) prop = makeBoxStack({ seed: Math.round(z * 19) + 83 });
      else prop = makeDeskChair({ variant: 1, seed: Math.round(z * 23) + 89, knocked: roll > 0.91 });
      place(acc, prop, x, 0, z, rand(0, Math.PI * 2), { collide: 2 });
      if (chance(0.6)) acc.paperSeeds.push({ x: x - sx * 0.9, z: z + rand(-1.2, 1.2), radius: 0.9 });
      // Stacked on top: the "this floor is being decommissioned" read, and a second silhouette
      // height off one footprint.
      if (roll < 0.30 && chance(0.4)) {
        place(acc, makeCardboardBox({ variant: 1, seed: Math.round(z * 31) + 97 }), x + rand(-0.12, 0.12), 0.36,
          z + rand(-0.12, 0.12), rand(0, Math.PI), { collide: false });
      }
    }
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
    for (let t = -span / 2 + 2.2; t < span / 2 - 2.2; t += rand(0.8, 2.3)) {
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
  //
  // 320 sheets, up from 160. Two things changed since that number was picked: the clustering
  // pass landed (so sheets pile where something happened instead of dusting the plate evenly),
  // and the seed list has roughly doubled with the transitions, islands and arm clutter. Loose
  // paper is the single cheapest thing in the refs — it is in every one of them, in drifts —
  // and at 18 triangles a sheet the whole storm is one mesh and 5,800 triangles.
  const paper = makeScatterPaper(320, W - 6, D - 6, { seed: 7, clusters: acc.paperSeeds });
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

  // ---------------------------------------------------- CEILING SELF-CHECK ---
  // The suspended ceiling has now gone missing from an establishing shot twice, and both times
  // the first hour went on deciding whether it was a build bug, a merge bug or a culling bug.
  // So the builder answers that question itself, at build time, out loud:
  //
  //   * does the batch contain geometry at all,
  //   * does it span the full plate (a grid built at the wrong size leaves a bare rim),
  //   * does it sit AT the ceiling plane (a troffer that loses its Y translation in the merge
  //     lands on the carpet as a blown-out white slab, which looks exactly like a broken
  //     lightmap), and
  //   * did every troffer we asked for actually survive into the batch.
  let ceilMeshes = 0;
  ceilingBatch.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) ceilMeshes++;
  });
  const ceilBox = new THREE.Box3().setFromObject(ceilingBatch);
  const troffersWanted = panelCountX * panelCountZ;
  if (typeof console !== 'undefined') {
    const span = ceilBox.isEmpty() ? 0 : ceilBox.max.x - ceilBox.min.x;
    const problems: string[] = [];
    if (!ceilMeshes) problems.push('ceiling batch is EMPTY');
    if (span < W - TILE * 2) problems.push(`ceiling spans ${span.toFixed(1)} m of a ${W} m plate`);
    if (!ceilBox.isEmpty() && ceilBox.min.y < H - 1.9) {
      problems.push(`ceiling reaches y=${ceilBox.min.y.toFixed(2)}, expected >= ${(H - 1.9).toFixed(2)}`);
    }
    if (problems.length) console.warn(`[OfficeLevel] CEILING: ${problems.join('; ')}`);
    else {
      console.log(
        `[OfficeLevel] ceiling OK — ${ceilMeshes} draw calls, ${troffersWanted} troffers, ` +
        `plane y=${H}, batch y=[${ceilBox.min.y.toFixed(2)}, ${ceilBox.max.y.toFixed(2)}]`,
      );
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
      //
      // THE THRESHOLD IS ABOVE THE CEILING, NOT BELOW IT. It used to be H - 0.15, i.e. 15 cm
      // UNDER the tile plane, which meant an ordinary gameplay camera — the follow rig sits
      // around 2.6-3.2 m when the player is airborne off a kicker — crossed it while still
      // inside the room and deleted the entire ceiling for the duration of the jump. That is
      // the "the ceiling has vanished and there is a black void above the wall line" report:
      // not a build failure, a cutaway firing a whole ramp height too early.
      //
      // H + 0.3 is above the tile plane and above the deepest pendant canopy, so the ceiling
      // can only disappear once the camera is genuinely outside the room looking down.
      const inside = y < H + 0.3;
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
