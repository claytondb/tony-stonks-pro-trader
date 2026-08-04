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
 * ---------------------------------------------------------------------------
 * THE THREE LINES
 *
 * A level is not a set of features, it is a set of ROUTES through them, and a
 * route only exists if it has been ridden. These three have been, through
 * tools/play.mjs, which steps fixedUpdate() at a fixed 1/60 with rendering off —
 * so the scripts below reproduce exactly. Every one of them is a single unbroken
 * combo from the first feature to the last.
 *
 *   THE BENCH TO THE STAIRWELL HIP        16 s
 *     node tools/play.mjs --level ch1_office --duration 16 \
 *       --script "W:0-16,L:0-16,Space:1.9@tap,Space:5@tap"
 *     Long Bench north out of spawn -> bank the stairwell head-on -> the hip's
 *     nose rail -> down onto the loop's north straight -> north-east corner
 *     ledge -> east straight.
 *     15.25 s combo, 25 tricks, 12 grinds, 219 m, 1.3% dead.
 *
 *   THE COPIER ARM LAP                    24 s
 *     node tools/play.mjs --level ch1_office --duration 24 \
 *       --script "A:0-0.75,W:0-24,L:1.2-24,Space:9@tap"
 *     Carve into the east arm at spawn -> arm ledge -> through the loop wall's
 *     east mouth onto the mouth ledge -> east straight -> north-east corner ->
 *     north straight -> back down the spine.
 *     17.1 s combo, 23 tricks, 16 grinds, 289 m.
 *
 *   THE BOARDROOM LAP                     30 s
 *     node tools/play.mjs --level ch1_office --duration 30 \
 *       --script "S:0-0.4,A:0-1.5,W:0.4-30,L:1.8-30"
 *     Turn at spawn -> spine floor rail south -> up the conference table and
 *     along its outboard rail -> the south end-wall bank -> south straight ->
 *     south-east corner -> east straight -> north-east corner -> home.
 *     28.15 s combo, 45 tricks, 22 grinds, 427 m.
 *
 * And the park LOOPS: 45 s holding W and L with three ollies is ONE combo of
 * 44.25 s, 55 tricks, 28 grinds, 609 m, 0.7% of the session below walking pace.
 * There is nowhere in this level a player has to stop and turn around.
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

/**
 * Scale a geometry's UVs in place, once per distinct attribute object (withUV1 clones, but be
 * defensive — an aliased uv1 would otherwise get the factor applied twice).
 *
 * This exists so wall bands can be drawn with the SAME `drywall` material instance the props
 * use. Tiling density asked for as a material `repeat` forks the texture set, forks the merge
 * bucket, and costs a permanent draw call; the same density expressed in the vertices is free.
 */
function scaleUV(g: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const seen = new Set<unknown>();
  for (const name of ['uv', 'uv1']) {
    const a = g.getAttribute(name);
    if (!a || seen.has(a)) continue;
    seen.add(a);
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv);
    a.needsUpdate = true;
  }
  return g;
}

function plane(w: number, h: number, uv?: [number, number]): THREE.BufferGeometry {
  const g = withUV1(new THREE.PlaneGeometry(w, h));
  return uv ? scaleUV(g, uv[0], uv[1]) : g;
}

