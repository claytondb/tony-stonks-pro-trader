/**
 * Story Mode Levels
 * The epic tale of Tony Stonks escaping the SEC
 */

import { LevelData, LevelObject } from '../levels/LevelData';

export interface StoryCheckpoint {
  position: [number, number, number];
  rotation: number;
  name: string;
  dialogue?: string[];
}

export interface StoryLevelData extends LevelData {
  storyOrder: number;
  nextLevel?: string;
  checkpoints: StoryCheckpoint[];
  hasChaseMechanic?: boolean;
  chaseSpeed?: number;
}

// ===========================================================================
// FLOW KIT — the authoring primitives every story level is built from.
//
// These exist because the nine story levels were authored before push, ollie,
// grind and manual worked, against assumptions the engine does not hold. Three
// of those assumptions were measured to be false and they are what the kit
// encodes:
//
//  1. THE LEVELS ARE FLAT, WHETHER THEY LOOK IT OR NOT. Game.createLevelObject
//     registers every rail at y = 0.80 and builds every ramp / fun box / stairs
//     collider from y = 0 upward, ignoring the authored Y. The old rooftop level
//     spawned the player at y = 20 above nine platforms whose colliders were all
//     at ground level, and the old stairwell "descended" 50 floors of rails that
//     the grind system had all registered at ankle height. Anything that must be
//     stood on is authored at y = 0; height is expressed as ramps and fun boxes.
//
//  2. SPACING IS A CLOCK, NOT A DISTANCE. The combo window is 2.2 s and the
//     grind system enforces a 0.8 s re-grind cooldown, so at the 13.5 m/s cruise
//     a feature more than ~26 m from the last one ends the line, and two rails
//     closer than ~12 m along the same path cannot both be caught. Long rails
//     (18-30 m) with ~10-14 m gaps is the shape that measures well. The old
//     levels put 60 m between features on a 400 m floorplate.
//
//  3. A WALL IS EITHER A DEAD END OR A BANKED TURN. GrindSystem captures a rail
//     from any approach angle within 1.5 m laterally and then drives the player
//     ALONG it, so a ledge run inset from the boundary turns a run that would
//     have splattered into the wall into a carried turn. Every level here has a
//     closed perimeter ledge for exactly that reason: it is what makes a run a
//     LOOP instead of a corridor with a wall at the end.
// ===========================================================================

/** A rail running along X (east-west), centred on (x, z). */
const railX = (x: number, z: number, length: number): LevelObject =>
  ({ type: 'rail', position: [x, 0, z], rotation: [0, 0, 0], params: { length } });

/** A rail running along Z (north-south), centred on (x, z). */
const railZ = (x: number, z: number, length: number): LevelObject =>
  ({ type: 'rail', position: [x, 0, z], rotation: [0, 90, 0], params: { length } });

/**
 * A kicker. `deg` is the direction it LAUNCHES you: 0 = +Z, 90 = +X, 180 = -Z,
 * 270 = -X. (The wedge rises toward its own +Z and its coping lip is a grind
 * edge in its own right, so a kicker also works as a ledge taken side-on.)
 */
const kicker = (x: number, z: number, deg: number): LevelObject =>
  ({ type: 'ramp', position: [x, 0, z], rotation: [0, deg, 0] });

/** A launch/landing pair pointing at each other down a line, `gap` metres apart. */
const kickerGap = (x: number, z: number, gap: number, alongZ = true): LevelObject[] =>
  alongZ
    ? [kicker(x, z - gap / 2, 0), kicker(x, z + gap / 2, 180)]
    : [kicker(x - gap / 2, z, 90), kicker(x + gap / 2, z, 270)];

/** A low box you can ride over and land on: desk bank, loading dock, planter run. */
const funbox = (x: number, z: number, width: number, depth: number, height = 0.8): LevelObject =>
  ({ type: 'fun_box', position: [x, 0, z], params: { width, depth, height } });

/**
 * A rail running at 45 degrees. `deg` is 45 for a NE/SW line, 135 for NW/SE.
 */
const railDiag = (x: number, z: number, length: number, deg: 45 | 135): LevelObject =>
  ({ type: 'rail', position: [x, 0, z], rotation: [0, deg, 0], params: { length } });

/**
 * One skate lane: a run of grindable edge broken into segments no longer than a
 * player can hold without touching the balance stick.
 *
 * The segment length is the load-bearing number. BalanceSystem gives an
 * uncorrected grind 4.2 s at the start of a line and 2.6 s once a combo is
 * twenty tricks deep; at the 13-18 m/s this game actually runs at, a single
 * 50 m rail is a guaranteed bail deep in a line — measured, on the first draft
 * of this level: a ten-trick 18,000-stonk position blown at 11.4 s on a rail
 * that was simply too long to hold. 15 m segments are ~0.9 s each.
 */
const lane = (v: number, span: number, dir: 'x' | 'z', segMax = 15, gap = 3): LevelObject[] => {
  const n = Math.max(1, Math.ceil(span / (segMax + gap)));
  const pitch = span / n;
  const segLength = pitch - gap;
  const out: LevelObject[] = [];
  for (let i = 0; i < n; i++) {
    const o = -span / 2 + pitch * (i + 0.5);
    out.push(dir === 'z' ? railZ(v, o, segLength) : railX(o, v, segLength));
  }
  return out;
};

/**
 * THE SKATE FLOOR. Parallel lanes on both axes, plus a ledge run tight against
 * each wall and a diagonal across each corner. Every level in this file is built
 * on one of these; what changes between levels is the size, what the lanes are
 * made of in the fiction, and what is staged in the bays between them.
 *
 * Three measurements set the geometry, and all three came from watching runs
 * die:
 *
 *   - PITCH ~7.5 m. GrindSystem will not start a new grind for 0.8 s after the
 *     last one ends, which at cruise is 8-12 m of uncatchable rolling. Lanes at
 *     this pitch mean that wherever the cooldown expires, and whichever way the
 *     player is pointing, there is another edge under them within a second.
 *   - A LEDGE 1.5 m OFF EVERY WALL. A run that ends up scraping the boundary is
 *     otherwise unskateable for as long as it lasts: the first draft of level 1
 *     lost a combo to a 2.4 s scrape along a wall with the nearest rail 6 m
 *     inboard. Against the wall the scrape becomes a wallride-ish ledge run.
 *   - DIAGONALS ACROSS THE CORNERS. A corner is two walls and a dead stop, and
 *     a stop with a combo open is a bail, not a pause. The chamfer catches the
 *     run before the corner and throws it back across the floor.
 *
 * `half` IS groundSize / 2, ALWAYS. It is not a stylistic choice about how much
 * of the plate to fill: PhysicsWorld.createGround() puts four invisible 5 m
 * barriers at exactly +/- groundSize/2, and that ring — not the authored
 * wall_indoor, not `bounds` (which nothing reads) — is the surface the chair
 * actually hits. Every metre between the outer ledge and it is unskateable
 * apron, and the apron was measured killing the back half of this file: with
 * skateFloor(30) on a 64 m plate, story_9 spent 56.8% of a 20 s probe pinned
 * against a wall 3.1 m outside its last rail (GrindSystem.SNAP_DISTANCE is
 * 1.5 m, so nothing could catch it) and every one of its three combo breaks
 * happened there. story_4 spent 29.5% the same way; story_5, 6, 7 and 8 each
 * ended a line by hitting the barrier head-on at 14 m/s and going to 0.00 m/s
 * in one frame. Set half = groundSize/2 and the chair's resting position
 * against the barrier (the collider stops its centre 0.4 m off the face) is
 * 1.1 m from the outer ledge: inside the snap radius, so a run that reaches the
 * boundary is captured and carried along it instead of dying on it. Anything
 * authored in what used to be apron has to move out of the new outer bays.
 */
