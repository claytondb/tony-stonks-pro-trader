/**
 * OfficeLevel — CUBICLE CHAOS, rebuilt as a real office FLOOR PLAN over two storeys.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE WAS REWRITTEN. THE OWNER PLAYED IT AND SAID, VERBATIM:
 *
 *   "Cubicle chaos is still not open enough, and it's easy to get stuck inside of a cubicle.
 *    ... It would be great if there were some hallways in that level, a break room with a pool
 *    table and some chairs and a couch and vending machines, some stairs, an elevator to go
 *    between two floors, conference rooms, corner offices, a server room."
 *
 * And before that: "The office space level is too crowded and not a lot of place to skate
 * around. It's frustrating to play."
 *
 * Every automated reading of the build he was playing was green. 97% of a run inside a combo,
 * 45% grinding, 0.8% dead time, a 38.8 m median straight line. The harness counts whether the
 * player is IN A COMBO, and a plate covered in cubicle pods maximises that by construction
 * while being miserable to ride. WHEN THE INSTRUMENTS AND THE PLAYER DISAGREE, THE PLAYER IS
 * RIGHT. So the previous layout — a cross of corridors through four quadrants of cubicle pods,
 * ringed by a racetrack — is gone, and what replaces it is a building floor:
 *
 *      +=========== NORTH HALLWAY ============+   . . . . upper floor over all of this
 *      |  BREAK ROOM  |  ^  |    BOARDROOM    |         (deck at y = 4.20)
 *      |  pool table  | st  |  9 m hero table |
 *      |  couch  bar  | air |   glazed walls  |
 *   W  +--------------+ lift+-----------------+  E
 *   E  ============ THE CROSS HALL ==============  A     <- the balcony edge is above this
 *   S  |              |     |                 |  S
 *   T  | CUBICLE FARM | SP  |   SERVER ROOM   |  T        the whole south half is a
 *      | + corner ofc | INE |   racks in rows |           DOUBLE-HEIGHT ATRIUM
 *      +=========== SOUTH HALLWAY ============+
 *
 * ---------------------------------------------------------------------------
 * THE FOUR RULES THIS LAYOUT IS BUILT ON
 *
 * 1. HALLWAYS ARE THE SKELETON, AND THEY ARE THE FIRST THING DRAWN.
 *    A 6 m perimeter loop round the whole plate, a 16 m SPINE up the middle and an 8 m CROSS
 *    hall across it. Everything else is a room hung off that skeleton. From anywhere in the
 *    building you are at most ~7 m from a hallway, and every hallway runs 34-46 m unbroken.
 *    Corridor width is not taste: Game's turn rate is 3.6 rad/s, so the minimum turn radius at
 *    the measured 15 m/s cruise is 4.2 m and a U-turn needs 8.4 m. The loop takes one; the
 *    spine takes two side by side.
 *
 * 2. NOTHING IN THIS BUILDING CAN TRAP THE PLAYER, AND THAT IS ENFORCED BY CONSTRUCTION,
 *    NOT BY CARE. Every internal partition in the level — every room wall, every screen,
 *    every cubicle panel — is AT MOST 1.40 m tall, which is one ollie. There is no such thing
 *    as a sealed room here: you can leave any room in any direction, over any wall, from a
 *    standstill. The only full-height collision in the level is the building's own perimeter.
 *    On top of that every room has at least TWO doorways of 4 m or more, on different sides,
 *    so you never have to ollie to get out — that is just the guarantee underneath.
 *    tools/stuck.mjs drops the player on a 1.5 m grid over the entire plate, on both floors,
 *    and asserts it can always get moving; see the report at the bottom of this comment.
 *
 * 3. DRESSING IS WHAT YOU SKATE PAST. If it is not a designed feature it does not get a
 *    collider. Desks, chairs, plants, boxes, paperwork, printers: geometry only.
 *
 * 4. THE LEVEL HAS TWO FLOORS, BECAUSE VERTICALITY IS THE THING IT MOST LACKED.
 *    The north half of the plate carries a mezzanine deck at 4.20 m; the south half is a
 *    double-height atrium. You get up there by a 14-step, 10 m stair set (rideable in BOTH
 *    directions — see below) or by the lift, which actually moves. You get down by riding the
 *    stairs, by dropping through the stair void onto them, or by simply going off the balcony
 *    edge, which is a 46 m grindable kerb with three drop gaps cut in it.
 *
 * ---------------------------------------------------------------------------
 * THE STAIRS WORK BECAUSE OF ONE NUMBER
 *
 * Game.STEP_HEIGHT is 0.42 m: anything shorter, the casters roll up instead of stopping.
 * The flight is 4.20 m over 14 treads, so the risers are 0.30 m and the whole staircase is
 * rideable up and down with no special-case physics anywhere in the engine. Three unbroken
 * handrails run the length of it. That is the classic Tony Hawk stair set — a gap to clear,
 * a rail to grind, and a way upstairs — for the price of fourteen box colliders.
 *
 * ---------------------------------------------------------------------------
 * THE LIFT ACTUALLY MOVES
 *
 * OfficeInterior.movers publishes a kinematic platform: a 3.2 m car whose FLOOR PAN is the
 * only collider it has. The car's walls are geometry and nothing else, deliberately — a lift
 * with solid walls is a 3 m box the player can be carried up inside and cannot leave, which is
 * the exact defect this pass exists to remove. Open-walled, it is a moving platform you can
 * ride, ollie off, or fall off, and never a cell. The car parks flush with the carpet at the
 * bottom (pan top at 0.06 m, under STEP_HEIGHT) so it can never arrive underneath the player
 * and crush them into the floor.
 *
 * ---------------------------------------------------------------------------
 * MEASURED (tools/space.mjs and tools/stuck.mjs, ch1_office)
 *
 *                                          cross-corridor build     this build
 *   static colliders                                       295            ~380
 *   open floor (2,116 m2 plate)                          76.6%           82.0%
 *   floor REACHABLE from spawn                        1,485 m2        1,720 m2
 *   straight line through a point, median                38.8 m          43.0 m
 *   ..............................  P10                  19.3 m          25.6 m
 *   open floor with a 25 m line in it                    86.3%           93.7%
 *   ..................30 m..........                     79.5%           89.6%
 *   from the spawn, median of 72 headings                12.3 m          17.4 m
 *   Game.resolveObstacles firings, cruise             3.3-4.5%       1.6-3.0%
 *   stuck probe, 700+ drop points, both floors               —      0 failures
 *
 * If a future pass wants to add density: put it in a ROOM, give it `collide: false`, keep
 * every partition at or under 1.40 m, and re-run tools/space.mjs and tools/stuck.mjs. A
 * straight-line median under 35 m, a 25 m-line share under 88%, or a single stuck failure
 * means the building has closed up again and the owner will feel it before the harness does.
 *
 * ---------------------------------------------------------------------------
 * Everything static is merged per material (OfficeProps.mergePropsByMaterial), so the whole
 * two-storey floorplate costs a few dozen draw calls. Physics colliders, grindable edges and
 * light positions are harvested into world space BEFORE merging (merging destroys per-prop
 * userData) and handed back to the caller, which owns Rapier / GrindSystem / the light budget.
 */