function box(w: number, h: number, d: number, uv?: [number, number]): THREE.BufferGeometry {
  const g = withUV1(new THREE.BoxGeometry(w, h, d));
  return uv ? scaleUV(g, uv[0], uv[1]) : g;
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
// THE LOOP — the numbers below are the whole level design, so they are derived
// from the game's own constants rather than picked by eye.
//
//   cruise speed        11-13 m/s   (measured through tools/play.mjs, median over a
//                                   45 s run holding W: 13.2)
//   grind cooldown         0.80 s   GrindSystem.GRIND_COOLDOWN_TIME
//                                   => rail END to next rail START must exceed 12 m
//   THE GAP BUDGET         0.85 s   and it is NOT the 1.8 s combo window.
//                                   ScoreSystem holds the combo clock while airborne,
//                                   grinding or manualing, so the window never runs
//                                   while you are on something. What actually ends a
//                                   line is Game.pendingBankAt: touch down with
//                                   nothing under you and the position BANKS after
//                                   LANDING_GRACE, 0.40 s. A rail exit pops the chair
//                                   (~0.45 s of hangtime), so a run that presses no
//                                   button survives about 0.85 s of nothing.
//                                   At 11.4 m/s that is 9.7 m, and 9.7 m — not 37 —
//                                   is the number every gap on the loop is measured
//                                   against. Every gap on a lap is now under 6.0 m.
//   grind capture radius   1.50 m   GrindSystem.SNAP_DISTANCE
//                                   => every point of a lane must be within 1.5 m
//                                      of a rail, or the rail is decoration
//   step-over height       0.42 m   Game.STEP_HEIGHT
//                                   => a 0.42 m ledge is ridden OVER, never into
//   turn rate             3.6 rad/s => min turn radius at 15 m/s is 4.2 m
//
// RING_IN and the building wall are the two sides of a 6.1 m racetrack running
// the whole perimeter, and RING_MID carries a 2.4 m wide low ledge down the
// middle of it. The ledge is that wide for one reason: jammed against EITHER
// wall the chair's centre is 1.40 m from the near grind edge, inside the 1.50 m
// capture radius. Anywhere on the loop, pressing grind catches something. That
// is the single decision that turns "there are rails in the level" into "the
// level is made of lines" — an earlier cut had the racing line 3.9 m from the
// wall and a run that drifted wide simply stopped being able to grind.
// RING_OUT WAS WRONG BY 0.6 m AND IT COST THE LOOP ITS OUTSIDE LANE.
// The building wall's collider is `halfExtents 0.3` centred 0.3 m OUTSIDE the visible plane at
// +/-halfW, so its inner face is at halfW = 23.0, not 22.4. A chair jammed against it therefore
// parks its centre at 22.6, and with the ledge on 19.4 x 2.4 the nearest grind edge was 2.03 m
// away — outside GrindSystem.SNAP_DISTANCE. Measured: a run that took the south-east chamfer
// wide spent 2.2 s hugging the east wall unable to catch anything, and the position cashed out.
// The whole point of the ledge's width is that grind is ALWAYS available on the loop, so the
// numbers are now derived from the real faces: lane 16.35 (cubicle wall) to 23.0 (building
// wall), ledge centred in it at 19.7, and wide enough that both wall-jammed positions are
// inside 1.5 m of an edge (1.43 m outboard, 1.47 m inboard).
const RING_IN = 16.3;      // inner face of the loop: the cubicle wall line
const RING_OUT = 23.0;     // outer face: the building wall's collider face
const RING_MID = 19.7;     // the racing line, and where the loop's ledges sit
const RING_LEDGE_D = 3.0;  // ledge depth; its two grind edges sit at +/-1.47
const RING_LEDGE_HALF = 9; // ledges span +/-9 m of each side's centre
const CHAMFER = 4.4;       // 45-degree corner cut, measured back from RING_OUT

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
  // THE REPEAT IS THE LIBRARY'S, AND THE DENSITY LIVES IN THE UVs.
  //
  // These bands used to ask for `drywall` at [W/4, H/2.6]. OfficeProps' partition walls ask for
  // the SAME surface at the library default [3, 2]. Two repeats = two texture sets = two merge
  // buckets = a permanent extra draw call for a wall that is already merged into the batch. So
  // the material is now shared and the tiling is baked into each band's UVs via WALL_UV, which
  // reproduces exactly the density that shipped.
  const WALL_REPEAT: [number, number] = [3, 2];
  const WALL_UV: [number, number] = [W / 4 / WALL_REPEAT[0], H / 2.6 / WALL_REPEAT[1]];
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
    const upper = new THREE.Mesh(plane(spec.w, H - DADO_H - RAIL_H, WALL_UV), wallMat);
    upper.receiveShadow = true;
    upper.castShadow = false;
    place(acc, upper, inX, (H + DADO_H + RAIL_H) / 2, inZ, spec.rotY, { collide: false });

    // Saturated dado. Proud of the plaster by 25 mm so the rail throws a real shadow line.
    const dado = new THREE.Mesh(box(spec.w, DADO_H, 0.05, WALL_UV), dadoMat);
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
    const band = new THREE.Mesh(plane(spec.w, 1.9, WALL_UV), parapetMat);
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

  // ============================================================== THE PARK ===
  //
  // The plate is a CIRCUIT with a chord across it, not a room with props in it:
  //
  //          +---------------- THE LOOP (north straight) ---------------+
  //          |   .-- perimeter quarter pipes backed onto the wall --.   |
  //          |   |          16 m ledge on the racing line           |   |
  //   corner |   +----------- cubicle wall, cap rail 1.40 ----------+   | corner
  //   chamfer|   |    pod bay          | spine |         pod bay    |   | chamfer
  //          |   |        --- cross corridor ---------              |   |
  //          |   |    pod bay          | spine |         pod bay    |   |
  //          |   +--------------------------------------------------+   |
  //          +---------------- THE LOOP (south straight) ---------------+
  //
  //   THE LOOP        a 4.8 m walled racetrack round the whole perimeter, with a
  //                   16 m grind ledge down the middle of every straight. The
  //                   corners are 45-degree chamfer walls: they DEFLECT rather
  //                   than stop (see Game.resolveObstacles), so a player who
  //                   simply holds forward is steered round the corner and set
  //                   back down on the next straight's ledge. A lap is ~145 m,
  //                   ~9.7 s at cruise, four grinds — and the combo window is
  //                   2.5 s, so the position stays open for the whole lap.
  //   THE LONG BENCH  a single unbroken 28 m ledge down the spine at x = 0, the
  //                   level's signature. It is the chord across the loop, it is
  //                   what the player is looking straight down at spawn, and it
  //                   is the longest grind in the game (~1.9 s). Enter the loop,
  //                   cut the chord, rejoin the loop: a figure of eight.
  //   THE CROSS       the east/west arms, carrying the level data's floor rails,
  //                   feed the loop's east and west straights.
  //
  // Every rail this file registers is on one of those lines. The previous build
  // registered 211 — 140 of them cubicle-pod tops out in the middle of the pod
  // field, reachable only from the air and leading nowhere. Quantity was never
  // the problem; a rail nothing feeds into is not a feature, it is decoration.
  const AISLE_H = 1.32; // the hero grind line height, constant along every corridor
  const CAP_TOP = AISLE_H + 0.08;

  /**
   * Lay a continuous run of cubicle panelling and register ONE unbroken grind rail for the
   * whole run. Geometry is chunked into WALL_SEG panels (real cubicle systems are panelised,
   * and it keeps per-chunk bounding spheres tight for culling) but the SKATE LINE is single:
   * the player commits to it once and holds it.
   */
  function runWall(x0: number, z0: number, x1: number, z1: number, height = AISLE_H): void {
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

    // Inset for the same reason runLedge insets: a cap rail that ends flush with the wall
    // it caps ends AT the corner where the next wall starts, and the grind exit teleports
    // the chair into it.
    const top = height + 0.08;
    const inset = Math.min(0.8, len * 0.1);
    acc.rails.push({
      start: new THREE.Vector3(x0 + (dx / len) * inset, top, z0 + (dz / len) * inset),
      end: new THREE.Vector3(x1 - (dx / len) * inset, top, z1 - (dz / len) * inset),
    });
  }

  /**
   * Lay a run of low ledge blocks nose to tail along a line and register the run's TWO edge
   * rails as single unbroken grinds.
   *
   * Why not let each block publish its own grind edges: a 16 m line built from four blocks
   * would register eight 4 m rails, and GrindSystem rejects any capture with under 0.8 m of
   * rail left ahead — so the last fifth of every block is dead, and the 0.8 s re-grind
   * cooldown then swallows the next block whole. One rail per RUN is what makes the run
   * behave like one feature.
   *
   * The height is 0.42 m on purpose: that is exactly Game.STEP_HEIGHT, so the chair rolls
   * ONTO a ledge it clips instead of being stopped by it. Nothing on the racing line may
   * ever end a run.
   */
  function runLedge(
    x0: number, z0: number, x1: number, z1: number,
    o: { height?: number; depth?: number; stripe?: number; seed?: number } = {},
  ): void {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1) return;
    const h = o.height ?? 0.42;
    const d = o.depth ?? 1.2;
    const yaw = Math.atan2(dx, dz) - Math.PI / 2;
    const n = Math.max(1, Math.round(len / 4.6));
    const segLen = len / n;

    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      place(acc, makeLedgeBlock({
        width: segLen - 0.09,
        depth: d,
        height: h,
        seed: (o.seed ?? 3000) + i * 7,
        stripe: o.stripe,
      }), x0 + dx * t, 0, z0 + dz * t, yaw, { collide: true, grind: false });
    }

    // RAILS ARE INSET FROM THE GEOMETRY. GrindSystem.endGrind teleports the chair to the
    // rail's endpoint; the chair is a 0.4 m capsule, so an endpoint sitting flush against
    // the next prop drops it inside that prop's collider and Rapier answers a 0.4 m
    // penetration with an impulse that fires the chair out of the building. (It did — a run
    // exiting a loop ledge next to a ramp toe reached y = 57 and z = -90.) Ending the rail
    // half a metre short of the block it lives on costs nothing and makes every exit land
    // in clear air.
    const px = -dz / len;
    const pz = dx / len;
    const off = d / 2 - 0.03;
    const y = h + 0.02;
    const inset = Math.min(0.55, len * 0.12);
    const ix = (dx / len) * inset;
    const iz = (dz / len) * inset;
    for (const s of [-1, 1]) {
      acc.rails.push({
        start: new THREE.Vector3(x0 + ix + px * off * s, y, z0 + iz + pz * off * s),
        end: new THREE.Vector3(x1 - ix + px * off * s, y, z1 - iz + pz * off * s),
      });
    }
    acc.wear.push({
      x: (x0 + x1) / 2, z: (z0 + z1) / 2,
      width: Math.abs(dx) + 2.4, depth: Math.abs(dz) + 2.4,
      strength: 0.32,
    });
  }

  // ------------------------------------------------- the loop's inner wall ---
  // A cubicle-panel wall all the way round the pod field, with a mouth where each corridor
  // meets the loop. The cap is the loop's HIGH line: four 11 m rails per side at 1.40 m,
  // ollie height from the racing line, so the loop can be run low (ledges) or high (caps).
  const CHAM_A = RING_OUT - CHAMFER;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // North / south inner wall, broken by the spine mouth.
      runWall(sx * SPINE_HALF, sz * RING_IN, sx * RING_IN, sz * RING_IN);
      // East / west inner wall, broken by the cross mouth.
      runWall(sx * RING_IN, sz * CROSS_HALF, sx * RING_IN, sz * RING_IN);
      // 45-degree corner chamfer. This is the piece that makes the loop a loop: it meets an
      // incoming line at 45 degrees, and resolveObstacles slides the chair along the face
      // instead of stopping it, so the corner is taken at speed with no input at all.
      runWall(sx * RING_OUT, sz * CHAM_A, sx * CHAM_A, sz * RING_OUT);
    }
  }

  // --------------------------------------------- the loop's racing surface ---
  // TWO 9.7 m ledges per straight with a MOUTH between them, and the mouth is always where
  // something joins the loop: the spine north and south, the cross east and west. The mouths
  // and the corners are filled in below; this is the ring's four straights.
  //
  // The spacing is arithmetic, not taste, and the number it is measured against is 0.85 s of
  // NOTHING (see THE GAP BUDGET at the top of the file), which at the game's real 11-13 m/s
  // cruise is 9.7-11 m. The old arithmetic here was done against a 15 m/s cruise that the game
  // no longer has, and every line in it came out flattering. What it actually measured:
  //
  //                                     CLAIMED       MEASURED at 11.4     NOW
  //   mouth gap, ledge end to start     10.5 m 0.70   10.5 m  0.92  OVER   ledge, 1.1 m hop
  //   corner, ledge end to next start     11 m 0.73    11.3 m 0.99  OVER   ledge, 0.6 m hop
  //   south mouth (boardroom table)         not costed  14.0 m 1.23 OVER   table rail, 3.6 m
  //   north mouth (stairwell)               not costed  11.6 m 1.02 OVER   stair hip, 4.4 m
  //
  // i.e. all four mouths and all four corners were over budget, which is why a run that held
  // grind round the loop kept cashing out in the same eight places. With the mouth ledges, the
  // corner ledges, the boardroom table's outboard rail and the stairwell hip in, a lap is ~170 m
  // of ring with no gap over 6 m, and a 45 s harness run holding W and L scores ONE combo:
  // 44.25 s, 55 tricks, 28 grinds, 609 m, 0.7% dead time.
  const LOOP_STRIPE = [0xe8722a, 0x2f6f7d];
  const MOUTH_HALF = 5.25;     // half-width of the mouth in the middle of each straight
  // Ledges run out to +/-16.0, then the corner. They used to stop at 14.6, which left the corner
  // transition an 8.0 m carpet gap once the ledge moved outboard to RING_MID 19.7 — 0.70 s, most
  // of the budget, on all four corners. Running them out to the chamfer's shoulder puts the
  // corner hop at 6.0 m / 0.53 s and the whole lap inside the no-input budget.
  const LOOP_END = RING_LEDGE_HALF + 7.0;
  const loopRuns: [number, number, number, number][] = [
    [-LOOP_END, RING_MID, -MOUTH_HALF, RING_MID],   // north-west half, ridden +X
    [MOUTH_HALF, RING_MID, LOOP_END, RING_MID],     // north-east half, ridden +X
    [RING_MID, LOOP_END, RING_MID, MOUTH_HALF],     // east-north half, ridden -Z
    [RING_MID, -MOUTH_HALF, RING_MID, -LOOP_END],   // east-south half, ridden -Z
    // The south mouth is 1.2 m wider each side than the others: the conference-table ramps
    // stand in it, and a rail end has to finish clear of a collider (see runLedge).
    [LOOP_END, -RING_MID, MOUTH_HALF + 1.2, -RING_MID],   // south-east half, ridden -X
    [-(MOUTH_HALF + 1.2), -RING_MID, -LOOP_END, -RING_MID], // south-west half, ridden -X
    [-RING_MID, -LOOP_END, -RING_MID, -MOUTH_HALF], // west-south half, ridden +Z
    [-RING_MID, MOUTH_HALF, -RING_MID, LOOP_END],   // west-north half, ridden +Z
  ];
  loopRuns.forEach((r, i) => {
    runLedge(r[0], r[1], r[2], r[3], {
      height: 0.42, depth: RING_LEDGE_D, stripe: LOOP_STRIPE[(i >> 1) % 2], seed: 3100 + i * 31,
    });
  });

  // ------------------------------------------------------- THE ARM CROSSINGS ---
  // The east and west mouths were the last two holes in the lap. The arithmetic above was done
  // against a 15 m/s cruise; the game now cruises at 11.4, and at 11.4 the 10.5 m mouth is
  // 0.92 s of nothing — past the ~0.85 s a position survives on a rail pop alone. Both mouths
  // measured as combo deaths.
  //
  // So the mouth gets a ledge too, at the same 0.42 m the whole loop rides at, which is exactly
  // STEP_HEIGHT: an arm run arriving broadside at 12 m/s ROLLS OVER IT rather than into it, so
  // the mouth is still a mouth. (The level data's arm floor rails have no collider — case 'rail'
  // in Game.createLevelObject registers a grind and no physics — so the 0.3 m where they overlap
  // this ledge costs nothing.) With this in, the loop's four straights and four chamfers are one
  // unbroken 160 m grind line and the longest gap on a lap is the 4.4 m over the stairwell hip.
  //
  // IT ABUTS THE LOOP RUNS EXACTLY. An earlier cut stopped 0.35 m short of them at each end, and
  // 0.35 m is the worst possible number: too narrow for a 0.4 m chair to fall into and too wide
  // to roll across, so a run coming off the mouth ledge dropped its 0.42 m and hit the face of
  // the next one. Measured: runs REVERSED at both mouths, ping-ponging up and down the east and
  // west straights instead of lapping. Nose to tail, the joint is the same 0.09 m as every other
  // joint inside a run, and the loop is continuous.
  for (const s of [-1, 1]) {
    runLedge(s * RING_MID, -MOUTH_HALF, s * RING_MID, MOUTH_HALF, {
      height: 0.42, depth: RING_LEDGE_D, stripe: LOOP_STRIPE[s > 0 ? 1 : 0], seed: 3160 + s * 11,
    });
  }

  // ---------------------------------------------------- THE CORNER LEDGES ---
  // A 45-degree ledge joining the two straights' ledge ends, one per corner, sitting inside the
  // chamfer wall and parallel to it. This is the last piece of the ring.
  //
  // The chamfer was doing half the job: it DEFLECTS a run round the corner but it puts nothing
  // under it, so the corner was 6 m of bare carpet between the last rail of one straight and the
  // first of the next — and a run that arrived wide simply bounced. Measured on the south-east
  // corner with nothing there: a 17.4 m/s lap ran off the end of the east ledge at z = -16.4,
  // was shoved back out by the corner, and REVERSED, ping-ponging up the east straight instead of
  // continuing the lap. Now the corner is 5.2 m of grindable 45-degree ledge with a 0.6 m hop at
  // each end, the ring is one continuous line all the way round, and a lap is eight straights,
  // four corners and four mouth crossings without a single gap over 0.6 s.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      runLedge(sx * RING_MID, sz * LOOP_END, sx * LOOP_END, sz * RING_MID, {
        height: 0.42, depth: RING_LEDGE_D, stripe: LOOP_STRIPE[sx * sz > 0 ? 0 : 1],
        seed: 3180 + sx * 7 + sz * 3,
      });
    }
  }

  // ================================================== THE BOARDROOM TABLE ====
  // The level data puts a 7 x 4 m conference table (a fun box, deck at 0.80 m) at z = -18 —
  // which lands it squarely in the middle of the loop's south straight, and a 0.80 m box is
  // 38 cm above Game.STEP_HEIGHT, i.e. a wall the chair cannot climb. Left alone it is the
  // one thing on the circuit that can stop a run dead.
  //
  // So bank all three approaches. The south straight now rides UP onto the table, across
  // seven metres of boardroom at 0.80 m, and off the far side; the spine's south mouth ramps
  // onto the same deck head-on. That is the level's set piece, it is on the fastest straight,
  // and it is made of a prop the level data already owned.
  const TABLE_Z = -18;
  const TABLE_HALF_X = 3.5;
  const TABLE_H = 0.80;
  const TABLE_QP_D = 1.5;
  for (const s of [-1, 1]) {
    // Lip against the table's +/-X face, toe pointing out along the straight.
    place(acc, makeQuarterPipe({
      width: 4.3, depth: TABLE_QP_D, height: TABLE_H, seed: 4400 + s,
    }), s * (TABLE_HALF_X + TABLE_QP_D / 2 + 0.05), 0, TABLE_Z, s > 0 ? -Math.PI / 2 : Math.PI / 2, {
      collide: true, grind: true,
    });
  }
  // And head-on from the spine mouth.
  place(acc, makeQuarterPipe({
    width: 6.8, depth: TABLE_QP_D, height: TABLE_H, seed: 4410,
  }), 0, 0, TABLE_Z + 2.0 + TABLE_QP_D / 2 + 0.05, Math.PI, { collide: true, grind: true });
  acc.wear.push({ x: 0, z: TABLE_Z + 3.4, width: 8.0, depth: 3.0, strength: 0.55 });
  acc.paperSeeds.push({ x: rand(-2.5, 2.5), z: TABLE_Z + 3.2, radius: 1.6 });

  // THE TABLE'S OUTBOARD EDGE — the single most valuable rail in the level, and it was missing.
  //
  // Game.createFunBoxMesh draws a metal rail along both long edges of the deck but registers
  // NOTHING: the fun_box case adds a collider and no grind. So the only rails anywhere near the
  // table were the three quarter-pipe copings, two of which run ACROSS the loop's south straight
  // rather than along it. Measured consequence: the south straight's two ledges end at |x| = 7.0
  // and the next feature a run travelling -X could catch was 14 m away — 1.23 s at cruise, and
  // the position only survives about 0.85 s of nothing (a rail pop is ~0.45 s of hangtime plus
  // Game.LANDING_GRACE 0.40 s). The whole south side of the loop was a combo guillotine.
  //
  // Registering the outboard edge splits that 14 m into 3.6 m + a 6.8 m grind + 3.6 m: hops of
  // 0.32 s with a grind between them, and the position never closes. The deck sits at 0.80 and
  // the ledges at 0.42, so the quarter pipes either side do the lifting — this is a real
  // transfer, not a freebie.
  acc.rails.push({
    start: new THREE.Vector3(-TABLE_HALF_X + 0.1, TABLE_H + 0.04, TABLE_Z - 2.0 + 0.03),
    end: new THREE.Vector3(TABLE_HALF_X - 0.1, TABLE_H + 0.04, TABLE_Z - 2.0 + 0.03),
  });

  // =================================================== THE STAIRWELL HIP =====
  // The level data's "stairs" at z = +20 are not stairs to the physics: Game.createLevelObject
  // approximates them as ONE static box, 3.0 x 1.25 x 1.5, standing dead centre in the spine's
  // north mouth and straddling the loop's north straight. 1.25 m is three times STEP_HEIGHT.
  //
  // It is the exact mirror of the conference table's problem and it gets the exact mirror of its
  // solution. Measured before this existed: a run up the spine holding W hit it at z = 18.9 and
  // was doing 0.0 m/s — a full stop, in the one place in the level the tutorial's letter route
  // and the "Stairwell Gap" both send you. Now:
  //
  //   from the spine  bank up the head-on lip, pop off a 1.25 m deck   -> the Stairwell Gap
  //   round the loop  bank up the side lip, grind 2.8 m of stair nose, bank down the far side
  //
  // and the loop's north straight closes: its ledges end at |x| = 5.8, the nose rails start at
  // |x| = 1.4, so the longest gap on that side drops from 11.6 m (1.02 s, over the ~0.85 s a
  // position survives with no input) to 4.4 m (0.39 s). The north mouth is a feature now, not a
  // hole with a wall in it.
  const STAIR_Z = 20;
  const STAIR_HALF_X = 1.5;   // Game.createLevelObject: halfExtents.x
  const STAIR_HALF_Z = 0.75;  // steps * 0.3 / 2
  const STAIR_H = 1.25;       // steps * 0.25
  // THE SIDE LIPS ARE LONG ON PURPOSE. A quarter pipe's stepped collider only reaches full
  // height in its last few centimetres, so a short one is invisible to a player who arrives
  // AIRBORNE — and everybody arrives here airborne, because the loop ledge ends 5.8 m out and a
  // rail exit pops the chair. Measured with a 1.7 m lip: a 15.7 m/s run flew straight over it,
  // hit the side of the stair box at chair height and went to 0.16 m/s. At 3.6 m the toe starts
  // 0.65 m from the end of the ledge rail, so the run is ON the transition before it can leave
  // the ground, and rides up instead of into.
  const STAIR_QP_D = 3.6;
  for (const s of [-1, 1]) {
    place(acc, makeQuarterPipe({
      width: 2.6, depth: STAIR_QP_D, height: STAIR_H, seed: 4500 + s,
    }), s * (STAIR_HALF_X + STAIR_QP_D / 2 + 0.05), 0, STAIR_Z - 0.3, s > 0 ? -Math.PI / 2 : Math.PI / 2, {
      collide: true, grind: true,
    });
  }
  // Head-on from the spine. Its toe points -Z, back down the corridor the player arrives along.
  place(acc, makeQuarterPipe({
    width: 3.4, depth: 2.4, height: STAIR_H, seed: 4510,
  }), 0, 0, STAIR_Z - STAIR_HALF_Z - 1.2 - 0.05, 0, { collide: true, grind: true });
  // The nose of the flight, both edges, so the hip can be grinded in either loop direction.
  for (const s of [-1, 1]) {
    acc.rails.push({
      start: new THREE.Vector3(-STAIR_HALF_X + 0.1, STAIR_H + 0.04, STAIR_Z + s * (STAIR_HALF_Z - 0.03)),
      end: new THREE.Vector3(STAIR_HALF_X - 0.1, STAIR_H + 0.04, STAIR_Z + s * (STAIR_HALF_Z - 0.03)),
    });
  }
  acc.wear.push({ x: 0, z: STAIR_Z - 3.0, width: 7.0, depth: 3.2, strength: 0.5 });
  acc.paperSeeds.push({ x: rand(-2.2, 2.2), z: STAIR_Z - 2.8, radius: 1.5 });

  // ================================================== THE END-WALL BANKS =====
  // The spine is 44 m of corridor pointed at two flat drywall faces, and until now that is
  // exactly how it ended. Both spine mouths measured as full stops in the harness — 12.9 m/s to
  // 0.0 at z = -22.6 coming off the boardroom table, and 11.9 m/s to 1.8 at z = 22.6 coming off
  // the north floor rail — because the run-out behind each set piece is barely two metres and
  // the building shell is the thing at the end of it.
  //
  // A THPS level never ends a corridor in a wall; it ends it in TRANSITION. These two banks turn
  // both spine mouths into the same move: charge the corridor, take the set piece, ride the back
  // wall, and come back into the room facing the way you came, with the position still open
  // because you never stopped moving. They are the reason the park LOOPS rather than dead-ends,
  // and they are the only floor-standing things allowed against the building wall — a ramp is
  // not an obstruction on the outer lane, it is the outer lane's ceiling.
  const END_BANK_D = 1.3;
  const END_BANK_H = 1.45;
  for (const sz of [-1, 1]) {
    place(acc, makeQuarterPipe({
      width: sz > 0 ? 12.0 : 13.0, depth: END_BANK_D, height: END_BANK_H, seed: 4600 + sz,
    }), 0, 0, sz * (RING_OUT - END_BANK_D / 2), sz > 0 ? 0 : Math.PI, { collide: true, grind: true });
    acc.wear.push({ x: 0, z: sz * (RING_OUT - 2.2), width: 11.0, depth: 2.2, strength: 0.4 });
  }

  // ------------------------------------------------------- the loop's banks ---
  // Quarter pipes standing in the loop's INNER lane with their coping flush with the cubicle
  // cap rail behind them, two to a straight. Pump the bank, pop the lip, hold the 11 m cap
  // rail: the loop can be run low on the ledge or high on the wall, and the bank is the
  // transfer between them. This is the level's vertical variety, and it is deliberately NOT
  // on the outer side — the building wall is the loop's outer boundary and has to stay a
  // clean, continuous face, or a wide line stops being able to reach the ledge at all.
  const QP_D = 1.4;
  for (const side of [0, 1, 2, 3]) {
    const along = side % 2 === 0 ? 'x' : 'z';      // 0/2 = north/south, 1/3 = east/west
    const sgn = side < 2 ? 1 : -1;
    const base = sgn * (RING_IN + QP_D / 2 + 0.05);
    for (const t of [-10.4, 10.4]) {
      const x = along === 'x' ? t : base;
      const z = along === 'x' ? base : t;
      if (blocked(keepClear, x, z, 2.6, 2.6)) continue;
      // rotY maps the ramp's local +Z (its tall end) onto (sin rotY, cos rotY); the tall end
      // has to sit against the cubicle wall, so it points back toward the middle of the room.
      const rotY = along === 'x' ? (sgn > 0 ? Math.PI : 0) : (sgn > 0 ? -Math.PI / 2 : Math.PI / 2);
      place(acc, makeQuarterPipe({
        width: 4.6, depth: QP_D, height: CAP_TOP - 0.06, seed: 3800 + side * 17 + Math.round(t),
      }), x, 0, z, rotY, { collide: true, grind: true });
      acc.wear.push({ x: x + (along === 'x' ? 0 : sgn * 1.9), z: z + (along === 'x' ? sgn * 1.9 : 0),
        width: 4.8, depth: 4.8, strength: 0.45 });
      acc.paperSeeds.push({ x, z: z + (along === 'x' ? sgn * 1.6 : 0), radius: 1.3 });
    }
  }

  // ----------------------------------------------------- corridor walls -----
  // The spine and the cross run from the plaza out to their mouths in the loop wall.
  for (const sx of [-1, 1]) {
    runWall(sx * SPINE_HALF, CROSS_HALF, sx * SPINE_HALF, RING_IN);
    runWall(sx * SPINE_HALF, -CROSS_HALF, sx * SPINE_HALF, -RING_IN);
    for (const sz of [-1, 1]) {
      runWall(sx * SPINE_HALF, sz * CROSS_HALF, sx * RING_IN, sz * CROSS_HALF);
    }
  }

  // ========================================================= THE LONG BENCH ==
  // The signature. A single unbroken 28 m ledge straight down the middle of the spine —
  // the longest grind in the level at ~1.9 s, the first thing in shot at spawn, and the
  // chord that turns the loop into a figure of eight.
  //
  // x = 0 is the one lane on the spine nothing else claims: the level data's kickers sit at
  // x = +/-2.4 (3.4 m wide, so their edge is at 0.7) and its floor rails at x = +/-4.0. The
  // bench is 1.2 m deep, edge at 0.6, which clears the kickers by 10 cm. It stops at
  // |z| = 14 so the conference-table fun box (z = -18) and the stairwell (z = 20) — and the
  // gap goals that reference both — keep their run-ups.
  const BENCH_HALF = 14;
  if (!blocked(keepClear, 0, 0, 0.7, BENCH_HALF)) {
    runLedge(0, -BENCH_HALF, 0, BENCH_HALF, {
      height: 0.42, depth: 1.2, stripe: 0xe8722a, seed: 3200,
    });
    for (let k = -2; k <= 2; k++) {
      acc.paperSeeds.push({ x: rand(-2.2, 2.2), z: k * 5.4, radius: 1.2 });
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

  // Corner dressing behind the chamfers: the leftover triangle at each corner of the
  // building, which the loop routes around. Props here are never on a line.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (halfW - 1.4);
      const cz = sz * (halfD - 1.4);
      if (blocked(keepClear, cx, cz, 1.2, 1.2)) continue;
      place(acc, makeBoxStack({ seed: 401 + sx * 3 + sz * 5 }), cx, 0, cz, rand(0, Math.PI), { collide: true });
      place(acc, makePottedPlant({ variant: 0, seed: 411 + sx * 7 + sz * 11 }),
        cx - sx * 1.9, 0, cz - sz * 0.4, 0, { collide: true });
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
      // collide:false — see THE SERVICE STRIP note above the aisle clutter. These four sit at
      // |x| = 4.7 and the level data's spine floor rails are at |x| = 4.0; a 0.4 m chair riding
      // that rail overlaps them, and a filing cabinet at the mouth of the level's longest rail
      // is a hard stop the player never sees coming.
      place(acc, cornerProps[corner % cornerProps.length](), cx, 0, cz, sx > 0 ? -Math.PI / 2 : Math.PI / 2, {
        collide: false,
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

  // The field now stops at the loop's inner wall instead of running to the building wall:
  // the outer 6 m of the plate is the racetrack. Two bays deep in each direction per
  // quadrant, which is what a 4.8 m loop plus two 5 m corridors leaves of a 46 m plate.
  const cols: number[] = [];
  for (let x = colBase, i = 0; x + POD_SIZE / 2 < RING_IN - 0.5; x += POD_PITCH + rand(-0.3, 0.3), i++) {
    cols.push(Number(x.toFixed(2)));
  }
  const rows: number[] = [];
  for (let z = rowBase; z + POD_SIZE / 2 < RING_IN - 0.5; z += POD_PITCH + rand(-0.3, 0.3)) {
    rows.push(Number(z.toFixed(2)));
  }

  // Landmark cells, addressed as `${sx}${sz}:${ci},${ri}`. Hand-placed, not rolled: the
  // point of a landmark is that the player learns where it is.
  const CONFERENCE_CELL = '1,1:1,1';
  const MANAGER_CELLS = ['-1,-1:0,1'];
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
          // POD TOPS ARE NOT REGISTERED AS RAILS ANY MORE.
          //
          // They used to be, and they were 140 of the level's 211 grind edges: 1.8 m panel
          // segments at 1.40 m, out in the middle of the pod field, with no ramp feeding
          // them and nothing to land on off the end. Every one of them was decoration that
          // the nearest-rail search still had to consider. The high line now lives on the
          // corridor and loop cap rails, which are 11-16 m long, sit beside a racing lane,
          // and lead somewhere.
          const grind = false;

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
  // SIGHTLINES. From the spawn intersection the player is looking down four corridors, and
  // each one has to terminate in something he can name, or he cannot navigate. Copier bank
  // east, vending alcove west, both set into the pod field beside the corridor mouth rather
  // than across it — the mouth itself is a skate line and stays clear.
  const MOUTH = RING_IN - 2.4;
  for (let i = -1; i <= 1; i++) {
    place(acc, makeCopier({ seed: 700 + i }), MOUTH + i * 0.05, 0, CROSS_HALF + 0.95, Math.PI, { collide: true });
  }
  place(acc, makeTrashCan({ variant: 0, seed: 711, accent: true }), MOUTH - 2.6, 0, CROSS_HALF + 0.8, 0, { collide: true });
  acc.paperSeeds.push({ x: MOUTH, z: CROSS_HALF - 0.7, radius: 1.6 });
  acc.wear.push({ x: MOUTH, z: CROSS_HALF - 1.1, width: 3.6, depth: 2.4, strength: 0.55 });

  for (const vz of [-0.6, 0.6]) {
    place(acc, makeVendingMachine({ seed: 720 + Math.round(vz * 10) }),
      -MOUTH + vz * 1.1, 0, -CROSS_HALF - 0.9, 0, { collide: true, lights: true });
  }
  place(acc, makeFireExtinguisher({ seed: 731 }), -MOUTH + 2.6, 0, -CROSS_HALF - 0.7, 0, { collide: true });
  acc.wear.push({ x: -MOUTH, z: -CROSS_HALF + 1.0, width: 3.0, depth: 2.4, strength: 0.45 });

  // ============================================================ THE PLAZA ====
  // The spawn intersection. Three parallel lines a metre and a half apart — the Long Bench
  // down the centre and a hero ledge either side — so the opening frame of the level says
  // "there is a grind within two metres of you in any direction", which is what the first
  // three seconds of a Tony Hawk level is for.
  const ACCENT_ORANGE = 0xe8722a;
  const ACCENT_TEAL = 0x2f6f7d;

  for (const sx of [-1, 1]) {
    const lx = sx * 3.4;
    if (blocked(keepClear, lx, 0, 0.55, 2.7)) continue;
    place(acc, makeLedgeBlock({
      width: 5.2, depth: 0.95, height: 0.42, seed: 3300 + sx,
      stripe: sx > 0 ? ACCENT_ORANGE : ACCENT_TEAL,
    }), lx, 0, 0, Math.PI / 2, { collide: true, grind: true });
    acc.wear.push({ x: lx, z: sx * 3.2, width: 2.2, depth: 2.6, strength: 0.5 });
  }

  // Planters on the two intersection corners the corridor walls do not turn through.
  //
  // HEIGHT IS LOAD-BEARING. makePlanterLedge's collider top is `height + 0.07` (the timber
  // cap), so `height: 0.4` built a 0.47 m box — five centimetres above Game.STEP_HEIGHT, i.e.
  // a WALL, standing in the plaza the player crosses more often than any other square metre of
  // the level. Measured in the harness: a run entering the plaza at 12.4 m/s hit this and was
  // doing 0.5 m/s two frames later, and the combo cashed out. 0.33 puts the cap at 0.40 and
  // the chair rolls over it. Anything on the racing line is either under STEP_HEIGHT or banked.
  for (const sx of [-1, 1]) {
    const px = sx * 4.15;
    const pz = -sx * 3.6;
    if (blocked(keepClear, px, pz, 1.3, 0.7)) continue;
    place(acc, makePlanterLedge({ width: 2.3, depth: 0.9, height: 0.33, seed: 3400 + sx }), px, 0, pz, 0, {
      collide: true, grind: true,
    });
  }

  // --- spawn banks ------------------------------------------------------------
  // A bank at the mouth of each arm, facing outward, so the opening frame says "there is
  // transition here" sideways as well as forward. x = +/-6.1 is the one lane in the arm
  // nothing else claims: the hero ledges stop at 3.9 and the arm ledges start at 7.6.
  for (const sx of [-1, 1]) {
    const bx = sx * 6.1;
    if (blocked(keepClear, bx, 0, 0.7, 1.7)) continue;
    place(acc, makeQuarterPipe({ variant: 1, width: 3.2, depth: 1.2, height: 0.62, seed: 3900 + sx }), bx, 0, 0,
      sx * Math.PI / 2, { collide: true, grind: true });
    acc.wear.push({ x: bx - sx * 1.5, z: 0, width: 2.4, depth: 3.4, strength: 0.45 });
  }

  // ============================================================== THE ARMS ===
  // The cross corridor is 9.2 m wide and carries the level data's floor rail down one side
  // of each arm (z = -2.6 east, z = +2.6 west, both at 0.80 m). The other side gets a ledge
  // run, so each arm is two parallel lines you can transfer between, and both of them empty
  // straight through the loop wall's mouth onto the loop.
  //
  // SPACING CHECK. Arm ledge ends at |x| = 15.4; the loop's mouth ledge on that side is crossed
  // at |x| = 18.2. That is 2.8 m, inside the 0.8 s re-grind cooldown, so the arm still hands you
  // to the loop rather than chaining straight into it — but since the mouths were filled the arm
  // now empties ONTO a ledge instead of onto carpet, so a run that arrives here at 12 m/s has
  // something under it either way. The arm is the way IN to the loop; the loop is the line.
  for (const sx of [-1, 1]) {
    const lane = sx > 0 ? 2.6 : -2.6;
    if (blocked(keepClear, sx * 11.5, lane, 4.2, 0.7)) continue;
    runLedge(sx * 7.6, lane, sx * 15.4, lane, {
      height: 0.42, depth: 1.1, stripe: sx > 0 ? ACCENT_TEAL : ACCENT_ORANGE, seed: 3500 + sx * 13,
    });
    acc.paperSeeds.push({ x: sx * 11.5, z: lane - Math.sign(lane) * 1.3, radius: 1.2 });
  }

  // Banks against the arm walls, opposite the arm ledge, with their coping FLUSH with the
  // corridor cap rail at 1.40: pump the ramp, pop the lip, hold the cap for 11 m. That is a
  // designed line rather than a field of props.
  const QP_ARM_D = 1.5;
  for (const sx of [-1, 1]) {
    const wallZ = sx > 0 ? -CROSS_HALF : CROSS_HALF;
    const cz = wallZ - Math.sign(wallZ) * (QP_ARM_D / 2 + 0.06);
    for (const bx of [9.0, 14.6]) {
      const px = sx * bx;
      if (blocked(keepClear, px, cz, 2.4, QP_ARM_D / 2)) continue;
      place(acc, makeQuarterPipe({
        width: 4.4, depth: QP_ARM_D, height: CAP_TOP - 0.06, seed: 3700 + Math.round(bx * 3) + sx,
      }), px, 0, cz, wallZ < 0 ? Math.PI : 0, { collide: true, grind: true });
      acc.wear.push({ x: px, z: cz - Math.sign(wallZ) * 1.7, width: 4.6, depth: 2.6, strength: 0.5 });
      acc.paperSeeds.push({ x: px + rand(-1.6, 1.6), z: cz - Math.sign(wallZ) * 1.5, radius: 1.3 });
    }
  }

  // ------------------------------------------------------- spine transfers ---
  // The level data's kickers alternate sides down the spine — both +Z kickers at x = -2.4,
  // both -Z kickers at x = +2.4 — so each half of the corridor has one side carrying every
  // obstacle. A ledge in the empty lane balances it and gives each half of the spine a THIRD
  // parallel line: kicker lane, Long Bench, floor rail. Landing off a kicker puts you on it.
  for (const sz of [-1, 1]) {
    const lx = sz > 0 ? 2.7 : -2.7;
    const cz = sz * 10.6;
    if (blocked(keepClear, lx, cz, 0.6, 4.05)) continue;
    runLedge(lx, cz - 4.0, lx, cz + 4.0, {
      height: 0.42, depth: 0.95, stripe: sz > 0 ? ACCENT_TEAL : ACCENT_ORANGE, seed: 4200 + sz * 9,
    });
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
      for (let x = sx * (SPINE_HALF + 1.6); Math.abs(x) < RING_IN - 1.0; x += sx * rand(1.8, 4.2)) {
        if (transitionSide && [9.0, 14.6].some((b) => Math.abs(Math.abs(x) - b) < 2.8)) continue;
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
  //
  // THE SERVICE STRIP IS NOT A SERVICE STRIP — it is the outside lane, and this dressing is
  // therefore NON-COLLIDING. The spine wall is at |x| = 5.2, this clutter at |x| = 4.7, and the
  // level data's spine floor rails at |x| = 4.0. The chair is a 0.4 m capsule, so a run holding
  // that rail occupies 3.6-4.4 and a bin at 4.7 with a 0.35 m half-extent occupies 4.35-5.05:
  // they overlap, every time, with no lane to route into. Measured before this changed: a 12.4
  // m/s run down the spine was doing 0.5 m/s one frame after passing x = -4.8, and every combo
  // it was carrying cashed out. The props stay — a bare corridor is worse — but the player
  // ploughs through them. Nothing in the two corridors may stop a run that is on the line.
  const aisleEdge = SPINE_HALF - 0.5;
  for (const sx of [-1, 1]) {
    for (let z = -RING_IN + 1.4; z < RING_IN - 1.4; z += rand(1.7, 3.4)) {
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
      place(acc, prop, x, 0, z, rand(0, Math.PI * 2), { collide: false });
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
  // The building wall is now the OUTER edge of the racetrack, so nothing floor-standing may
  // go against it — a bin sticking 0.6 m into the outer lane is a wall the player meets at
  // 15 m/s with no warning, and there is no room to route around it. The floor dressing
  // therefore backs onto the loop's INNER wall instead, in the service strip beside the
  // cubicle panelling, stepping around the banks and the four corridor mouths. Wall-mounted
  // furniture (no colliders) stays on the building wall where it belongs.
  const DRESS = RING_IN + 0.62;
  const wallRuns: { nx: number; nz: number; along: 'x' | 'z'; base: number; wall: number }[] = [
    { nx: 0, nz: -1, along: 'x', base: -DRESS, wall: -halfD + 0.34 },
    { nx: 0, nz: 1, along: 'x', base: DRESS, wall: halfD - 0.34 },
    { nx: -1, nz: 0, along: 'z', base: -DRESS, wall: -halfW + 0.34 },
    { nx: 1, nz: 0, along: 'z', base: DRESS, wall: halfW - 0.34 },
  ];

  for (const run of wallRuns) {
    const yaw = Math.atan2(run.nx, run.nz); // face out into the loop
    const span = run.along === 'x' ? W : D;
    for (let t = -RING_IN + 1.2; t < RING_IN - 1.2; t += rand(0.9, 2.4)) {
      if (Math.abs(t) < CROSS_HALF + 1.6) continue;                       // corridor mouth
      if ([-10.4, 10.4].some((b2) => Math.abs(t - b2) < 2.9)) continue;   // bank window
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

    // Wall furniture: cork boards, whiteboards, clocks, exit signs. These stay on the actual
    // building wall behind the loop, where they read as the room the racetrack is cut through.
    const wallY = 1.75;
    for (let t = -span / 2 + 6; t < span / 2 - 6; t += rand(5, 9)) {
      const x = run.along === 'x' ? t : run.wall + run.nx * 0.28;
      const z = run.along === 'x' ? run.wall + run.nz * 0.28 : t;
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