const skateFloor = (half: number, pitch = 7.5, segMax = 15): LevelObject[] => {
  const outer = half - 1.5;              // the wall ledges
  const lines: number[] = [0];
  for (let v = pitch; v <= outer - pitch * 0.5; v += pitch) lines.push(v, -v);
  lines.push(outer, -outer);
  const span = outer * 2;
  const out = lines.flatMap((v) => [
    ...lane(v, span, 'z', segMax),
    ...lane(v, span, 'x', segMax),
  ]);
  const c = outer - pitch;
  const diagLen = Math.min(span * 0.4, 20);
  out.push(
    railDiag(c, c, diagLen, 135),
    railDiag(c, -c, diagLen, 45),
    railDiag(-c, -c, diagLen, 135),
    railDiag(-c, c, diagLen, 45),
  );
  return out;
};

/**
 * The centre line of the nth bay out from the middle, for a given lane pitch.
 * EVERYTHING staged inside a level — kickers, pads, props, scenery — sits on one
 * of these, and nothing sits on a lane. A water cooler 0.6 m off a rail is what
 * turned ch1_office's thirteen-trick line into 0.0 m/s in a single frame.
 */
const bay = (pitch: number, n: number): number => (n + 0.5) * pitch;

/**
 * The kickers and pads that go in the bays. Derived from the lane pitch rather
 * than hand-placed, so the staging cannot drift into a lane when a level's
 * density is retuned — which it will be, because density is the dial that
 * decides whether a run is one long line or four short ones.
 *
 * Pads are 0.4 m: STEP_HEIGHT is 0.42, so the casters roll straight up them and
 * they extend a line as manual pads. At 0.8 m the same box is a wall that
 * deflects the run and, hit square, ends it.
 */
const bayStaging = (pitch: number): LevelObject[] => {
  const b = (n: number) => bay(pitch, n);
  const w = pitch - 1.6;             // transverse size: never touches a lane
  const l = pitch * 1.8;             // along the bay, where there is room
  return [
    ...kickerGap(-b(2), 0, pitch * 2.2),
    ...kickerGap(b(2), 0, pitch * 2.2),
    ...kickerGap(0, -b(2), pitch * 2.2, false),
    ...kickerGap(0, b(2), pitch * 2.2, false),
    kicker(-b(1), -b(0), 0), kicker(b(1), b(0), 180),
    kicker(-b(0), b(1), 270), kicker(b(0), -b(1), 90),
    kicker(-b(3), b(1), 90), kicker(b(3), -b(1), 270),
    funbox(-b(1), b(2), l, w, 0.4),
    funbox(b(1), -b(2), l, w, 0.4),
    funbox(-b(2), -b(1), w, l, 0.4),
    funbox(b(2), b(1), w, l, 0.4),
    funbox(b(0), b(0), w, w, 0.4),
  ];
};

// ===========================================================================
// THE HOLDING PENS — the thing that was actually ending every line.
//
// Measured, with ScoreSystem instrumented inside the play harness: EVERY combo
// break in a 20 s probe of story_2 and story_5 was `bail('police')`. Not a
// lapsed combo clock, not a blown balance, not a collision — an officer's
// 1.75 m catch radius. Removing the squad from the harness (and changing
// nothing else) took story_2 from 8.6 s to 19.2 s and story_5 from 7.7 s to
// 19.3 s, in one unbroken line each. The rail spacing in this file was never
// the problem; the police were standing on it.
//
// Game.spawnPolice() drops four officers on a 17 m ring around the LEVEL'S
// SPAWN POINT, at four fixed bearings 90 degrees apart, each patrolling a chord
// back across the middle of that ring. On the open floorplates in this file
// that is four mines wandering the skate floor, and at the 15-19 m/s these
// levels actually run at the player blunders into one every five to eight
// seconds. Note what that means for the author: the squad's position is a
// function of `spawnPoint`, so it IS level design, and it is the only handle
// this file has on it.
//
// ch1_office survives the identical squad — 17-25 s lines — purely by accident
// of its floorplan: the cubicle block between the corridors breaks the
// officers' line of sight, and an officer who never reaches the CHASING state
// cannot catch you at all (PoliceAI: the catch test lives in `case 'chasing'`).
// Their view cone is 24 m, and the line-of-sight ray is a real physics ray.
//
// So every patrol post that lands on the skate floor gets a blockhouse built on
// it. The officer starts inside a solid box with no sightline — the ch1_office
// condition, reproduced deliberately instead of by luck — and the level keeps
// its squad, its chase fiction and its arrest, instead of having the police
// deleted. Posts that land outside the floorplate are left alone: those
// officers are already behind a wall or off the plate, and they read as the
// cordon closing in from outside.
// ===========================================================================

/** Radius of the patrol ring Game.spawnPolice() builds around the spawn point. */
const POLICE_RING = 17;

/**
 * The four patrol posts Game.spawnPolice() derives from a spawn point. Kept in
 * lockstep with it by construction: same radius, same 0.4 rad bearing offset,
 * same four quarters.
 */
const policePosts = (sx: number, sz: number): [number, number][] =>
  [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    return [sx + Math.cos(a) * POLICE_RING, sz + Math.sin(a) * POLICE_RING] as [number, number];
  });

/**
 * A blockhouse on each patrol post that lands INSIDE the skate floor. From a
 * spawn tucked into a corner — which is where every level in this file spawns —
 * that is one or two of the four; the other posts are already off the plate.
 * The four bearings are fixed and 90 degrees apart, so no spawn point anywhere
 * inside a square floorplate can push all four off it. That is why this exists
 * rather than a cleverer spawn.
 *
 * `reach` is how far out a post still needs penning, and it is NOT the same
 * number indoors and out. Indoors it is the skate floor: an officer posted
 * beyond the room's wall has no line of sight into it and never leaves patrol.
 * Outdoors there is no wall, and a post 6 m past the last lane is an officer who
 * strolls onto the floorplate and takes the line at t = 7.2 s — measured, on
 * story_5, with the on-floor post already penned. Outdoor levels therefore pass
 * the whole ground plate.
 *
 * `size` is deliberately small (4 m). It has to be big enough to break a
 * sightline from inside it and small enough that a run which does hit it is a
 * clip, not a wall.
 */
const holdingPens = (
  spawn: [number, number],
  reach: number,
  kind: 'wall_indoor' | 'building_small',
  size = 4,
  height = 4,
): LevelObject[] =>
  policePosts(spawn[0], spawn[1])
    .filter(([x, z]) => Math.abs(x) < reach && Math.abs(z) < reach)
    .map(([x, z]) =>
      kind === 'wall_indoor'
        ? {
            type: 'wall_indoor' as const,
            position: [x, height / 2, z] as [number, number, number],
            params: { width: size, height, depth: size },
          }
        : {
            type: 'building_small' as const,
            position: [x, 0, z] as [number, number, number],
            params: { width: size, depth: size, height },
          },
    );

/** Ground footprint of a staged object, for the keep-out test below. */
const footprint = (o: LevelObject): { x0: number; x1: number; z0: number; z1: number } => {
  const [px, , pz] = o.position;
  if (o.type === 'rail' || o.type === 'rail_angled' || o.type === 'rail_curved') {
    // Matches Game.createLevelObject's endpoint maths exactly.
    const rad = ((o.rotation?.[1] ?? 0) * Math.PI) / 180;
    const h = ((o.params?.length as number) ?? 10) / 2;
    const dx = Math.abs(Math.cos(rad) * h);
    const dz = Math.abs(Math.sin(rad) * h);
    return { x0: px - dx, x1: px + dx, z0: pz - dz, z1: pz + dz };
  }
  if (o.type === 'fun_box') {
    const w = ((o.params?.width as number) ?? 6) / 2;
    const d = ((o.params?.depth as number) ?? 4) / 2;
    return { x0: px - w, x1: px + w, z0: pz - d, z1: pz + d };
  }
  // Kickers: RAMP_W 3.4 by RAMP_D 1.8, any yaw — treat as the circumscribed square.
  return { x0: px - 1.7, x1: px + 1.7, z0: pz - 1.7, z1: pz + 1.7 };
};