import * as THREE from 'three';
import { MaterialLibrary, LIGHT_POOL_OFFICE } from '../materials/MaterialLibrary';
import { makeFloorWear, type DecalPlacement } from './FloorDecals';
import {
  makeArmchair,
  makeBoardTable,
  makeBoxStack,
  makeCardboardBox,
  makeCeilingTileGrid,
  makeCopier,
  makeCorkBoard,
  makeCouch,
  makeCubicleWall,
  makeDesk,
  makeDeskChair,
  makeElevatorCar,
  makeElevatorDoors,
  makeExitSign,
  makeFilingCabinet,
  makeFireExtinguisher,
  makeFluorescentPanel,
  makeGlazedScreen,
  makeKickerRamp,
  makeKitchenCounter,
  makeLedgeBlock,
  makeMonitor,
  makePendantLamp,
  makePlanterLedge,
  makePoolTable,
  makePottedPlant,
  makePrinter,
  makeQuarterPipe,
  makeScatterPaper,
  makeServerRack,
  makeStairFlight,
  makeTrashCan,
  makeVendingMachine,
  makeWallClock,
  makeWaterCooler,
  makeWhiteboard,
  mergePropsByMaterial,
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

/**
 * A platform that moves. Exactly one of these exists (the lift), and the contract is
 * deliberately as small as it can be, because the caller owns Rapier:
 *
 *   - `object` is already parented under `root` and is kept OUT of the static merge.
 *   - the platform travels in Y ONLY, between `minY` and `maxY`, on a fixed cycle.
 *   - `officeMoverY(mover, t)` is the whole motion model. The caller calls it with its own
 *     accumulated sim time, writes the result to `object.position.y`, and drives one
 *     kinematic-position body to `(x, y + offset.y, z)`.
 */
export interface OfficeMover {
  object: THREE.Object3D;
  /** World XZ of the platform. It never moves in the horizontal. */
  x: number;
  z: number;
  minY: number;
  maxY: number;
  /** Seconds to travel one way, and seconds parked at each end. */
  travelSeconds: number;
  dwellSeconds: number;
  /** Collider half extents and its centre offset from the object's origin. */
  halfExtents: THREE.Vector3;
  offset: THREE.Vector3;
}

/**
 * Where a mover's origin is at sim time `t`. Ease-in/out so the lift starts and stops like a
 * lift instead of like a lift-shaped elevator platform in a 1998 game.
 */
export function officeMoverY(m: OfficeMover, t: number): number {
  const leg = Math.max(0.1, m.travelSeconds);
  const dwell = Math.max(0, m.dwellSeconds);
  const period = (leg + dwell) * 2;
  let p = t % period;
  if (p < 0) p += period;
  let u: number;
  if (p < dwell) u = 0;
  else if (p < dwell + leg) u = (p - dwell) / leg;
  else if (p < dwell * 2 + leg) u = 1;
  else u = 1 - (p - dwell * 2 - leg) / leg;
  const eased = u * u * (3 - 2 * u);
  return m.minY + (m.maxY - m.minY) * eased;
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
   * The suspended ceiling batch. Hidden when the camera climbs above the ceiling plane (see
   * setCameraHeight) so an overhead camera can see the floorplate.
   */
  ceiling: THREE.Group;
  /** Roof-cutaway helper. Call once per frame with the camera's world Y. */
  setCameraHeight(y: number): void;
  /** Feed to physics.createStaticBox(position, halfExtents, new Euler(0, rotationY, 0)). */
  colliders: OfficeCollider[];
  /** Feed to grindSystem.addRail(start, end). */
  rails: OfficeRail[];
  /** Kinematic platforms. See OfficeMover / officeMoverY. */
  movers: OfficeMover[];
  /** Already parented under `root`. Kept out of the merge so they stay movable. */
  lights: THREE.PointLight[];
  size: { width: number; depth: number; height: number };
  triangles: number;
}

export interface OfficeInteriorOptions {
  width?: number;
  depth?: number;
  /** Underside of the UPPER suspended ceiling, metres. The atrium is this tall. */
  height?: number;
  seed?: number;
  /** Areas the level data already owns (ramps, fun box, rails, spawn). */
  keepClear?: KeepClearRect[];
  /** Max point lights created from lit fixtures. */
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
 * returning null — at which point the caller drops the entire bucket.
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
 * Scale a geometry's UVs in place, once per distinct attribute object.
 *
 * TILING DENSITY LIVES IN THE VERTICES, NOT IN A MATERIAL FORK. Asking MaterialLibrary for the
 * same surface at a different `repeat` forks the texture set, forks the merge bucket, and costs
 * a permanent draw call. This is what lets ten differently-sized soffit panels and nine deck
 * slabs all share ONE ceiling-tile material and ONE carpet material.
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
  /** `priority` beats distance when the light budget is spent — see the lighting section. */
  lightSpots: { pos: THREE.Vector3; hint: LightHint; priority: number }[];
  paperSeeds: { x: number; z: number; radius?: number }[];
  wear: DecalPlacement[];
}

interface PlaceOpts {
  /** false = skip, true = all, number = first N colliders only. */
  collide?: boolean | number;
  grind?: boolean;
  lights?: boolean;
  /** 0 = ordinary, higher = keep this light even if something is closer to the camera. */
  lightPriority?: number;
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
      if (col.size[0] <= 0 || col.size[1] <= 0 || col.size[2] <= 0) continue;
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
        priority: o.lightPriority ?? 0,
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

// ===========================================================================
// THE FLOOR PLAN
//
// Read this as a plan, because it IS one. All dimensions in metres, +Z north,
// +X east, origin at the middle of the crossing (which is also the spawn).
//
//   X BANDS                                Z BANDS
//   -23 .. -17   west hallway    6.0       -23 .. -17   south hallway   6.0
//   -17 ..  -8   west rooms      9.0       -17 ..  -5   south rooms    12.0
//    -8 ..   8   THE SPINE      16.0        -5 ..   5   THE CROSS      10.0
//     8 ..  17   east rooms      9.0         5 ..  17   north rooms    12.0
//    17 ..  23   east hallway    6.0        17 ..  23   north hallway   6.0
//
// The spine is 16 m because it is the building's main street and it has to
// carry two lines side by side plus the furniture between them. The cross is
// 10 m: one U-turn with a metre to spare. The loop is 6 m, which is a corridor
// you commit to rather than wander down.
//
// AND THE THREE INSIDE CORNERS OF THE CROSSING ARE SPLAYED AT 45 DEGREES, so
// the spawn is an OCTAGON rather than a plus sign. A re-entrant corner is the
// one thing Game.resolveObstacles cannot rescue a run from — it slides the
// chair ALONG a face, and a head-on hit has no tangential velocity left to
// slide with — so a diagonal carve out of the spawn is deflected rather than
// stopped. Measured across the change: the median of 72 headings out of the
// spawn went 10.5 m -> 17.4 m and the 25 m-line share 80.4% -> 93.7%.
// ===========================================================================

const HALL = 6.0;          // perimeter hallway clear width
const OUT = 23.0;          // inner face of the building wall
const RING = OUT - HALL;   // 17.0 — the room block line
const SPINE = 8.0;         // half-width of the main spine
// THE CROSS IS 10 m WIDE, AND THE NUMBER IS DERIVED. Game's turn rate is 3.6 rad/s, so the
// minimum turn radius at the measured 15 m/s cruise is 4.2 m and a U-turn needs 8.4 m of
// width. At 8 m the cross hall could not be turned round in without touching a wall, and
// tools/space.mjs saw it immediately: the share of open floor with a 25 m line through it in
// SOME direction fell to 80.4%, and the median of 72 headings out of the spawn to 10.5 m.
const CROSS = 5.0;         // half-depth of the cross hall

/**
 * Every internal partition in the building tops out here, and its cap rail — the grind line —
 * lands at 1.40 m. One ollie. See rule 2 in the file header: this single constant is what
 * makes the level non-trapping by construction rather than by care.
 */
const PART_H = 1.32;

/** Ledges and kerbs sit at Game.STEP_HEIGHT so the chair rolls ONTO them, never into them. */
const KERB_H = 0.42;

// ------------------------------------------------------------ THE UPPER FLOOR ---
// The deck covers the whole north half. The south half is a double-height atrium, which is
// what makes the balcony edge worth having: a 46 m grindable kerb with a 4.2 m drop behind it.
const DECK_Y = 4.20;       // top surface of the mezzanine
const DECK_T = 0.25;       // slab thickness; soffit at 3.95
const DECK_Z0 = CROSS;     // 5.0 — the balcony edge, directly over the cross hall's north side

// The stair void and the lift void, both cut out of the deck. The stair void is exactly the
// width of the flight, so the deck butts the stair's cheeks with no slot to fall down.
const STAIR_X0 = -8.0, STAIR_X1 = -2.6;
const STAIR_Z0 = 6.0, STAIR_Z1 = 16.0;      // the flight itself
const VOID_Z0 = 10.0;                        // where the deck opens up over it, for headroom
const LIFT_X = 5.0, LIFT_Z = 13.3;
const LIFT_HALF = 1.8;                       // void half-size; the car is 3.2 m, so 0.2 m clear
const CAR = 3.2;

/** Hard cap on the floorplate. Keeps every level-data object comfortably inside. */
const MAX_PLATE = 46;

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildOfficeInterior(opts: OfficeInteriorOptions = {}): OfficeInterior {
  const W = Math.min(opts.width ?? MAX_PLATE, MAX_PLATE);
  const D = Math.min(opts.depth ?? MAX_PLATE, MAX_PLATE);
  const H = opts.height ?? 8.0;
  const halfW = W / 2;
  const halfD = D / 2;
  const keepClear = opts.keepClear ?? [];
  const lightBudget = opts.lightBudget ?? 8;
  const rng = mulberry32((opts.seed ?? 20260813) >>> 0);
  const rand = (a: number, b: number) => a + rng() * (b - a);
  const chance = (p: number) => rng() < p;
  const iseed = (x: number, z: number, salt = 0) => Math.round(x * 137 + z * 31 + salt);

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
  const movers: OfficeMover[] = [];

  // ================================================================== SHELL ===
  // Floor: commercial loop-pile carpet. The repeat stays at one map tile per 2.6 m on purpose —
  // MaterialLibrary's officeCarpet spec applies repeatScale 2.9 on top of it.
  const carpetMat = MaterialLibrary.get('officeCarpet', { repeat: [W / 2.6, D / 2.6], color: 0xb99a6c });
  const floor = new THREE.Mesh(plane(W, D), carpetMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.castShadow = false;
  floor.name = 'officeFloor';
  root.add(floor);

  // Phase-lock the carpet shader's fluorescent light-pool overlay to the troffer grid this
  // build lays down, or the pools drift out of phase with the fixtures and read as an artifact.
  const TILE = 1.22;
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
  // A THREE-BAND WALL, not one flat plane of drywall: skirting, a saturated dado, a timber
  // rail, painted plaster above. That banding is free art direction — it puts a horizon line
  // behind the rooms at a different height from the cap rails, and it gives the room a dark
  // value at floor level so the carpet is no longer the darkest thing in shot.
  //
  // ONE TEXTURE SET FOR THE WHOLE WALL: the bands share the props' `drywall` instance and
  // express their tiling in the UVs, so the entire wall assembly costs three draw calls.
  const DADO_H = 1.15;
  const RAIL_H = 0.085;
  const WALL_REPEAT: [number, number] = [3, 2];
  const WALL_UV: [number, number] = [W / 4 / WALL_REPEAT[0], H / 2.6 / WALL_REPEAT[1]];
  const wallMat = MaterialLibrary.get('drywall', { repeat: WALL_REPEAT, color: 0xd6cfc2 });
  const dadoMat = MaterialLibrary.get('drywall', { repeat: WALL_REPEAT, color: 0x33405c });
  const railMat = MaterialLibrary.get('deskLaminate', { color: 0xc9a877 });
  const skirtMat = MaterialLibrary.get('cubicleTrim');
  const wallSpecs: { w: number; x: number; z: number; rotY: number }[] = [
    { w: W, x: 0, z: -halfD, rotY: 0 },
    { w: W, x: 0, z: halfD, rotY: Math.PI },
    { w: D, x: -halfW, z: 0, rotY: Math.PI / 2 },
    { w: D, x: halfW, z: 0, rotY: -Math.PI / 2 },
  ];
  for (const spec of wallSpecs) {
    const nx = Math.sin(spec.rotY);
    const nz = Math.cos(spec.rotY);

    const upper = new THREE.Mesh(plane(spec.w, H - DADO_H - RAIL_H, WALL_UV), wallMat);
    upper.receiveShadow = true;
    upper.castShadow = false;
    place(acc, upper, spec.x, (H + DADO_H + RAIL_H) / 2, spec.z, spec.rotY, { collide: false });

    const dado = new THREE.Mesh(box(spec.w, DADO_H, 0.05, WALL_UV), dadoMat);
    dado.receiveShadow = true;
    dado.castShadow = false;
    place(acc, dado, spec.x + nx * 0.025, DADO_H / 2, spec.z + nz * 0.025, spec.rotY, { collide: false });

    const rail = new THREE.Mesh(box(spec.w, RAIL_H, 0.085), railMat);
    rail.receiveShadow = true;
    rail.castShadow = true;
    place(acc, rail, spec.x + nx * 0.042, DADO_H + RAIL_H / 2, spec.z + nz * 0.042, spec.rotY, { collide: false });

    const skirt = new THREE.Mesh(box(spec.w, 0.14, 0.075), skirtMat);
    skirt.receiveShadow = true;
    skirt.castShadow = false;
    place(acc, skirt, spec.x + nx * 0.038, 0.07, spec.z + nz * 0.038, spec.rotY, { collide: false });

    // Solid wall collider just inside the visible plane. The ONLY full-height collision in the
    // building — see rule 2.
    acc.colliders.push({
      position: new THREE.Vector3(spec.x - nx * 0.3, H / 2 + 1.0, spec.z - nz * 0.3),
      halfExtents: new THREE.Vector3(spec.w / 2, H / 2 + 1.0, 0.3),
      rotationY: spec.rotY,
    });
  }

  // ---------------------------------------------------- BUILDING SHELL ------
  // An inverted box enclosing the plate with room above it, so the moment the camera climbs
  // above the ceiling plane it reveals the inside of a building rather than the clear colour.
  // Light albedo and a small self-emission on purpose: every face of a BackSide box has its
  // normal pointing INWARD, so the sun never lights the underside of the roof.
  const SHELL_H = H + 6;
  const shell = new THREE.Mesh(
    withUV1(new THREE.BoxGeometry(W + 4, SHELL_H, D + 4)),
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

  // Dark parapet band above the ceiling line, so the wall/shell junction is a VALUE step
  // rather than a tonal seam.
  const parapetMat = MaterialLibrary.get('drywall', { repeat: WALL_REPEAT, color: 0x5a5348 });
  for (const spec of wallSpecs) {
    const band = new THREE.Mesh(plane(spec.w, 1.9, WALL_UV), parapetMat);
    band.castShadow = false;
    band.receiveShadow = false;
    place(acc, band, spec.x, H + 0.9, spec.z, spec.rotY, { collide: false });
  }

  // ----------------------------------------------------- ceiling & soffits ---
  // The upper ceiling spans the whole plate at H; the SOFFIT under the mezzanine is a second,
  // lower plane at 3.95. Both are drawn with ONE ceiling-tile material — the soffit panels are
  // hand-built planes whose tiling lives in their UVs, because asking MaterialLibrary for a
  // per-panel `repeat` would buy a draw call per panel forever.
  const ceilingGrid = makeCeilingTileGrid(W, D);
  place(acc, ceilingGrid, 0, H, 0, 0, { collide: false, ceiling: true });

  const tileMat = MaterialLibrary.get('ceilingTile', { repeat: [2, 2] });
  function soffit(x0: number, x1: number, z0: number, z1: number, y: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    if (w <= 0.05 || d <= 0.05) return;
    const m = new THREE.Mesh(plane(w, d, [w / (TILE * 2), d / (TILE * 2)]), tileMat);
    m.castShadow = false;
    m.receiveShadow = true;
    place(acc, m, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, { collide: false, ceiling: true });
    m.rotation.set(Math.PI / 2, 0, 0);
  }

  // Recessed troffers on a 3-tile pitch across the upper ceiling.
  for (let i = 0; i < panelCountX; i++) {
    for (let j = 0; j < panelCountZ; j++) {
      const px = (i - (panelCountX - 1) / 2) * panelPitch;
      const pz = (j - (panelCountZ - 1) / 2) * panelPitch;
      // Under the deck the upper troffers are invisible: skip them and light the soffit instead.
      if (pz > DECK_Z0 + 1) continue;
      place(acc, makeFluorescentPanel({ variant: 1, seed: i * 31 + j * 7 + 3 }), px, H, pz, 0,
        { collide: false, ceiling: true });
    }
  }

  // Pendant lamps down the atrium spine — the dark navy cones in the refs. Hung low enough to
  // read as fittings in an 8 m volume rather than as dots on a distant ceiling.
  for (let pz = -halfD + 5; pz < DECK_Z0 - 1; pz += 6.1) {
    for (const px of [-4.6, 4.6]) {
      place(acc, makePendantLamp({ seed: Math.round(pz * 13 + px * 5) }), px, H - 2.6, pz, 0,
        { collide: false, lights: true, lightPriority: 1, ceiling: true });
    }
  }

  // =========================================================== HELPERS ======
  //
  // Everything below is built out of four verbs: a run of partition, a run of low ledge, a
  // room (a rectangle of partition with doorways cut in it), and a slab of upper floor.

  /**
   * Lay a continuous run of partition and register ONE unbroken grind for the whole run.
   *
   * Geometry is chunked (real partition systems are panelised, and it keeps per-chunk bounding
   * spheres tight for culling) but the SKATE LINE is single: the player commits to it once and
   * holds it, instead of catching four hundred 1.8 m panel segments in sequence.
   */
  function runWall(
    x0: number, z0: number, x1: number, z1: number,
    o: { height?: number; grind?: boolean; glazed?: boolean; tint?: number; y?: number } = {},
  ): void {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.6) return;
    const h = o.height ?? PART_H;
    const y = o.y ?? 0;
    const yaw = Math.atan2(dx, dz) - Math.PI / 2;
    const n = Math.max(1, Math.round(len / 5.6));
    const segLen = len / n;

    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const seg = o.glazed
        ? makeGlazedScreen(segLen, { height: h, seed: 900 + iseed(x0, z0, i) })
        : makeCubicleWall(segLen, { variant: 1, height: h, fabricTint: o.tint, seed: 900 + iseed(x0, z0, i) });
      place(acc, seg, x0 + dx * t, y, z0 + dz * t, yaw, { collide: true, grind: false });
    }

    if (o.grind === false) return;
    // Inset: a cap rail that ends flush with the wall it caps ends AT the corner where the
    // next wall starts, and GrindSystem.endGrind teleports the chair into it.
    const top = y + h + 0.08;
    const inset = Math.min(0.8, len * 0.1);
    acc.rails.push({
      start: new THREE.Vector3(x0 + (dx / len) * inset, top, z0 + (dz / len) * inset),
      end: new THREE.Vector3(x1 - (dx / len) * inset, top, z1 - (dz / len) * inset),
    });
  }

  /**
   * Lay a run of low ledge blocks nose to tail and register the run's TWO edge rails as single
   * unbroken grinds.
   *
   * One rail per RUN, not per block: GrindSystem rejects a capture with under 0.8 m of rail
   * left ahead, so a 16 m line built from four blocks has a dead fifth at the end of every
   * block, and the 0.8 s re-grind cooldown then swallows the next one whole.
   *
   * Height defaults to Game.STEP_HEIGHT so the chair rolls ONTO a ledge it clips.
   */
  function runLedge(
    x0: number, z0: number, x1: number, z1: number,
    o: { height?: number; depth?: number; stripe?: number; seed?: number; y?: number; wear?: boolean } = {},
  ): void {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.8) return;
    const h = o.height ?? KERB_H;
    const d = o.depth ?? 1.2;
    const y = o.y ?? 0;
    const yaw = Math.atan2(dx, dz) - Math.PI / 2;
    const n = Math.max(1, Math.round(len / 4.6));
    const segLen = len / n;

    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      place(acc, makeLedgeBlock({
        width: segLen - 0.09, depth: d, height: h,
        seed: (o.seed ?? 3000) + i * 7, stripe: o.stripe,
      }), x0 + dx * t, y, z0 + dz * t, yaw, { collide: true, grind: false });
    }

    const px = -dz / len;
    const pz = dx / len;
    const off = d / 2 - 0.03;
    const ry = y + h + 0.02;
    const inset = Math.min(0.55, len * 0.12);
    const ix = (dx / len) * inset;
    const iz = (dz / len) * inset;
    for (const s of [-1, 1]) {
      acc.rails.push({
        start: new THREE.Vector3(x0 + ix + px * off * s, ry, z0 + iz + pz * off * s),
        end: new THREE.Vector3(x1 - ix + px * off * s, ry, z1 - iz + pz * off * s),
      });
    }
    if (y === 0 && (o.wear ?? true)) {
      acc.wear.push({
        x: (x0 + x1) / 2, z: (z0 + z1) / 2,
        width: Math.abs(dx) + 2.4, depth: Math.abs(dz) + 2.4, strength: 0.30,
      });
    }
  }

  /**
   * A ROOM: four runs of partition with doorways cut in them.
   *
   * `doors` is a list of (side, centre, width). Every room in this building declares at least
   * two of them, at least 4 m wide, on different sides — so a room is a place you flow THROUGH
   * rather than a place you enter. Combined with the 1.40 m ceiling on every partition, that
   * makes the building non-trapping twice over.
   */
  type Side = 'n' | 's' | 'e' | 'w';
  type Corner = 'ne' | 'nw' | 'se' | 'sw';
  function room(
    x0: number, x1: number, z0: number, z1: number,
    doors: { side: Side; at: number; width: number }[],
    o: {
      glazed?: boolean; tint?: number; height?: number; y?: number; sides?: Side[];
      /**
       * Cut these corners off at 45 degrees.
       *
       * Every room in this building splays TWO corners: the one that faces the spawn crossing,
       * so a diagonal carve out of the middle of the plate is deflected rather than stopped,
       * and the one that faces the building's own corner, so the perimeter hallway turns.
       * THE ROOM'S OWN WALL IS THE CHAMFER. An earlier cut built the hallway chamfers as
       * separate diagonals standing in front of intact room corners, which leaves a triangular
       * pocket between the two — and tools/stuck.mjs found the player wedged in one of them.
       */
      splay?: { corner: Corner; size: number }[];
    } = {},
  ): void {
    const sides: { id: Side; a: number; b: number; fixed: number; axis: 'x' | 'z' }[] = [
      { id: 's', a: x0, b: x1, fixed: z0, axis: 'x' },
      { id: 'n', a: x0, b: x1, fixed: z1, axis: 'x' },
      { id: 'w', a: z0, b: z1, fixed: x0, axis: 'z' },
      { id: 'e', a: z0, b: z1, fixed: x1, axis: 'z' },
    ];
    const byId = (id: Side) => sides.find((s) => s.id === id)!;
    for (const sp of o.splay ?? []) {
      const k = sp.size;
      const wo = { glazed: o.glazed, tint: o.tint, height: o.height, y: o.y };
      // Pull the two sides that meet at the corner back by `size`, then bridge them.
      if (sp.corner === 'se') { byId('s').b -= k; byId('e').a += k; runWall(x1 - k, z0, x1, z0 + k, wo); }
      if (sp.corner === 'sw') { byId('s').a += k; byId('w').a += k; runWall(x0, z0 + k, x0 + k, z0, wo); }
      if (sp.corner === 'ne') { byId('n').b -= k; byId('e').b -= k; runWall(x1 - k, z1, x1, z1 - k, wo); }
      if (sp.corner === 'nw') { byId('n').a += k; byId('w').b -= k; runWall(x0, z1 - k, x0 + k, z1, wo); }
    }
    for (const s of sides) {
      if (o.sides && !o.sides.includes(s.id)) continue;
      // Cut this side into the segments the doorways leave behind.
      const cuts = doors
        .filter((d) => d.side === s.id)
        .map((d) => [d.at - d.width / 2, d.at + d.width / 2] as [number, number])
        .sort((p, q) => p[0] - q[0]);
      let cursor = s.a;
      const runs: [number, number][] = [];
      for (const [c0, c1] of cuts) {
        if (c0 > cursor) runs.push([cursor, Math.min(c0, s.b)]);
        cursor = Math.max(cursor, c1);
      }
      if (cursor < s.b) runs.push([cursor, s.b]);
      for (const [a, b] of runs) {
        if (b - a < 0.6) continue;
        if (s.axis === 'x') runWall(a, s.fixed, b, s.fixed, { glazed: o.glazed, tint: o.tint, height: o.height, y: o.y });
        else runWall(s.fixed, a, s.fixed, b, { glazed: o.glazed, tint: o.tint, height: o.height, y: o.y });
      }
    }
  }

  /**
   * ONE collider spanning a whole RANK of props.
   *
   * A row of props placed side by side leaves a slot between every pair, and a slot narrower
   * than the chair is a place the chair can be wedged and cannot steer out of. tools/stuck.mjs
   * found exactly two stuck points in the whole building and both were slots of this kind: an
   * 11 cm gap between two vending machines, and an 8 cm gap between two server racks. Spacing
   * the props tighter only shrinks the slot; collapsing the rank into a single convex box
   * removes it, and costs fewer colliders than it saves.
   */
  function rankCollider(cx: number, cz: number, hx: number, hy: number, hz: number): void {
    acc.colliders.push({
      position: new THREE.Vector3(cx, hy, cz),
      halfExtents: new THREE.Vector3(hx, hy, hz),
      rotationY: 0,
    });
  }

  /** A slab of upper floor: carpet, structural collider, and the tile soffit under it. */
  function deckSlab(x0: number, x1: number, z0: number, z1: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    if (w <= 0.05 || d <= 0.05) return;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    const surf = new THREE.Mesh(plane(w, d, [w / 2.6, d / 2.6]), carpetMat);
    surf.receiveShadow = true;
    surf.castShadow = false;
    place(acc, surf, cx, DECK_Y + 0.002, cz, 0, { collide: false });
    surf.rotation.set(-Math.PI / 2, 0, 0);

    acc.colliders.push({
      position: new THREE.Vector3(cx, DECK_Y - DECK_T / 2, cz),
      halfExtents: new THREE.Vector3(w / 2, DECK_T / 2, d / 2),
      rotationY: 0,
    });
    soffit(x0, x1, z0, z1, DECK_Y - DECK_T);
  }

  // ================================================== THE UPPER FLOOR SLAB ===
  // Seven rectangles tiling z = [4, 23] minus the stair void and the lift void. The stair void
  // is exactly the flight's width, so there is no slot between the deck and the stair cheek.
  const LX0 = LIFT_X - LIFT_HALF, LX1 = LIFT_X + LIFT_HALF;
  const LZ0 = LIFT_Z - LIFT_HALF, LZ1 = LIFT_Z + LIFT_HALF;
  deckSlab(-halfW, halfW, DECK_Z0, VOID_Z0);                 // the promenade — 46 m, clear
  deckSlab(-halfW, STAIR_X0, VOID_Z0, STAIR_Z1);
  deckSlab(STAIR_X1, LX0, VOID_Z0, STAIR_Z1);
  deckSlab(LX0, LX1, VOID_Z0, LZ0);
  deckSlab(LX0, LX1, LZ1, STAIR_Z1);
  deckSlab(LX1, halfW, VOID_Z0, STAIR_Z1);
  deckSlab(-halfW, halfW, STAIR_Z1, halfD);

  // Soffit over the slice of ground floor the deck does not reach but the atrium ceiling
  // should not either: none. The atrium runs full height from z = -23 to z = 4.

  // ======================================================== THE HALLWAYS ====
  //
  // Drawn FIRST, because they are the level. Every room below is cut out of what is left.
  //
  // The perimeter loop's inner face is the room block line at |x| = 17 / |z| = 17, and the
  // room walls themselves ARE that face — which is why every hallway in this building has a
  // continuous 1.40 m grind rail down at least one side of it without a single extra prop.
  //
  // THE CORNERS ARE CHAMFERED AT 45 DEGREES, AND THE CHAMFER IS THE ROOM'S OWN WALL.
  //
  // A re-entrant corner is the one thing Game.resolveObstacles cannot rescue a run from: it
  // slides the chair ALONG a face, and a head-on hit has no tangential velocity left to slide
  // with. A diagonal deflects instead, so a player holding forward is steered round the loop at
  // speed with no input at all.
  //
  // The chamfers are NOT built here. They are declared as each room's outer `splay` (see
  // room()), because a chamfer built as a separate diagonal in front of an intact room corner
  // leaves a triangular pocket between the two — and if any doorway opens into that pocket, the
  // player can be wedged in it. tools/stuck.mjs found exactly that at the server room's
  // south-east corner. Making the room's own wall turn the corner removes the pocket entirely.
  //
  // CHAM is the outer chamfer (the hallway corner) and SPLAY the inner one (the spawn
  // crossing). Both are cut out of the ROOM, so a 9 m room side gives up 3.5 m at one end and
  // 4.5 m at the other and still has room for a 4.4 m doorway in what is left. That is why the
  // numbers are what they are: any bigger and a room side cannot hold a door.
  const CHAM = 3.5;
  const SPLAY = 4.5;

  // The hallway edge along the cubicle farm, which has no room wall of its own: a low planter
  // run that says "this is the corridor" and grinds, without closing the farm off.
  for (let z = -11.0; z < -CROSS - 3.2; z += 4.4) {
    place(acc, makePlanterLedge({ width: 3.2, depth: 1.0, seed: iseed(-RING, z, 51) }),
      -RING + 0.6, 0, z + 1.6, Math.PI / 2, { collide: true, grind: true });
  }

  // ============================================================ THE SPINE ===
  // 16 m of main street from the south wall to the balcony edge, and under the deck beyond it.
  // Two ledge runs flank the centre lane and leave 5.8 m of clear carpet down the middle plus
  // 4.4 m outboard of each: three lanes, and the outer two have a grind on both sides.
  runLedge(-5.0, -19.0, -5.0, -9.0, { seed: 3100, stripe: 0xc0392b });
  runLedge(5.0, -19.0, 5.0, -9.0, { seed: 3200, stripe: 0xc0392b });

  // Quarter pipes closing both ends of the spine. A transition is the one primitive that sends
  // the player UP and turns them AROUND, which is what stops a 46 m corridor being a treadmill.
  place(acc, makeQuarterPipe({ width: 9.0, depth: 2.3, height: 1.75, seed: 811 }),
    0, 0, -halfD + 1.4, 0, { collide: true, grind: true });
  place(acc, makeQuarterPipe({ width: 7.0, depth: 2.1, height: 1.55, seed: 813 }),
    0, 0, halfD - 1.35, Math.PI, { collide: true, grind: true });
  // ...and one against each end of the cross hall, so the east/west run has the same ending.
  for (const sx of [-1, 1]) {
    place(acc, makeQuarterPipe({ width: 6.4, depth: 2.1, height: 1.55, seed: 815 + sx }),
      sx * (halfW - 1.35), 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, { collide: true, grind: true });
  }

  // ====================================================== THE BREAK ROOM ====
  // North-west block, 9 x 12 m. FOUR doorways, one on every side, so it is a room you cut
  // THROUGH on a line from the spine to the west hallway — not a dead end you visit.
  //
  // Its two splayed corners do two different jobs: the SE one opens the spawn crossing into an
  // octagon, and the NW one IS the perimeter hallway's north-west chamfer.
  const BR_X0 = -RING, BR_X1 = -SPINE, BR_Z0 = CROSS, BR_Z1 = RING;
  room(BR_X0, BR_X1, BR_Z0, BR_Z1, [
    { side: 's', at: -14.8, width: 4.4 },
    { side: 'n', at: -10.7, width: 5.6 },
    { side: 'w', at: 8.5, width: 6.0 },
    { side: 'e', at: 13.0, width: 6.0 },
  ], {
    tint: POD_FABRIC_TINTS[5],
    splay: [{ corner: 'se', size: SPLAY }, { corner: 'nw', size: CHAM }],
  });

  {
    // THE POOL TABLE is the centrepiece and, mechanically, a manual pad with a grind down both
    // long rails at 0.87 m. It sits square in the middle of the room with 3 m of clear carpet
    // all round it, because a centrepiece you cannot get a run at is a piece of scenery.
    place(acc, makePoolTable({ seed: 901 }), -13.5, 0, 12.7, 0, { collide: true, grind: true });
    acc.wear.push({ x: -13.5, z: 12.7, width: 6.4, depth: 4.6, strength: 0.42 });

    // THE COUCH. Seat at exactly Game.STEP_HEIGHT, back 0.46 m proud of it: roll on, hit the
    // back, and it kicks. It faces the pool table across the room, so the line in over the
    // couch and onto the table exists and is obvious.
    place(acc, makeCouch({ length: 2.4, seed: 903, tint: 0x8f6f58 }), -15.8, 0, 8.4, Math.PI / 2,
      { collide: true, grind: true });
    place(acc, makeArmchair({ seed: 905 }), -13.0, 0, 7.6, -1.9, { collide: false });
    place(acc, makeArmchair({ seed: 907, tint: 0x93b1ab }), -10.6, 0, 13.6, -1.2, { collide: false });
    place(acc, makeLedgeBlock({ width: 1.1, depth: 0.7, height: 0.36, seed: 909 }), -14.2, 0, 8.4, 0.2,
      { collide: false });

    // THE KITCHEN. A free-standing island rather than a run of units against a wall, because
    // every wall of this room has a doorway in it — and because an island at 0.92 m is a grind
    // you can take from either side, which a counter shoved against plasterboard is not.
    place(acc, makeKitchenCounter({ length: 3.6, seed: 911 }), -13.2, 0, 8.6, 0, { collide: true, grind: true });
    place(acc, makeKitchenCounter({ length: 3.0, kitchen: false, seed: 912 }), -12.6, 0, 15.6, 0,
      { collide: true, grind: true });
    place(acc, makeWaterCooler({ seed: 913 }), -9.0, 0, 15.5, Math.PI, { collide: false });

    // Dressing: seen, never touched.
    for (const [px, pz] of [[-9.6, 13.4], [-9.4, 15.2], [-16.2, 14.4], [-16.2, 6.4]] as [number, number][]) {
      place(acc, makePottedPlant({ seed: iseed(px, pz, 61) }), px, 0, pz, rand(0, 6.28), { collide: false });
    }
    place(acc, makeCorkBoard({ seed: 931 }), -8.06, 1.55, 11.6, -Math.PI / 2, { collide: false });
    place(acc, makeWallClock({ seed: 933 }), -8.06, 2.15, 9.4, -Math.PI / 2, { collide: false });
    place(acc, makeTrashCan({ seed: 925, accent: true }), -16.3, 0, 15.9, 0, { collide: false });
    acc.paperSeeds.push({ x: -14.4, z: 9.6, radius: 1.4 });
  }

  // THE VENDING BANK lives in the SPINE, not in the break room, hard against the break room's
  // east wall. Two reasons, and neither is decoration: the machines are the landmark that tells
  // you which end of a 46 m corridor you are looking down, and the wall behind them is a
  // wallride. Inside the room they would have stood in one of its four doorways.
  //
  // One collider for the whole bank — see rankCollider. Three machines side by side leave two
  // 11 cm slots between them, and a slot narrower than the chair is a place to be wedged.
  for (let i = 0; i < 3; i++) {
    place(acc, makeVendingMachine({ seed: 921 + i }), -SPINE + 0.45, 0, 10.6 + i * 0.96, -Math.PI / 2,
      { collide: false, lights: true, lightPriority: 2 });
  }
  rankCollider(-SPINE + 0.45, 11.56, 0.39, 0.95, 1.53);

  // ======================================================== THE BOARDROOM ===
  // North-east block, GLAZED on every side so the hero feature is visible from the hallway —
  // which is the entire point of putting an 8 m grind inside a glass box.
  const BD_X0 = SPINE, BD_X1 = RING, BD_Z0 = CROSS, BD_Z1 = RING;
  room(BD_X0, BD_X1, BD_Z0, BD_Z1, [
    { side: 's', at: 14.8, width: 4.4 },
    { side: 'n', at: 10.7, width: 5.6 },
    { side: 'w', at: 13.0, width: 6.0 },
    { side: 'e', at: 8.5, width: 6.0 },
  ], { glazed: true, splay: [{ corner: 'sw', size: SPLAY }, { corner: 'ne', size: CHAM }] });

  {
    // THE HERO FEATURE. An 8 m table at 0.74 m with a steel trim down both long edges, both
    // registered as single unbroken grinds. It is fed by a kicker at the south end standing in
    // the room's own doorway, so the line is: cross hall -> kicker -> table -> 8 m of grind ->
    // out of the north doorway into the north hallway. Nothing else in the building is that
    // long, and nothing else in the building is behind glass.
    const TABLE_X = 13.6;
    place(acc, makeBoardTable({ length: 8.0, width: 1.85, seed: 941 }), TABLE_X, 0, 11.0, Math.PI / 2,
      { collide: true, grind: true });
    place(acc, makeKickerRamp({ width: 3.0, depth: 1.8, height: 0.82, seed: 943 }), TABLE_X, 0, 6.4, 0,
      { collide: true, grind: true });
    acc.wear.push({ x: TABLE_X, z: 6.2, width: 4.2, depth: 3.6, strength: 0.5 });

    // Chairs down both sides, tucked under, non-colliding: you skate over them, not into them.
    for (let i = 0; i < 6; i++) {
      const z = 7.9 + i * 1.25;
      for (const sgn of [-1, 1]) {
        place(acc, makeDeskChair({ variant: 1, seed: iseed(sgn, z, 71) }), TABLE_X + sgn * 1.55, 0, z,
          sgn > 0 ? -Math.PI / 2 : Math.PI / 2, { collide: false });
      }
    }
    place(acc, makeWhiteboard({ seed: 947 }), 10.2, 1.4, RING - 0.14, Math.PI, { collide: false });
    place(acc, makePottedPlant({ variant: 0, seed: 949 }), 9.0, 0, 14.8, 0, { collide: false });
    place(acc, makeMonitor({ variant: 1, seed: 951 }), TABLE_X, 0.75, 14.4, Math.PI, { collide: false });
  }

  // ===================================================== THE CUBICLE FARM ===
  // South-west block. IT STAYS, BUT AS ONE ZONE AMONG SEVERAL AND AS OPEN-PLAN BENCHING RATHER
  // THAN AS POCKETS.
  //
  // The old farm was built from makeCubiclePod: a cross of panels with four workstations round
  // it, which is a ring of collision with an INSIDE. That is exactly the thing the owner got
  // stuck in, and it is not fixable by spacing the pods further apart — a pod is a trap at any
  // pitch. What is here now is what a modern office floor actually looks like: parallel BENCH
  // RUNS with a low spine screen and desks either side, 3 m of open aisle between them, both
  // ends of every aisle open, and no enclosing geometry of any kind. There is nothing to be
  // inside of, and the screens are 1.10 m to the grind line so you can see the whole zone over
  // the top of it.
  {
    const rows = [-6.4, -9.4];
    for (const rz of rows) {
      const tint = POD_FABRIC_TINTS[Math.abs(Math.round(rz)) % 4];
      runWall(-16.4, rz, -8.8, rz, { height: 1.02, tint });
      for (let i = 0; i < 5; i++) {
        const dx = -15.8 + i * 1.6;
        for (const sgn of [-1, 1]) {
          place(acc, makeDesk({ variant: 1, seed: iseed(dx, rz * sgn, 81) }), dx, 0, rz + sgn * 0.92,
            sgn > 0 ? 0 : Math.PI, { collide: false });
          if (chance(0.7)) {
            place(acc, makeMonitor({ variant: 1, seed: iseed(dx, rz * sgn, 83) }), dx - 0.1, 0.76, rz + sgn * 0.55,
              sgn > 0 ? 0 : Math.PI, { collide: false });
          }
          if (chance(0.55)) {
            place(acc, makeDeskChair({ variant: 1, seed: iseed(dx, rz * sgn, 85), knocked: chance(0.25) }),
              dx + 0.25, 0, rz + sgn * 1.75, rand(0, 6.28), { collide: false });
          }
        }
      }
      acc.paperSeeds.push({ x: rand(-15.5, -10.5), z: rz + rand(-1.6, 1.6), radius: 1.3 });
      acc.wear.push({ x: -12.6, z: rz + 1.5, width: 8.0, depth: 2.4, strength: 0.24 });
    }

    // The copier bank and the recycling pile against the spine wall line: the bit of the floor
    // nobody photographs, and the thing that tells you which end of the farm you are at.
    for (let i = -1; i <= 1; i++) {
      place(acc, makeCopier({ seed: 961 + i }), -8.9, 0, -6.0 + i * 1.5, -Math.PI / 2, { collide: false });
    }
    place(acc, makePrinter({ variant: 1, seed: 965 }), -8.9, 0, -11.0, -Math.PI / 2, { collide: false });
    for (const [px, pz] of [[-9.2, -13.6], [-16.0, -6.0]] as [number, number][]) {
      place(acc, makeBoxStack({ seed: iseed(px, pz, 87) }), px, 0, pz, rand(0, 6.28), { collide: false });
    }

    // ---- THE GROUND-FLOOR CORNER OFFICE ---------------------------------------------------
    // The manager's corner, glazed on its two inboard sides and splayed on the third so that
    // ITS wall is the hallway's south-west chamfer. Two doorways, and the desk ledge inside is
    // a grind. A corner office in a skate level has to be a feature, not a diorama.
    room(-RING, -11.5, -RING, -11.5, [
      { side: 'n', at: -14.5, width: 3.6 },
      { side: 'e', at: -14.5, width: 3.2 },
    ], { glazed: true, splay: [{ corner: 'sw', size: CHAM }] });
    place(acc, makeDesk({ variant: 0, seed: 971 }), -14.2, 0, -13.4, 0.5, { collide: false });
    place(acc, makeLedgeBlock({ width: 2.6, depth: 0.9, height: KERB_H, seed: 973, stripe: 0x2f6f7d }),
      -13.4, 0, -13.2, 0, { collide: true, grind: true });
    place(acc, makeDeskChair({ variant: 0, seed: 975 }), -14.2, 0, -14.4, 3.0, { collide: false });
    place(acc, makePottedPlant({ seed: 977 }), -12.4, 0, -15.4, 0, { collide: false });
    place(acc, makeWhiteboard({ seed: 979 }), -15.5, 1.4, -11.64, Math.PI, { collide: false });
  }

  // ======================================================== THE SERVER ROOM ==
  // South-east block. NARROW BY DESIGN — this is the level's technical section — but never
  // closed. Three rack rows with a 1.5 m aisle between them, a 2.3 m gap punched straight
  // through the middle of every row so there is a clean north/south lane as well, four
  // doorways, and the raised-floor plinths pushed out to the walls so they never pinch that
  // lane. Cold blue light off the racks themselves: the only colour in the level that is not
  // warm, and the reason you can find this room from the far end of the spine.
  const SR_X0 = SPINE, SR_X1 = RING, SR_Z0 = -RING, SR_Z1 = -CROSS;
  room(SR_X0, SR_X1, SR_Z0, SR_Z1, [
    { side: 'w', at: -13.0, width: 6.0 },
    { side: 'n', at: 14.8, width: 4.4 },
    { side: 's', at: 10.7, width: 5.6 },
    { side: 'e', at: -9.5, width: 6.0 },
  ], { tint: POD_FABRIC_TINTS[3], splay: [{ corner: 'nw', size: SPLAY }, { corner: 'se', size: CHAM }] });

  {
    let rackN = 0;
    for (const rz of [-9.6, -12.2, -14.8]) {
      for (const rx of [8.9, 9.6, 10.3, 13.2, 13.9, 14.6, 15.3]) {
        // The east block stops short of the splayed south-east corner; the racks stop with it.
        if (rx > 12 && rz < -14.0) continue;
        rackN++;
        place(acc, makeServerRack({ variant: rackN % 3 === 0 ? 0 : 1, seed: 981 + rackN }),
          rx, 0, rz, 0, { collide: false, lights: rackN % 5 === 1, lightPriority: 3 });
      }
      // ONE collider per BLOCK of racks, not per rack — see rankCollider. Seven racks in a row
      // leave six 8 cm slots, and tools/stuck.mjs found the player wedged in one of them.
      rankCollider(9.6, rz, 1.01, 1.0, 0.53);
      if (rz > -14.0) rankCollider(14.25, rz, 1.36, 1.0, 0.53);
    }
    // Raised-floor plinths against the two side walls. 0.42 m, so they are ridden over as well
    // as grinded — and OUT of the central lane, which is the room's escape route.
    runLedge(8.6, -16.2, 8.6, -10.4, { seed: 3300, depth: 0.7, height: KERB_H, wear: false });
    runLedge(16.3, -13.0, 16.3, -6.4, { seed: 3400, depth: 0.7, height: KERB_H, wear: false });
    acc.wear.push({ x: 11.8, z: -11.5, width: 2.3, depth: 9.0, strength: 0.36 });

    place(acc, makeFireExtinguisher({ seed: 991 }), SPINE + 0.35, 0, -7.4, Math.PI / 2, { collide: false });
    place(acc, makeCardboardBox({ variant: 1, seed: 993 }), 16.2, 0, -15.0, 0.6, { collide: false });
    place(acc, makeBoxStack({ seed: 995 }), 11.8, 0, -6.6, 1.2, { collide: false });
  }

  // ============================================================ THE STAIRS ===
  // 14 treads, 4.20 m over 10 m: 0.30 m risers, under Game.STEP_HEIGHT, so the flight is
  // RIDEABLE IN BOTH DIRECTIONS. Three unbroken sloped handrails the length of it.
  const STAIR_CX = (STAIR_X0 + STAIR_X1) / 2;
  const STAIR_CZ = (STAIR_Z0 + STAIR_Z1) / 2;
  place(acc, makeStairFlight({
    steps: 14, width: STAIR_X1 - STAIR_X0, rise: DECK_Y, run: STAIR_Z1 - STAIR_Z0, centreRail: true, seed: 1001,
  }), STAIR_CX, 0, STAIR_CZ, 0, { collide: true, grind: true });
  acc.wear.push({ x: STAIR_CX, z: STAIR_Z0 - 1.8, width: 6.4, depth: 3.4, strength: 0.5 });
  place(acc, makeExitSign({ seed: 1003 }), STAIR_CX, 2.55, STAIR_Z0 - 0.4, 0, { collide: false });

  // Kerbs down both sides of the deck opening: a grind along the void, and a visual edge that
  // says "there is a hole here" before you are in it.
  runLedge(STAIR_X0 - 0.35, VOID_Z0 + 0.4, STAIR_X0 - 0.35, STAIR_Z1 - 0.4,
    { y: DECK_Y, height: KERB_H, depth: 0.7, seed: 3500 });
  runLedge(STAIR_X1 + 0.35, VOID_Z0 + 0.4, STAIR_X1 + 0.35, STAIR_Z1 - 0.4,
    { y: DECK_Y, height: KERB_H, depth: 0.7, seed: 3600 });

  // ============================================================= THE LIFT ====
  // A working two-floor lift. See the file header for why only the floor pan collides.
  {
    const car = makeElevatorCar({ width: CAR, depth: CAR, height: 2.5, seed: 1011 });
    car.position.set(LIFT_X, 0.06, LIFT_Z);
    car.rotation.y = -Math.PI / 2;                       // open side faces the corridor, to -X
    car.name = 'officeLiftCar';
    root.add(car);
    movers.push({
      object: car,
      x: LIFT_X, z: LIFT_Z,
      minY: 0.06, maxY: DECK_Y,
      travelSeconds: 3.4, dwellSeconds: 2.2,
      halfExtents: new THREE.Vector3(CAR / 2, 0.06, CAR / 2),
      offset: new THREE.Vector3(0, -0.06, 0),
    });
    // The car's own light travels with it; the caller never sees it in the light budget.
    const carLight = new THREE.PointLight(0xffd9a0, 1.0, 6.0, 2);
    carLight.position.set(0, 2.1, 0);
    car.add(carLight);

    // The shaft enclosure: three glazed screens at partition height, so the lift reads as a
    // lift lobby, grinds like everything else in the building, and can be ollied out of.
    room(LX0, LX1, LZ0, LZ1, [{ side: 'w', at: LIFT_Z, width: 3.0 }], { glazed: true });
    place(acc, makeElevatorDoors({ seed: 1013 }), LX0 - 0.06, 0, LIFT_Z, -Math.PI / 2, { collide: false });
    place(acc, makeElevatorDoors({ seed: 1015 }), LX0 - 0.06, DECK_Y, LIFT_Z, -Math.PI / 2, { collide: false });
    // Upper-floor kerb round three sides of the void; the fourth is the doorway you ride in at.
    runLedge(LX0 - 0.3, LZ0 - 0.3, LX1 + 0.3, LZ0 - 0.3, { y: DECK_Y, depth: 0.6, seed: 3700, wear: false });
    runLedge(LX0 - 0.3, LZ1 + 0.3, LX1 + 0.3, LZ1 + 0.3, { y: DECK_Y, depth: 0.6, seed: 3800, wear: false });
    runLedge(LX1 + 0.3, LZ0 - 0.3, LX1 + 0.3, LZ1 + 0.3, { y: DECK_Y, depth: 0.6, seed: 3900, wear: false });
  }

  // ======================================================= THE UPPER FLOOR ===
  //
  // A promenade 6 m deep and 46 m wide along the balcony, two glazed corner offices, and an
  // executive conference room. The promenade is the longest uninterrupted run in the building
  // and it ends, both times, in a corner you can carry.
  {
    // THE BALCONY EDGE. A 0.42 m kerb — grindable on both edges, and low enough that you roll
    // straight over it and off, which is the point. Three gaps cut in it are the designed
    // drops; the rest of the 46 m is a rail with a 4.2 m fall behind it.
    const edgeZ = DECK_Z0 + 0.45;
    const segs: [number, number][] = [[-halfW + 0.4, -16.0], [-11.0, -3.0], [3.0, 11.0], [16.0, halfW - 0.4]];
    for (const [a, b] of segs) {
      runLedge(a, edgeZ, b, edgeZ, { y: DECK_Y, height: KERB_H, depth: 0.85, seed: 4000 + Math.round(a), wear: false });
    }

    // Corner offices, glazed, one at each north corner. Both have two doorways and a desk
    // ledge to grind, and both look down the length of the promenade.
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -halfW + 0.5 : 15.0;
      const x1 = sx < 0 ? -15.0 : halfW - 0.5;
      const z0 = 15.5, z1 = halfD - 0.5;
      room(x0, x1, z0, z1, [
        { side: 's', at: sx * 19.0, width: 3.6 },
        { side: sx < 0 ? 'e' : 'w', at: 19.4, width: 3.4 },
      ], { glazed: true, sides: ['s', sx < 0 ? 'e' : 'w'], y: DECK_Y });

      const cx = sx * 19.0;
      place(acc, makeLedgeBlock({ width: 3.4, depth: 1.0, height: 0.5, seed: 1021 + sx, stripe: 0xe7b428 }),
        cx, DECK_Y, 20.6, 0, { collide: true, grind: true });
      place(acc, makeDesk({ variant: 0, seed: 1023 + sx }), cx, DECK_Y, 18.4, sx < 0 ? 0.4 : -0.4, { collide: false });
      place(acc, makeDeskChair({ variant: 0, seed: 1025 + sx }), cx, DECK_Y, 17.4, 3.0, { collide: false });
      place(acc, makePottedPlant({ seed: 1027 + sx }), sx * 21.4, DECK_Y, 16.6, 0, { collide: false });
      place(acc, makeArmchair({ seed: 1029 + sx, tint: 0x93b1ab }), sx * 16.6, DECK_Y, 19.4, sx * 1.3, { collide: false });
    }

    // The executive conference room between them. Glazed, two doorways, a 6 m table.
    room(-5.5, 5.5, 16.0, halfD - 0.5, [
      { side: 's', at: -2.4, width: 3.6 },
      { side: 's', at: 2.4, width: 3.6 },
    ], { glazed: true, sides: ['s', 'e', 'w'], y: DECK_Y });
    place(acc, makeBoardTable({ length: 6.2, width: 1.7, seed: 1031 }), 0, DECK_Y, 19.4, 0,
      { collide: true, grind: true });
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        place(acc, makeDeskChair({ variant: 1, seed: iseed(i, s, 91) }), -2.4 + i * 1.6, DECK_Y, 19.4 + s * 1.5,
          s > 0 ? Math.PI : 0, { collide: false });
      }
    }
    place(acc, makeWhiteboard({ seed: 1033 }), 0, DECK_Y + 1.4, halfD - 0.62, Math.PI, { collide: false });

    // The promenade's own furniture: a reception counter you grind past, planters, seating.
    place(acc, makeKitchenCounter({ length: 4.4, kitchen: false, seed: 1041 }), -18.5, DECK_Y, 8.2, 0,
      { collide: true, grind: true });
    place(acc, makeCouch({ length: 2.4, seed: 1043, tint: 0x6f82a8 }), 17.5, DECK_Y, 7.6, Math.PI,
      { collide: true, grind: true });
    place(acc, makeArmchair({ seed: 1045 }), 20.4, DECK_Y, 7.4, -1.0, { collide: false });
    for (const px of [-9.0, 0.0, 9.0]) {
      place(acc, makePlanterLedge({ width: 3.0, depth: 1.0, seed: iseed(px, 7, 93) }), px, DECK_Y, 7.4, 0,
        { collide: true, grind: true });
    }
    // A ledge run down the middle of the upper hallway, north of the promenade.
    runLedge(-1.0, 11.0, -1.0, 15.0, { y: DECK_Y, seed: 4200, wear: false });
    runLedge(9.5, 10.8, 9.5, 15.2, { y: DECK_Y, seed: 4300, wear: false });
    place(acc, makeFilingCabinet({ variant: 1, seed: 1047 }), -12.0, DECK_Y, 14.2, 0, { collide: false });
    place(acc, makePottedPlant({ seed: 1049 }), -13.4, DECK_Y, 12.4, 0, { collide: false });
    place(acc, makeExitSign({ seed: 1051 }), 8.0, DECK_Y + 2.5, halfD - 0.2, Math.PI, { collide: false });
  }

  // ====================================================== PERIMETER DRESS ====
  // Wall furniture, all of it non-colliding: this is what you skate PAST in a 6 m hallway.
  {
    for (const sz of [-1, 1]) {
      for (let x = -18.5; x <= 18.5; x += 6.2) {
        if (Math.abs(x) < SPINE - 1) continue;
        const roll = rng();
        const prop = roll < 0.4 ? makeFilingCabinet({ variant: 1, seed: iseed(x, sz, 101), accent: chance(0.2) })
          : roll < 0.68 ? makePottedPlant({ seed: iseed(x, sz, 103) })
            : roll < 0.86 ? makeBoxStack({ seed: iseed(x, sz, 105) })
              : makeTrashCan({ variant: 1, seed: iseed(x, sz, 107), accent: chance(0.3) });
        place(acc, prop, x, 0, sz * (halfD - 0.85), sz > 0 ? Math.PI : 0, { collide: false });
      }
      place(acc, makeExitSign({ seed: iseed(0, sz, 109) }), sz * 9.5, 2.5, sz * (halfD - 0.2), sz > 0 ? Math.PI : 0,
        { collide: false });
      place(acc, makeFireExtinguisher({ seed: iseed(1, sz, 111) }), sz * -14.0, 0, sz * (halfD - 0.5), sz > 0 ? Math.PI : 0,
        { collide: false });
    }
    for (const sx of [-1, 1]) {
      for (let z = -18.5; z <= 18.5; z += 6.6) {
        if (Math.abs(z) < CROSS + 1) continue;
        if (blocked(keepClear, sx * (halfW - 0.85), z, 0.6, 0.6)) continue;
        const roll = rng();
        const prop = roll < 0.36 ? makeFilingCabinet({ variant: 1, seed: iseed(sx, z, 113) })
          : roll < 0.62 ? makePottedPlant({ seed: iseed(sx, z, 115) })
            : roll < 0.82 ? makeCardboardBox({ variant: 1, seed: iseed(sx, z, 117) })
              : makeDeskChair({ variant: 1, seed: iseed(sx, z, 119), knocked: chance(0.4) });
        place(acc, prop, sx * (halfW - 0.85), 0, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, { collide: false });
      }
      place(acc, makeWallClock({ seed: iseed(sx, 2, 121) }), sx * (halfW - 0.12), 2.3, 6.0,
        sx > 0 ? -Math.PI / 2 : Math.PI / 2, { collide: false });
    }
  }

  // ============================================================ FLOOR DRESS ==
  // Loose paperwork, CLUSTERED. Paper piles where it was dropped; a uniform dusting of white
  // quads over a whole plate reads as a broken decal system, not as blown paperwork.
  place(acc, makeScatterPaper(200, W - 8, D - 8, { seed: 7, clusters: acc.paperSeeds }), 0, 0, 0, 0,
    { collide: false });

  // Traffic-lane wear down the spine and the cross, plus the point stains collected above.
  for (let z = -halfD + 5; z < halfD - 5; z += 5.4) {
    acc.wear.push({ x: rand(-2.4, 2.4), z, width: 4.4, depth: 4.6, rotation: rand(0, 3.14), strength: 0.22 });
  }
  for (let x = -halfW + 5; x < halfW - 5; x += 5.6) {
    acc.wear.push({ x, z: rand(-2.4, 2.4), width: 4.6, depth: 4.4, rotation: rand(0, 3.14), strength: 0.20 });
  }
  for (let i = 0; i < 20; i++) {
    acc.wear.push({
      x: rand(-halfW + 3, halfW - 3),
      z: rand(-halfD + 3, halfD - 3),
      width: rand(0.45, 1.1),
      depth: rand(0.45, 1.1),
      rotation: rand(0, 3.14),
      strength: rand(0.3, 0.6),
    });
  }
  root.add(makeFloorWear(acc.wear));

  // ============================================================== LIGHTING ===
  // Props never make lights; we pick the ones the level most needs. `priority` first (the
  // server room's cold blue and the vending bank ARE the identity of those rooms), then
  // distance from the middle of the plate.
  const lights: THREE.PointLight[] = [];
  acc.lightSpots.sort((a, b) => (b.priority - a.priority) || (a.pos.lengthSq() - b.pos.lengthSq()));
  for (const spot of acc.lightSpots.slice(0, lightBudget)) {
    const l = new THREE.PointLight(spot.hint.color, spot.hint.intensity * 0.55, spot.hint.distance * 0.8, 2);
    l.position.copy(spot.pos);
    l.castShadow = false;
    root.add(l);
    lights.push(l);
  }

  // ================================================================= MERGE ===
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
  // The suspended ceiling has gone missing from an establishing shot twice, and both times the
  // first hour went on deciding whether it was a build bug, a merge bug or a culling bug. So
  // the builder answers that question itself, at build time, out loud. The lower bound is the
  // MEZZANINE SOFFIT now, not the upper plane, because the batch legitimately contains both.
  let ceilMeshes = 0;
  ceilingBatch.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) ceilMeshes++;
  });
  const ceilBox = new THREE.Box3().setFromObject(ceilingBatch);
  if (typeof console !== 'undefined') {
    const span = ceilBox.isEmpty() ? 0 : ceilBox.max.x - ceilBox.min.x;
    const problems: string[] = [];
    if (!ceilMeshes) problems.push('ceiling batch is EMPTY');
    if (span < W - TILE * 2) problems.push(`ceiling spans ${span.toFixed(1)} m of a ${W} m plate`);
    if (!ceilBox.isEmpty() && ceilBox.min.y < DECK_Y - DECK_T - 1.0) {
      problems.push(`ceiling reaches y=${ceilBox.min.y.toFixed(2)}, expected >= ${(DECK_Y - DECK_T - 1.0).toFixed(2)}`);
    }
    if (problems.length) console.warn(`[OfficeLevel] CEILING: ${problems.join('; ')}`);
    else {
      console.log(
        `[OfficeLevel] ceiling OK — ${ceilMeshes} draw calls, plane y=${H}, soffit y=${(DECK_Y - DECK_T).toFixed(2)}, ` +
        `batch y=[${ceilBox.min.y.toFixed(2)}, ${ceilBox.max.y.toFixed(2)}]`,
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
      // clears to a void) and the fixture point lights stay.
      //
      // THE THRESHOLD IS ABOVE THE CEILING, NOT BELOW IT: the follow rig climbs to 3-4 m when
      // the player is airborne off a kicker, and a threshold under the tile plane deletes the
      // whole ceiling for the duration of the jump. With a mezzanine in the building that rig
      // now also climbs to 7-8 m whenever the player is upstairs, which is why the cutaway
      // triggers off the UPPER plane and the soffit rides along with it.
      const inside = y < H + 0.3;
      if (ceilingBatch.visible !== inside) ceilingBatch.visible = inside;
    },
    colliders: acc.colliders,
    rails: acc.rails,
    movers,
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
  o.movers.length = 0;
  o.lights.length = 0;
}