/**
 * Drop anything that would be buried in a blockhouse. A rail inside a wall is a
 * grind that drives the player into it, and a kicker against one is a launch
 * into masonry. The grid is dense enough (5-6 m lane pitch) that losing a
 * segment or two around a 4 m box reads as the lift core interrupting a desk
 * row, and the parallel lane 5 m over still catches the run.
 */
const clearOf = (objs: LevelObject[], pens: LevelObject[], pad = 0.9): LevelObject[] => {
  const rects = pens.map((p) => ({
    x: p.position[0],
    z: p.position[2],
    s: ((p.params?.width as number) ?? 4) / 2 + pad,
  }));
  return objs.filter((o) => {
    const b = footprint(o);
    return !rects.some(
      (r) => b.x1 > r.x - r.s && b.x0 < r.x + r.s && b.z1 > r.z - r.s && b.z0 < r.z + r.s,
    );
  });
};

// ===========================================
// CHAPTER 1: THE ESCAPE
// ===========================================

const LEVEL_1_PENS = holdingPens([-20, -22], 28.5, 'wall_indoor');

const LEVEL_1_OFFICE: StoryLevelData = {
  id: 'story_1_office',
  chapter: 1,
  storyOrder: 1,
  nextLevel: 'story_2_stairwell',
  name: 'Office Escape',
  subtitle: 'The Day Everything Changed',
  description: 'SEC agents have stormed the building! Grab your office chair and GET OUT!',
  
  // Indoor environment — no sky visible, fluorescent lights, carpet floor
  skyColor: '#111111',
  skyColorTop: '#111111',
  skyColorBottom: '#1a1a1a',
  fogColor: '#2a2a2e',
  fogNear: 100,
  fogFar: 350,
  ambientLight: 1.5,
  sunIntensity: 0,
  
  // A 64 m indoor floorplate, not the old 400 m one. The old level put the spawn
  // 150 m from the nearest rail INSIDE a 50x50x22 m cubicle block — the chair was
  // depenetrated straight down through the carpet and the whole probe run was a
  // 26-second fall (median speed 0.0, 100% dead). Everything now sits inside one
  // lap of the combo clock.
  groundSize: 64,
  groundColor: '#8B8B8B',  // Medium gray carpet

  spawnPoint: {
    position: [-20, 0.6, -22],  // In the west aisle, facing straight up a desk row
    rotation: 0
  },

  bounds: {
    minX: -30,
    maxX: 30,
    minZ: -30,
    maxZ: 30
  },

  checkpoints: [
    {
      position: [0, 0.6, 27],
      rotation: 0,
      name: 'Reached the stairwell',
      dialogue: ['TONY: There\'s the stairs! Time to ride!']
    }
  ],

  objects: [
    // ---- the room ---------------------------------------------------------
    { type: 'wall_indoor', position: [0, 6, 31], params: { width: 62, height: 12, depth: 1 } },
    { type: 'wall_indoor', position: [0, 6, -31], params: { width: 62, height: 12, depth: 1 } },
    { type: 'wall_indoor', position: [31, 6, 0], rotation: [0, 90, 0], params: { width: 62, height: 12, depth: 1 } },
    { type: 'wall_indoor', position: [-31, 6, 0], rotation: [0, 90, 0], params: { width: 62, height: 12, depth: 1 } },
    { type: 'ceiling_slab', position: [0, 12, 0], params: { width: 62, depth: 62 } },
    { type: 'ceiling_panel', position: [-17.5, 11.5, -17.5], params: { width: 8, depth: 1.2 } },
    { type: 'ceiling_panel', position: [17.5, 11.5, -17.5], params: { width: 8, depth: 1.2 } },
    { type: 'ceiling_panel', position: [-17.5, 11.5, 17.5], params: { width: 8, depth: 1.2 } },
    { type: 'ceiling_panel', position: [17.5, 11.5, 17.5], params: { width: 8, depth: 1.2 } },
    { type: 'ceiling_panel', position: [2.5, 11.5, 2.5], params: { width: 8, depth: 1.2 } },

    // ---- the lanes, and the kickers and pads staged on the bay centres
    // between them. Anything that would end up buried in a blockhouse is
    // dropped rather than left inside it.
    ...clearOf([...skateFloor(30, 5, 15), ...bayStaging(5)], LEVEL_1_PENS),

    // ---- the server cabinet the aisle bends around: a blockhouse standing on the police patrol post
    // that lands inside the floorplate. See THE HOLDING PENS above.
    ...LEVEL_1_PENS,

    // ---- scenery, all of it on bay centres ---------------------------------
    { type: 'cubicle', position: [-27.5, 0, -12.5], params: { width: 3, depth: 3, height: 1.5 } },
    { type: 'cubicle', position: [-27.5, 0, 12.5], params: { width: 3, depth: 3, height: 1.5 } },
    { type: 'cubicle', position: [27.5, 0, -12.5], params: { width: 3, depth: 3, height: 1.5 } },
    { type: 'cubicle', position: [27.5, 0, 12.5], params: { width: 3, depth: 3, height: 1.5 } },
    { type: 'cubicle', position: [-12.5, 0, -27.5], params: { width: 3, depth: 3, height: 1.5 } },
    { type: 'cubicle', position: [12.5, 0, 27.5], params: { width: 3, depth: 3, height: 1.5 } },
    { type: 'filing_cabinet', position: [-27.5, 0, -27.5] },
    { type: 'filing_cabinet', position: [27.5, 0, 27.5] },
    { type: 'planter', position: [27.5, 0, -27.5] },
    { type: 'planter', position: [-27.5, 0, 27.5] },

    // ---- the way out: in the metre between the wall ledge and the wall,
    // so the exit is a landmark and never an obstacle in a lane.
    { type: 'stairs', position: [0, 0, 30], rotation: [0, 180, 0], params: { steps: 3 } },
    { type: 'exit_sign', position: [0, 7, 30.4], params: { width: 6, height: 1.6 } },
  ],

  collectibles: [
    { type: 'document', position: [-6, 1.2, -14], value: 200 },
    { type: 'document', position: [6, 1.2, 14], value: 200 },
    { type: 'document', position: [0, 1.2, -20], value: 500 },
    { type: 'money', position: [-16, 1.2, 0], value: 1000 },
    { type: 'money', position: [16, 1.2, 0], value: 1000 },
    { type: 'special', position: [0, 1.6, 20], value: 2500 },
  ],
  
  goals: [
    { type: 'escape', target: 1, description: 'Reach the stairwell!', reward: 2000 },
    { type: 'score', target: 5000, description: 'Score 5,000 stonks', reward: 1000 },
    { type: 'grind', target: 3, description: 'Grind 3 desk rails', reward: 750 },
    { type: 'collect', target: 3, description: 'Grab the shredded documents', reward: 1500 },
  ],
  
  timeLimit: 120,
  
  introDialogue: [
    '📰 BREAKING NEWS: SEC RAIDS STONKS CAPITAL!',
    'SEC AGENT: Freeze! Tony Stonks, you\'re under arrest for market manipulation!',
    'TONY: Not today! *jumps on office chair* YOLO! 🚀',
    '🎯 OBJECTIVE: Escape the office!'
  ],
  
  outroDialogue: [
    'TONY: Made it to the stairs! But I can hear them behind me...',
    'SEC AGENT: He\'s heading down! All units to the stairwell!'
  ]
};

const LEVEL_2_PENS = holdingPens([-15, -18], 22.5, 'wall_indoor');

const LEVEL_2_STAIRWELL: StoryLevelData = {
  id: 'story_2_stairwell',
  chapter: 1,
  storyOrder: 2,
  nextLevel: 'story_3_lobby',
  name: 'Stairwell Descent',
  subtitle: '50 Floors of Freedom',
  description: 'Grind your way down 50 floors of stair rails!',
  
  skyColor: '#333340',
  skyColorTop: '#1a1a25',
  skyColorBottom: '#404050',
  fogColor: '#2a2a35',
  fogNear: 10,
  fogFar: 50,
  ambientLight: 0.4,
  sunIntensity: 0.2,
  
  // The old level was a 50-floor helix: rails at y = 50 down to y = 0 on a 40 m
  // floorplate. GrindSystem registers every rail at y = 0.80 whatever the author
  // wrote, so those fifty floors of handrail were all stacked on the ground floor
  // and the "descent" was the chair falling past them. The descent is now told by
  // the fiction and the props; the skating is a tight service core you can hold a
  // line in — 48 m across, lanes at 6 m so the walls are never more than a second
  // away.
  groundSize: 52,
  groundColor: '#444455',

  spawnPoint: {
    position: [-15, 0.6, -18],   // Top landing, facing down the east handrail run
    rotation: 0
  },

  bounds: {
    minX: -25,
    maxX: 25,
    minZ: -25,
    maxZ: 25
  },

  checkpoints: [],  // No checkpoints - it's one continuous descent

  objects: [
    // ---- the shaft ---------------------------------------------------------
    { type: 'wall_indoor', position: [0, 5, 25], params: { width: 50, height: 10, depth: 1 } },
    { type: 'wall_indoor', position: [0, 5, -25], params: { width: 50, height: 10, depth: 1 } },
    { type: 'wall_indoor', position: [25, 5, 0], rotation: [0, 90, 0], params: { width: 50, height: 10, depth: 1 } },
    { type: 'wall_indoor', position: [-25, 5, 0], rotation: [0, 90, 0], params: { width: 50, height: 10, depth: 1 } },
    { type: 'ceiling_slab', position: [0, 10, 0], params: { width: 50, depth: 50 } },
    { type: 'ceiling_panel', position: [-12.5, 9.5, -12.5], params: { width: 8, depth: 1.2 } },
    { type: 'ceiling_panel', position: [12.5, 9.5, 12.5], params: { width: 8, depth: 1.2 } },
    { type: 'ceiling_panel', position: [2.5, 9.5, 2.5], params: { width: 8, depth: 1.2 } },

    // ---- the lanes, and the kickers and pads staged on the bay centres
    // between them. Anything that would end up buried in a blockhouse is
    // dropped rather than left inside it.
    ...clearOf([...skateFloor(24, 5, 12), ...bayStaging(5)], LEVEL_2_PENS),

    // ---- the lift core the switchbacks wrap: a blockhouse standing on the police patrol post
    // that lands inside the floorplate. See THE HOLDING PENS above.
    ...LEVEL_2_PENS,

    // ---- landings, stairs and litter, all on bay centres -------------------
    { type: 'stairs', position: [-17.5, 0, -17.5], rotation: [0, 45, 0], params: { steps: 3 } },
    { type: 'stairs', position: [17.5, 0, 17.5], rotation: [0, 225, 0], params: { steps: 3 } },
    { type: 'stairs', position: [0, 0, 24], rotation: [0, 180, 0], params: { steps: 3 } },
    { type: 'exit_sign', position: [0, 6, 24.4], params: { width: 5, height: 1.4 } },
    { type: 'trash_can', position: [-21.25, 0, 7.5] },
    { type: 'trash_can', position: [21.25, 0, -7.5] },
    { type: 'trash_can', position: [-7.5, 0, 21.25] },
    { type: 'trash_can', position: [7.5, 0, -21.25] },
  ],

  goals: [
    { type: 'escape', target: 1, description: 'Reach the lobby!', reward: 2500 },
    { type: 'score', target: 10000, description: 'Score 10,000 stonks', reward: 1500 },
    { type: 'grind', target: 5, description: 'Grind 5 stair rails', reward: 1000 },
    { type: 'time', target: 60, description: 'Finish in under 60 seconds', reward: 2000 },
  ],
  
  timeLimit: 90,
  
  introDialogue: [
    'TONY: 50 floors down... piece of cake!',
    'TONY: These chair wheels were made for grinding!'
  ]
};

const LEVEL_3_PENS = holdingPens([-18.75, -22], 28.5, 'wall_indoor');

const LEVEL_3_LOBBY: StoryLevelData = {
  id: 'story_3_lobby',
  chapter: 1,
  storyOrder: 3,
  nextLevel: 'story_4_highway',
  name: 'Lobby Showdown',
  subtitle: 'The Great Escape',
  description: 'The grand lobby is crawling with security. Crash through the glass doors to freedom!',
  
  skyColor: '#87ceeb',
  skyColorTop: '#5a9fd4',
  skyColorBottom: '#b8d4e8',
  fogColor: '#c0c0c0',
  fogNear: 30,
  fogFar: 100,
  ambientLight: 0.7,
  sunIntensity: 1.0,
  
  // A 64 m marble hall. The old lobby had five rails on a 100 m floor — a probe
  // run spent 26 seconds pinned at max speed with a 2.7 s best line, because
  // there was nothing between the spawn and the far wall to hold onto.
  groundSize: 64,
  groundColor: '#d4c4a8',  // Marble floor

  spawnPoint: {
    position: [-18.75, 0.6, -22],   // Off the south doors, facing up the west aisle
    rotation: 0
  },

  bounds: {
    minX: -30,
    maxX: 30,
    minZ: -30,
    maxZ: 30
  },

  checkpoints: [
    {
      position: [0, 0.6, 27],
      rotation: 0,
      name: 'Escaped the building!',
      dialogue: [
        'TONY: FREEDOM! But I\'m not out of the woods yet...',
        'SEC AGENT: *into radio* Subject is heading to the highway!'
      ]
    }
  ],

  objects: [
    // ---- the hall ----------------------------------------------------------
    { type: 'wall_indoor', position: [0, 7, 31], params: { width: 62, height: 14, depth: 1 } },
    { type: 'wall_indoor', position: [0, 7, -31], params: { width: 62, height: 14, depth: 1 } },
    { type: 'wall_indoor', position: [31, 7, 0], rotation: [0, 90, 0], params: { width: 62, height: 14, depth: 1 } },
    { type: 'wall_indoor', position: [-31, 7, 0], rotation: [0, 90, 0], params: { width: 62, height: 14, depth: 1 } },

    // ---- the lanes, and the kickers and pads staged on the bay centres
    // between them. Anything that would end up buried in a blockhouse is
    // dropped rather than left inside it.
    ...clearOf([...skateFloor(30, 5, 15), ...bayStaging(5)], LEVEL_3_PENS),

    // ---- the security desk island: a blockhouse standing on the police patrol post
    // that lands inside the floorplate. See THE HOLDING PENS above.
    ...LEVEL_3_PENS,

    // ---- columns, benches and planters, on bay centres ---------------------
    { type: 'planter', position: [-27.5, 0, -12.5] },
    { type: 'planter', position: [-27.5, 0, 12.5] },
    { type: 'planter', position: [27.5, 0, -12.5] },
    { type: 'planter', position: [27.5, 0, 12.5] },
    { type: 'planter', position: [-12.5, 0, -27.5] },
    { type: 'planter', position: [12.5, 0, 27.5] },
    { type: 'planter', position: [-27.5, 0, 27.5] },
    { type: 'planter', position: [27.5, 0, -27.5] },
    { type: 'bench', position: [-12.5, 0, 12.5] },
    { type: 'bench', position: [12.5, 0, -12.5] },
    { type: 'bench', position: [-22.5, 0, -2.5] },
    { type: 'bench', position: [22.5, 0, 2.5] },
    { type: 'trash_can', position: [-27.5, 0, -27.5] },
    { type: 'trash_can', position: [27.5, 0, 27.5] },
    { type: 'exit_sign', position: [0, 8, 30.4], params: { width: 8, height: 2 } },
  ],

  collectibles: [
    { type: 'money', position: [0, 1.2, -18.75], value: 2000 },
    { type: 'money', position: [-18.75, 1.2, 0], value: 1000 },
    { type: 'money', position: [18.75, 1.2, 0], value: 1000 },
    { type: 'special', position: [3.75, 1.6, 3.75], value: 5000 },
  ],

  goals: [
    { type: 'escape', target: 1, description: 'Crash through the front doors!', reward: 3000 },
    { type: 'score', target: 15000, description: 'Score 15,000 stonks', reward: 2000 },
    { type: 'combo', target: 5000, description: 'Land a 5,000 point combo', reward: 1500 },
    { type: 'grind', target: 5, description: 'Grind the reception desk', reward: 1000 },
  ],
  
  timeLimit: 150,
  
  introDialogue: [
    'TONY: The lobby! Almost there!',
    'SECURITY: Stop that man! He\'s on a... chair?!',
    'TONY: Try and catch me!'
  ]
};

const LEVEL_4_PENS = holdingPens([-28, -34], 40, 'building_small');

const LEVEL_4_HIGHWAY: StoryLevelData = {
  id: 'story_4_highway',
  chapter: 2,
  storyOrder: 4,
  nextLevel: 'story_5_home',
  name: 'Highway Havoc',
  subtitle: 'Rush Hour Rumble',
  description: 'Weave through traffic on your office chair! Don\'t get flattened!',
  
  skyColor: '#87ceeb',
  skyColorTop: '#4a90d9',
  skyColorBottom: '#c8e0f4',
  fogColor: '#888888',
  fogNear: 50,
  fogFar: 200,
  ambientLight: 0.8,
  sunIntensity: 1.2,
  
  // The old highway was a 190 x 60 m corridor with six rails in it: the probe ran
  // 473 m at a pinned 20 m/s and never strung more than 5.4 s together. It is now
  // a 76 m interchange — same fiction, a tenth of the empty asphalt, jersey
  // barriers every 8 m in both directions.
  groundSize: 80,
  groundColor: '#333333',  // Asphalt

  spawnPoint: {
    position: [-28, 0.6, -34],   // Hard shoulder, pointed across the carriageway
    rotation: 90
  },

  bounds: {
    minX: -38,
    maxX: 38,
    minZ: -38,
    maxZ: 38
  },

  checkpoints: [
    {
      position: [0, 0.6, 0],
      rotation: 90,
      name: 'Halfway across!',
      dialogue: ['TONY: Construction site ahead - shortcut!']
    },
    {
      position: [34, 0.6, 0],
      rotation: 90,
      name: 'Made it to the suburbs!',
      dialogue: ['TONY: Home is just around the corner...']
    }
  ],

  objects: [
    // ---- the lanes, and the kickers and pads staged on the bay centres
    // between them. Anything that would end up buried in a blockhouse is
    // dropped rather than left inside it.
    ...clearOf([...skateFloor(40, 6, 16), ...bayStaging(6)], LEVEL_4_PENS),

    // ---- the gantry pier: a blockhouse standing on the police patrol post
    // that lands inside the floorplate. See THE HOLDING PENS above.
    ...LEVEL_4_PENS,

    // ---- stopped traffic and roadworks, parked on bay centres --------------
    { type: 'car', position: [-27, 0, -21], rotation: [0, 90, 0] },
    { type: 'car', position: [-27, 0, 3], rotation: [0, 90, 0] },
    { type: 'car', position: [-15, 0, -27], rotation: [0, 0, 0] },
    { type: 'car', position: [15, 0, 27], rotation: [0, 0, 0] },
    { type: 'car', position: [27, 0, -3], rotation: [0, -90, 0] },
    { type: 'car', position: [27, 0, 21], rotation: [0, -90, 0] },
    { type: 'car', position: [-3, 0, -33.25], rotation: [0, 0, 0] },
    { type: 'car', position: [3, 0, 33.25], rotation: [0, 0, 0] },
    { type: 'car', position: [-33.25, 0, 15], rotation: [0, 90, 0] },
    { type: 'car', position: [33.25, 0, -15], rotation: [0, -90, 0] },
    { type: 'cone', position: [-33.25, 0, -9] },
    { type: 'cone', position: [-33.25, 0, 9] },
    { type: 'cone', position: [33.25, 0, -9] },
    { type: 'cone', position: [33.25, 0, 9] },
    { type: 'cone', position: [-9, 0, -33.25] },
    { type: 'cone', position: [9, 0, 33.25] },
    { type: 'barrier', position: [-21, 0, 33.25], params: { length: 8 } },
    { type: 'barrier', position: [21, 0, -33.25], params: { length: 8 } },
  ],

  goals: [
    { type: 'escape', target: 1, description: 'Make it to the suburbs!', reward: 3500 },
    { type: 'score', target: 20000, description: 'Score 20,000 stonks', reward: 2500 },
    { type: 'grind', target: 10, description: 'Grind the highway barriers', reward: 2000 },
    { type: 'time', target: 90, description: 'Finish in under 90 seconds', reward: 3000 },
  ],
  
  timeLimit: 180,
  
  introDialogue: [
    'TONY: The highway! This chair was built for speed!',
    '📻 RADIO: Traffic backed up due to a... chair chase?!',
    'TONY: Just need to get to my house and grab my go-bag!'
  ]
};

const LEVEL_5_PENS = holdingPens([-24.5, -17.5], 34, 'building_small');

const LEVEL_5_HOME: StoryLevelData = {
  id: 'story_5_home',
  chapter: 2,
  storyOrder: 5,
  nextLevel: 'story_6_forest',
  name: 'Home Sweet Home... Not',
  subtitle: 'Nowhere to Run',
  description: 'Your house is surrounded by FBI! Grab what you can and escape through the back!',
  
  skyColor: '#ff9966',
  skyColorTop: '#ff6b35',
  skyColorBottom: '#ffb347',
  fogColor: '#ffaa77',
  fogNear: 40,
  fogFar: 120,
  ambientLight: 0.6,
  sunIntensity: 0.9,
  
  // Suburbia at skate scale: a 56 m block of back gardens with the fence lines,
  // deck edges and kerbs all grindable. The old version had four rails, no grind
  // in a 26 s probe at all, and a 2.15 s best line.
  groundSize: 68,
  groundColor: '#4a7c29',  // Grass

  spawnPoint: {
    position: [-24.5, 0.6, -17.5],   // Side gate, facing up the fence line
    rotation: 0
  },

  bounds: {
    minX: -30,
    maxX: 30,
    minZ: -30,
    maxZ: 30
  },

  checkpoints: [
    {
      position: [0, 0.6, 25],
      rotation: 0,
      name: 'Into the forest!',
      dialogue: ['TONY: The forest behind the house - they\'ll never catch me in there!']
    }
  ],

  objects: [
    // ---- the lanes, and the kickers and pads staged on the bay centres
    // between them. Anything that would end up buried in a blockhouse is
    // dropped rather than left inside it.
    ...clearOf([...skateFloor(34, 5, 14), ...bayStaging(5)], LEVEL_5_PENS),

    // ---- the garden studio: a blockhouse standing on the police patrol post
    // that lands inside the floorplate. See THE HOLDING PENS above.
    ...LEVEL_5_PENS,

    // ---- Tony's house and the FBI, both parked outside the skate floor -----
    // z = -36, not -31: the garden now runs out to the fence line at 32.5 and the
    // barrier behind it at 34, so a house at -31 would have stood across the two
    // outermost lanes — a 24 m wall in the middle of the skate floor, which is
    // the exact thing the outer ledge exists to prevent.
    { type: 'building_wide', position: [0, 0, -36], params: { width: 24, depth: 5, height: 8 } },
    { type: 'car', position: [-17.5, 0, -36], rotation: [0, 30, 0] },
    { type: 'car', position: [17.5, 0, -36], rotation: [0, -30, 0] },

    // ---- planting, on bay centres ------------------------------------------
    { type: 'tree_small', position: [-22.5, 0, 22.5] },
    { type: 'tree_small', position: [-12.5, 0, 22.5] },
    { type: 'tree_small', position: [-2.5, 0, 22.5] },
    { type: 'tree_small', position: [7.5, 0, 22.5] },
    { type: 'tree_small', position: [17.5, 0, 22.5] },
    { type: 'tree_small', position: [22.5, 0, -2.5] },
    { type: 'tree_small', position: [-22.5, 0, 2.5] },
    { type: 'tree_small', position: [22.5, 0, 12.5] },
    { type: 'tree_small', position: [-22.5, 0, -12.5] },
    { type: 'shrub_medium', position: [-12.5, 0, 12.5] },
    { type: 'shrub_medium', position: [12.5, 0, -12.5] },
    { type: 'shrub_medium', position: [-2.5, 0, -22.5] },
    { type: 'shrub_medium', position: [2.5, 0, 22.5] },
  ],

  collectibles: [
    { type: 'money', position: [-17.5, 1.2, 10.5], value: 1500 },
    { type: 'money', position: [17.5, 1.2, 10.5], value: 1500 },
    { type: 'special', position: [3.5, 1.6, 3.5], value: 3000 },
  ],

  goals: [
    { type: 'escape', target: 1, description: 'Escape into the forest!', reward: 2500 },
    { type: 'score', target: 10000, description: 'Score 10,000 stonks', reward: 1500 },
    { type: 'time', target: 45, description: 'Get out in under 45 seconds', reward: 2000 },
  ],
  
  timeLimit: 90,
  
  introDialogue: [
    'TONY: Home sweet-- wait, is that the FBI?!',
    'FBI AGENT: Tony Stonks! Come out with your hands up!',
    'TONY: That\'s not happening! Time for plan B...',
    'TONY: Through the backyard and into the forest!'
  ]
};

const LEVEL_6_PENS = holdingPens([-28, -20], 36, 'building_small');

const LEVEL_6_FOREST: StoryLevelData = {
  id: 'story_6_forest',
  chapter: 2,
  storyOrder: 6,
  nextLevel: 'story_7_trainyard',
  name: 'Forest Chase',
  subtitle: 'Lost in the Woods',
  description: 'Agents are right behind you! Use tricks for speed boosts to outrun them!',
  
  hasChaseMechanic: true,
  chaseSpeed: 8,  // Agents catch up at 8 units/sec if you're slow
  
  skyColor: '#2d4a2d',
  skyColorTop: '#1a3a1a',
  skyColorBottom: '#4a6a4a',
  fogColor: '#3a5a3a',
  fogNear: 15,
  fogFar: 60,
  ambientLight: 0.4,
  sunIntensity: 0.5,
  
  // A 64 m clearing threaded with fallen logs. Trees are the one prop in this
  // game whose collider floats clear of the chair (a 1 m box at y = 2.5), so the
  // forest can be genuinely dense without a single line-ending collision — the
  // trunks are scenery and the logs are the level.
  groundSize: 72,
  groundColor: '#3a5a3a',  // Forest floor

  spawnPoint: {
    position: [-28, 0.6, -20],   // Treeline, facing up the first log run
    rotation: 0
  },

  bounds: {
    minX: -34,
    maxX: 34,
    minZ: -34,
    maxZ: 34
  },

  checkpoints: [
    {
      position: [0, 0.6, 0],
      rotation: 90,
      name: 'Halfway through!',
      dialogue: ['TONY: I can hear them falling behind!']
    },
    {
      position: [28, 0.6, 0],
      rotation: 90,
      name: 'Lost them in the woods!',
      dialogue: [
        'TONY: *panting* I think... I lost them!',
        'TONY: Wait, is that a train yard up ahead?'
      ]
    }
  ],

  objects: [
    // ---- the lanes, and the kickers and pads staged on the bay centres
    // between them. Anything that would end up buried in a blockhouse is
    // dropped rather than left inside it.
    ...clearOf([...skateFloor(36, 6, 16), ...bayStaging(6)], LEVEL_6_PENS),

    // ---- the ranger hut: a blockhouse standing on the police patrol post
    // that lands inside the floorplate. See THE HOLDING PENS above.
    ...LEVEL_6_PENS,

    // ---- the wood. Tree colliders are a 1 m box floating at y = 2.5, the one
    // prop in the game that cannot end a line, so the forest can be dense.
    { type: 'tree_small', position: [-27.25, 0, -27.25] },
    { type: 'tree_small', position: [-21, 0, -15] },
    { type: 'tree_small', position: [-15, 0, -27.25] },
    { type: 'tree_small', position: [-27.25, 0, 3] },
    { type: 'tree_small', position: [-21, 0, 27.25] },
    { type: 'tree_small', position: [-15, 0, 9] },
    { type: 'tree_small', position: [-3, 0, -21] },
    { type: 'tree_small', position: [-3, 0, 27.25] },
    { type: 'tree_small', position: [3, 0, -27.25] },
    { type: 'tree_small', position: [3, 0, 21] },
    { type: 'tree_small', position: [15, 0, -15] },
    { type: 'tree_small', position: [15, 0, 27.25] },
    { type: 'tree_small', position: [21, 0, -27.25] },
    { type: 'tree_small', position: [21, 0, 9] },
    { type: 'tree_small', position: [27.25, 0, -3] },
    { type: 'tree_small', position: [27.25, 0, 27.25] },
    { type: 'tree_small', position: [-27.25, 0, 15] },
    { type: 'tree_small', position: [27.25, 0, -21] },
    { type: 'tree_small', position: [9, 0, 9] },
    { type: 'tree_small', position: [-9, 0, -9] },
    { type: 'shrub_medium', position: [-27.25, 0, 21] },
    { type: 'shrub_medium', position: [27.25, 0, -27.25] },
    { type: 'shrub_medium', position: [-21, 0, 3] },
    { type: 'shrub_medium', position: [21, 0, -9] },
  ],

  goals: [
    { type: 'escape', target: 1, description: 'Escape through the forest!', reward: 4000 },
    { type: 'score', target: 25000, description: 'Score 25,000 stonks', reward: 3000 },
    { type: 'grind', target: 5, description: 'Grind 5 fallen logs', reward: 2000 },
    { type: 'combo', target: 8000, description: 'Land an 8,000 point combo', reward: 2500 },
  ],
  
  timeLimit: 120,
  
  introDialogue: [
    'TONY: Into the forest! These wheels can handle anything!',
    'FBI AGENT: Don\'t let him escape! After him!',
    'TONY: Tricks give me speed boosts - time to show off!'
  ]
};

const LEVEL_7_PENS = holdingPens([-32, -28], 42, 'building_small');

const LEVEL_7_TRAINYARD: StoryLevelData = {
  id: 'story_7_trainyard',
  chapter: 3,
  storyOrder: 7,
  nextLevel: 'story_8_rooftops',
  name: 'Train Yard Takeoff',
  subtitle: 'End of the Line',
  description: 'Navigate the abandoned train yard. Grind the rails to catch a departing freight train!',
  
  skyColor: '#2c3e50',
  skyColorTop: '#1a252f',
  skyColorBottom: '#34495e',
  fogColor: '#3d566e',
  fogNear: 30,
  fogFar: 100,
  ambientLight: 0.35,
  sunIntensity: 0.4,
  
  // The train yard reads as long parallel track, which is exactly the shape that
  // measures well — but the old one had five 180 m rails, and a 180 m rail is a
  // guaranteed bail: BalanceSystem gives an uncorrected grind about 2.6 s deep in
  // a line, and the probe duly sat at 61% grinding with a 10 s ceiling on the
  // combo and a 10.6 m/s crawl. Same yard, track broken into sleepers-worth of
  // 18 m runs you can actually hold.
  groundSize: 84,
  groundColor: '#3a3a3a',  // Gravel

  spawnPoint: {
    position: [-32, 0.6, -28],   // Yard throat, facing up the running line
    rotation: 0
  },

  bounds: {
    minX: -40,
    maxX: 40,
    minZ: -40,
    maxZ: 40
  },

  checkpoints: [
    {
      position: [0, 0.6, 0],
      rotation: 90,
      name: 'Past the yard office',
      dialogue: ['TONY: There\'s a freight train starting to move!']
    },
    {
      position: [32, 0.6, 0],
      rotation: 90,
      name: 'Caught the train!',
      dialogue: [
        'TONY: Made it! This train will take me far away...',
        'TONY: Wait, where is this thing going?'
      ]
    }
  ],

  objects: [
    // ---- the lanes, and the kickers and pads staged on the bay centres
    // between them. Anything that would end up buried in a blockhouse is
    // dropped rather than left inside it.
    ...clearOf([...skateFloor(42, 6, 18), ...bayStaging(6)], LEVEL_7_PENS),

    // ---- the signal box: a blockhouse standing on the police patrol post
    // that lands inside the floorplate. See THE HOLDING PENS above.
    ...LEVEL_7_PENS,

    // ---- flat wagons: low decks you ride along, not blocks you hit ---------
    funbox(-21, -15, 4.4, 16, 0.4),
    funbox(-21, 15, 4.4, 16, 0.4),
    funbox(21, -15, 4.4, 16, 0.4),
    funbox(21, 15, 4.4, 16, 0.4),

    // ---- yard buildings, clear of the outermost lane -----------------------
    // Beyond the boundary ledge at 40.5, not inside it. A 10 m wide building
    // cannot stand anywhere on this floor: the lanes running the other way are
    // 6 m apart, so anything wider than a bay is crossed by one of them, and a
    // grind that ends inside a wall is worse than no grind. They read as the
    // yard offices across the running lines.
    { type: 'building_small', position: [-27, 0, -43], params: { width: 10, depth: 3, height: 6 } },
    { type: 'building_small', position: [27, 0, 43], params: { width: 10, depth: 3, height: 6 } },
    { type: 'trash_can', position: [-33.25, 0, 27] },
    { type: 'trash_can', position: [-15, 0, 33.25] },
    { type: 'trash_can', position: [33.25, 0, -27] },
    { type: 'trash_can', position: [15, 0, -33.25] },
    { type: 'cone', position: [-3, 0, -33.25] },
    { type: 'cone', position: [3, 0, 33.25] },
  ],

  collectibles: [
    { type: 'money', position: [-20, 1.2, -12], value: 2000 },
    { type: 'money', position: [20, 1.2, 12], value: 2000 },
    { type: 'special', position: [4, 1.6, 4], value: 5000 },
  ],

  goals: [
    { type: 'escape', target: 1, description: 'Catch the freight train!', reward: 5000 },
    { type: 'score', target: 30000, description: 'Score 30,000 stonks', reward: 4000 },
    { type: 'grind', target: 15, description: 'Grind 15 railroad tracks', reward: 3000 },
    { type: 'combo', target: 12000, description: 'Land a 12,000 point combo', reward: 3500 },
  ],
  
  timeLimit: 180,
  
  introDialogue: [
    'TONY: An old train yard! Perfect place to lose them.',
    'TONY: Wait... is that freight train starting to move?',
    'TONY: If I can catch it, I\'m home free!'
  ]
};

// Spawn moved 4.6 m and the blockhouses shrunk, both for the same reason: at the
// old spawn Game.spawnPolice() put a post at (-12.3, -17.4), which is 0.34 m off
// the lane at z = -18, so the blockhouse standing on it was a 4 m wall square
// across a rail. Measured: the run came up that lane at 10 m/s and went to
// 0.00 m/s in one frame at t = 4.6 s, four tricks in. Moving the spawn to
// (-31.5, -27) pushes the second post off the deck entirely and leaves the
// remaining one 2.16 m off the nearest lane, and 2.6 m of box then clears that
// lane by 0.86 m — enough for a chair on it (0.4 m half-width) to pass. It still
// blocks the officer's line of sight, which is all the pen is for.
const LEVEL_8_PENS = holdingPens([-31.5, -27], 38, 'building_small', 2.6, 5);

const LEVEL_8_ROOFTOPS: StoryLevelData = {
  id: 'story_8_rooftops',
  chapter: 3,
  storyOrder: 8,
  nextLevel: 'story_9_finale',
  name: 'Rooftop Run',
  subtitle: 'Sky High Stakes',
  description: 'The train dropped you in the city. Escape across the rooftops to the helipad!',
  
  skyColor: '#1a1a2e',
  skyColorTop: '#0a0a15',
  skyColorBottom: '#2a2a4e',
  fogColor: '#1a1a2e',
  fogNear: 40,
  fogFar: 150,
  ambientLight: 0.3,
  sunIntensity: 0.2,
  
  // ONE roof, not nine. The old level stacked nine platforms from y = 18 to
  // y = 30 and spawned the player at y = 20 — but Game.createLevelObject builds
  // every fun box collider up from y = 0 and registers every rail at y = 0.80, so
  // there was nothing at all up there: the probe fell to the ground plane, rolled
  // 457 m across an empty asphalt square and never grinded once. The roofscape is
  // now told with parapets, plant rooms and vent housings on a single 68 m deck.
  groundSize: 76,
  groundColor: '#333333',

  spawnPoint: {
    position: [-31.5, 0.6, -27],   // Stairhead, facing along the parapet run
    rotation: 0
  },

  bounds: {
    minX: -36,
    maxX: 36,
    minZ: -36,
    maxZ: 36
  },

  checkpoints: [
    {
      position: [0, 0.6, 0],
      rotation: 90,
      name: 'Halfway across!',
      dialogue: ['TONY: I can see the helipad! Just a few more jumps!']
    },
    {
      position: [28, 0.6, 0],
      rotation: 90,
      name: 'Reached the helipad!',
      dialogue: [
        'TONY: The helicopter is waiting! Time for the finale!',
        'PILOT: Mr. Stonks! We\'ve got one last obstacle...'
      ]
    }
  ],

  objects: [
    // ---- the lanes, and the kickers and pads staged on the bay centres
    // between them. Anything that would end up buried in a blockhouse is
    // dropped rather than left inside it.
    ...clearOf([...skateFloor(38, 6, 16), ...bayStaging(6)], LEVEL_8_PENS),

    // ---- the rooftop plant room: a blockhouse standing on the police patrol post
    // that lands inside the floorplate. See THE HOLDING PENS above.
    ...LEVEL_8_PENS,

    // ---- the helipad, in the east bay where the escape zone sits -----------
    // 27, not 28.25: the deck now runs out to 36.5, which puts a lane at 30 that
    // the old pad straddled. 27 is the bay centre between 24 and 30.
    funbox(27, 0, 4.4, 14, 0.4),

    // ---- water tanks, stair heads and vents, on bay centres ----------------
    { type: 'planter', position: [-27, 0, 27] },
    { type: 'planter', position: [27, 0, 27] },
    { type: 'planter', position: [-27, 0, -27] },
    { type: 'planter', position: [-21, 0, 21] },
    { type: 'planter', position: [21, 0, -21] },
    { type: 'trash_can', position: [-15, 0, 27] },
    { type: 'trash_can', position: [15, 0, -27] },
    { type: 'trash_can', position: [-3, 0, -27] },
    { type: 'trash_can', position: [3, 0, 27] },
    { type: 'exit_sign', position: [34, 6, 0], rotation: [0, 90, 0], params: { width: 6, height: 1.6 } },
  ],

  collectibles: [
    { type: 'money', position: [-20, 1.2, 0], value: 3000 },
    { type: 'money', position: [0, 1.2, 20], value: 3000 },
    { type: 'money', position: [20, 1.2, 0], value: 3000 },
    { type: 'special', position: [27, 1.6, 0], value: 7500 },
  ],

  goals: [
    { type: 'escape', target: 1, description: 'Reach the helipad!', reward: 6000 },
    { type: 'score', target: 40000, description: 'Score 40,000 stonks', reward: 5000 },
    { type: 'grind', target: 10, description: 'Grind 10 rooftop rails', reward: 3500 },
    { type: 'combo', target: 15000, description: 'Land a 15,000 point combo', reward: 4000 },
  ],
  
  timeLimit: 200,
  
  introDialogue: [
    'TONY: The city skyline! The helicopter is on that far building!',
    'TONY: Time for some rooftop acrobatics!',
    '🚁 PILOT: *radio* Mr. Stonks, hurry! They\'re closing in!'
  ]
};

const LEVEL_9_PENS = holdingPens([-26.25, -22], 32, 'building_small');

const LEVEL_9_FINALE: StoryLevelData = {
  id: 'story_9_finale',
  chapter: 3,
  storyOrder: 9,
  name: 'The Great Escape',
  subtitle: 'Freedom at Last',
  description: 'One final gauntlet! Make it to the helicopter before the SEC catches up!',
  
  hasChaseMechanic: true,
  chaseSpeed: 12,  // Faster chase in finale
  
  skyColor: '#ff6b35',
  skyColorTop: '#ff4500',
  skyColorBottom: '#ffa500',
  fogColor: '#ff8c42',
  fogNear: 40,
  fogFar: 120,
  ambientLight: 0.6,
  sunIntensity: 1.0,
  
  // The last gauntlet, at the density the rest of the chapter now runs at: a 60 m
  // arena of rails and kickers with the helipad in the east bay. The old finale
  // put eight rails and a helicopter platform at y = 4 (a collider the engine
  // built at ground level) across a 140 m square.
  groundSize: 64,
  groundColor: '#444444',

  spawnPoint: {
    position: [-26.25, 0.6, -22],   // Rooftop plaza, facing up the first rail run
    rotation: 0
  },

  bounds: {
    minX: -30,
    maxX: 30,
    minZ: -30,
    maxZ: 30
  },

  checkpoints: [
    {
      position: [26, 0.6, 0],
      rotation: 90,
      name: 'FREEDOM!',
      dialogue: [
        '🎉 TONY: I DID IT! STONKS TO THE MOON!',
        'SEC AGENT: He got away... again.',
        '🚁 PILOT: Where to, Mr. Stonks?',
        'TONY: Somewhere with no extradition treaty... and beaches!',
        '📰 EPILOGUE: Tony Stonks was never seen again...',
        '📈 ...but his legendary escape became a viral video,',
        '💰 ...and STONKS coin went up 10,000%.',
        '🏝️ THE END... ?'
      ]
    }
  ],

  objects: [
    // ---- the lanes, and the kickers and pads staged on the bay centres
    // between them. Anything that would end up buried in a blockhouse is
    // dropped rather than left inside it.
    ...clearOf([...skateFloor(32, 5, 15), ...bayStaging(5)], LEVEL_9_PENS),

    // ---- the plaza service block: a blockhouse standing on the police patrol post
    // that lands inside the floorplate. See THE HOLDING PENS above.
    ...LEVEL_9_PENS,

    // ---- the helipad, in the east bay --------------------------------------
    funbox(27.5, 0, 3.4, 14, 0.4),

    // ---- the roadblock, parked clear of every lane -------------------------
    { type: 'car', position: [-27.5, 0, -12.5], rotation: [0, 30, 0] },
    { type: 'car', position: [-27.5, 0, 12.5], rotation: [0, -30, 0] },
    { type: 'car', position: [-12.5, 0, -27.5], rotation: [0, 0, 0] },
    { type: 'car', position: [12.5, 0, 27.5], rotation: [0, 0, 0] },
    { type: 'cone', position: [-2.5, 0, -27.5] },
    { type: 'cone', position: [2.5, 0, 27.5] },
    { type: 'cone', position: [12.5, 0, -27.5] },
    { type: 'cone', position: [-12.5, 0, 27.5] },
    { type: 'trash_can', position: [-27.5, 0, 27.5] },
    { type: 'trash_can', position: [27.5, 0, -27.5] },
    { type: 'barrier', position: [-17.5, 0, 27.5], params: { length: 8 } },
    { type: 'barrier', position: [17.5, 0, -27.5], params: { length: 8 } },
  ],

  collectibles: [
    { type: 'money', position: [-18.75, 1.2, 0], value: 2500 },
    { type: 'money', position: [0, 1.2, -18.75], value: 2500 },
    { type: 'money', position: [0, 1.2, 18.75], value: 5000 },
    { type: 'money', position: [11.25, 1.2, 0], value: 5000 },
    { type: 'special', position: [26.25, 1.6, 0], value: 10000 },
  ],

  goals: [
    { type: 'escape', target: 1, description: 'REACH THE HELICOPTER!', reward: 10000 },
    { type: 'score', target: 50000, description: 'Score 50,000 stonks (finale bonus!)', reward: 7500 },
    { type: 'combo', target: 20000, description: 'Land a LEGENDARY 20K combo!', reward: 5000 },
    { type: 'time', target: 60, description: 'Escape in under 60 seconds!', reward: 8000 },
  ],
  
  timeLimit: 120,
  
  introDialogue: [
    '🚁 PILOT: Mr. Stonks! They\'re right behind you!',
    'SEC AGENT: This is your last chance, Stonks! Give up!',
    'TONY: NEVER! DIAMOND HANDS FOREVER! 💎🙌',
    'TONY: ONE LAST RIDE!'
  ]
};

// All story levels
export const STORY_LEVELS: StoryLevelData[] = [
  LEVEL_1_OFFICE,
  LEVEL_2_STAIRWELL,
  LEVEL_3_LOBBY,
  LEVEL_4_HIGHWAY,
  LEVEL_5_HOME,
  LEVEL_6_FOREST,
  LEVEL_7_TRAINYARD,
  LEVEL_8_ROOFTOPS,
  LEVEL_9_FINALE
];

// Get story level by ID
export function getStoryLevelById(id: string): StoryLevelData | undefined {
  return STORY_LEVELS.find(level => level.id === id);
}

// Get story levels by chapter
export function getStoryLevelsByChapter(chapter: number): StoryLevelData[] {
  return STORY_LEVELS.filter(level => level.chapter === chapter).sort((a, b) => a.storyOrder - b.storyOrder);
}

// Get next story level
export function getNextStoryLevel(currentId: string): StoryLevelData | undefined {
  const current = getStoryLevelById(currentId);
  if (!current?.nextLevel) return undefined;
  return getStoryLevelById(current.nextLevel);
}
