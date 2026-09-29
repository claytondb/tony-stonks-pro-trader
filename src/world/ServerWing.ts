/**
 * THE SERVER WING — off the atrium's WEST wall, the mirror of the Wellness Wing.
 *
 * Three rooms, three kinds of skating:
 *   the atrium        open plaza street: long rails, planters, a kicker, a vert wall
 *   the pool (east)   one big transition: carve, air, grind the coping
 *   the server room   TECH LINES: narrow aisles between rack rows, a cable tray to grind
 *                     down the middle of every aisle, raised-floor manual pads, and a
 *                     cooling-duct quarter pipe closing BOTH ends — so an aisle is a run,
 *                     the duct turns you round, and the next aisle is the run back.
 *
 * It is also the server room the owner asked for in the first place ("a server room"), which
 * the skatepark rebuild had reduced to a row of racks against a wall.
 *
 * Layout (x across, z along; the room is x -49..-33, z -20..14):
 *
 *      z=14  ======== cooling duct QP (faces south) ========
 *             aisle W  |rack|  aisle M  |rack|  aisle E
 *             tray     |row |  pads     |row |  tray
 *      z≈-3.5 ------------- cross aisle to the door ---------- <- corridor from the atrium
 *             tray     |rack|  pads     |rack|  tray
 *      z=-20 ======== cooling duct QP (faces north) ========
 */
import * as THREE from 'three';
import { makeServerRack, mergePropsByMaterial } from './OfficeProps';

export interface ServerWingCollider {
  position: THREE.Vector3;
  halfExtents: THREE.Vector3;
  rotationY: number;
  trimesh?: { vertices: Float32Array; indices: Uint32Array };
}

export interface ServerWing {
  root: THREE.Group;
  colliders: ServerWingCollider[];
  rails: { start: THREE.Vector3; end: THREE.Vector3 }[];
  door: { z0: number; z1: number; height: number };
  minX: number;
}

const OFFICE_WEST = -23.0;
const DOOR_Z0 = -6.5, DOOR_Z1 = -0.5, DOOR_H = 3.6;
const RX0 = -49.0, RX1 = -33.0, RZ0 = -20.0, RZ1 = 14.0;
const CEIL = 5.6;
const WALL_T = 0.3;
const ROWS_X = [-38.5, -43.5];                  // rack row centres
const ROW_HALF_W = 0.55;                        // rack depth / 2
const QP_D = 2.3, QP_H = 1.6, QP_GAP = 0.6;
const DUCT_RC = 2.6, DUCT_LEG = 2.0, DUCT_TAPER = 3.0;   // duct corner radius, side-wall leg, taper length
const ROW_Z = [[-15.2, -8.3], [1.3, 9.2]] as const;   // row runs (south block, north block)

/** Named gaps for GoalSystem. */
export const SERVER_GAPS = [
  { id: 'duct_air_n', name: 'Cooling Duct Air', bonus: 800, from: [-41.0, 0, 9.0] as [number, number, number], to: [-41.0, 0, 9.0] as [number, number, number], radius: 6.0 },
  { id: 'duct_air_s', name: 'Cold Aisle Air', bonus: 800, from: [-41.0, 0, -15.0] as [number, number, number], to: [-41.0, 0, -15.0] as [number, number, number], radius: 6.0 },
];

function ductTexture(): THREE.CanvasTexture {
  // Galvanised sheet: riveted seams every 1.2 m, a faint spangle.
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#9aa2ab'; g.fillRect(0, 0, 128, 128);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) { g.fillStyle = rnd() < 0.5 ? '#a6aeb7' : '#8f97a0'; g.fillRect(rnd() * 128, rnd() * 128, 6 + rnd() * 10, 4 + rnd() * 8); }
  g.fillStyle = '#6c737b'; g.fillRect(0, 0, 3, 128);
  for (let y = 6; y < 128; y += 16) { g.fillStyle = '#c5ccd3'; g.fillRect(6, y, 3, 3); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function floorTexture(): THREE.CanvasTexture {
  // Raised access floor: 600 mm panels, a perforated one every so often.
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#23272c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    g.fillStyle = (i + j) % 3 === 0 ? '#3f454c' : '#4a5058';
    g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    if ((i * 3 + j) % 5 === 0) {
      g.fillStyle = '#454b52';
      for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) g.fillRect(i * 64 + 8 + a * 9, j * 64 + 8 + b * 9, 4, 4);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildServerWing(): ServerWing {
  const root = new THREE.Group();
  root.name = 'serverWing';
  const colliders: ServerWingCollider[] = [];
  const rails: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
  const meshes: THREE.Object3D[] = [];
  const add = (o: THREE.Object3D) => { meshes.push(o); };

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.85 });
  const corridorWallMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.9 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x3a424c, roughness: 0.95, emissive: 0x14181c });
  const trayMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.4, roughness: 0.45 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.75, roughness: 0.35 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x4a525b, roughness: 0.6 });
  const carpetMat = new THREE.MeshStandardMaterial({ color: 0x8f7a5a, roughness: 1.0 });
  const ductMat = new THREE.MeshStandardMaterial({ map: ductTexture(), color: 0xb4bcc6, metalness: 0.55, roughness: 0.4 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.6, color: 0x8a9099 });

  const plane = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rx: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.receiveShadow = true;
    add(m); return m;
  };
  const wall = (x: number, z: number, w: number, h: number, y: number, rotY: number, mat: THREE.Material, collide = true) => {
    plane(w, h, mat, x, y + h / 2, z, 0, rotY);
    if (collide) {
      const nx = Math.sin(rotY), nz = Math.cos(rotY);
      colliders.push({ position: new THREE.Vector3(x - nx * WALL_T, y + h / 2, z - nz * WALL_T), halfExtents: new THREE.Vector3(w / 2, h / 2 + 1, WALL_T), rotationY: rotY });
    }
  };

  const rw = RX1 - RX0, rd = RZ1 - RZ0, rcx = (RX0 + RX1) / 2, rcz = (RZ0 + RZ1) / 2;
  // Floor (visual; the ground slab is the collider), ceiling, walls.
  floorMat.map!.repeat.set(rw / 2.4, rd / 2.4);
  plane(rw, rd, floorMat, rcx, 0.01, rcz, -Math.PI / 2, 0);
  plane(rw, rd, ceilMat, rcx, CEIL, rcz, Math.PI / 2, 0);
  wall(rcx, RZ0, rw, CEIL, 0, 0, wallMat);
  wall(rcx, RZ1, rw, CEIL, 0, Math.PI, wallMat);
  wall(RX0, rcz, rd, CEIL, 0, Math.PI / 2, wallMat);
  wall(RX1, (RZ0 + DOOR_Z0) / 2, DOOR_Z0 - RZ0, CEIL, 0, -Math.PI / 2, wallMat);
  wall(RX1, (DOOR_Z1 + RZ1) / 2, RZ1 - DOOR_Z1, CEIL, 0, -Math.PI / 2, wallMat);
  wall(RX1, (DOOR_Z0 + DOOR_Z1) / 2, DOOR_Z1 - DOOR_Z0, CEIL - DOOR_H, DOOR_H, -Math.PI / 2, wallMat, false);

  // ---- rack rows: one collider per run, racks alternating which aisle they face
  for (const x of ROWS_X) {
    for (const [z0, z1] of ROW_Z) {
      const n = Math.floor((z1 - z0) / 0.64);
      for (let k = 0; k < n; k++) {
        const rack = makeServerRack({ variant: k % 3 === 0 ? 0 : 1, seed: 7000 + Math.round(x * 10) + k });
        rack.position.set(x, 0, z0 + 0.32 + k * 0.64);
        rack.rotation.y = (k % 2 === 0 ? 1 : -1) * Math.PI / 2;
        rack.updateMatrixWorld(true);
        add(rack);
      }
      const zc = (z0 + z1) / 2;
      colliders.push({ position: new THREE.Vector3(x, 1.05, zc), halfExtents: new THREE.Vector3(ROW_HALF_W, 1.05, (z1 - z0) / 2), rotationY: 0 });
      // End-of-row cap: a hazard-striped steel end panel, and the row TOP edge is no grind
      // (2.1 m is out of reach) — the lines are on the floor.
      for (const zz of [z0, z1]) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.1, 0.06), steelMat);
        cap.position.set(x, 1.05, zz); add(cap);
      }
    }
  }

  // ---- cable trays: a grind down the middle of each OUTER aisle, full length between the ducts
  const trayZ0 = RZ0 + QP_GAP + DUCT_RC + DUCT_LEG + 0.8, trayZ1 = RZ1 - QP_GAP - DUCT_RC - DUCT_LEG - 0.8;
  const aisleCentres = [(RX1 + ROWS_X[0] + ROW_HALF_W) / 2, (RX0 + ROWS_X[1] - ROW_HALF_W) / 2];
  for (const ax of aisleCentres) {
    // Broken at the cross aisle so you can ride across it, i.e. two trays per aisle.
    for (const [z0, z1] of [[trayZ0, DOOR_Z0 - 1.0], [DOOR_Z1 + 1.0, trayZ1]]) {
      const len = z1 - z0, y = 0.78;
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, len), trayMat);
      tray.position.set(ax, y, (z0 + z1) / 2); tray.castShadow = true; add(tray);
      for (let k = 0; k <= Math.floor(len / 2.5); k++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, y, 0.05), steelMat);
        post.position.set(ax, y / 2, z0 + 0.2 + (k * (len - 0.4)) / Math.max(1, Math.floor(len / 2.5)));
        add(post);
      }
      rails.push({ start: new THREE.Vector3(ax, y + 0.05, z0 + 0.1), end: new THREE.Vector3(ax, y + 0.05, z1 - 0.1) });
    }
  }

  // ---- raised floor panels down the middle aisle: manual pads (0.28 m, under STEP_HEIGHT)
  const midX = (ROWS_X[0] + ROWS_X[1]) / 2;
  for (const [z0, z1] of [[-14.5, -9.5], [-4.8, -2.2], [2.5, 8.5]]) {
    const h = 0.28, w = 2.0, len = z1 - z0;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), padMat);
    pad.position.set(midX, h / 2, (z0 + z1) / 2); pad.castShadow = pad.receiveShadow = true; add(pad);
    colliders.push({ position: new THREE.Vector3(midX, h / 2, (z0 + z1) / 2), halfExtents: new THREE.Vector3(w / 2, h / 2, len / 2), rotationY: 0 });
    for (const s of [-1, 1]) rails.push({ start: new THREE.Vector3(midX + s * w / 2, h + 0.02, z0 + 0.2), end: new THREE.Vector3(midX + s * w / 2, h + 0.02, z1 - 0.2) });
  }

  // ---- the cooling ducts: a quarter pipe across each end wall that WRAPS the corners
  // A straight full-width QP ended in the side walls: carve along it and you rode straight into
  // a wall at 12 m/s. So the coping follows a U — across the end wall, round a 2.6 m corner,
  // then 2 m down each side wall with the transition shrinking to nothing — and a carve along
  // the duct comes off it as a run back down the outer aisle.
  for (const s of [1, -1]) buildDuct(s);
  function buildDuct(s: number) {
    const zWall = s > 0 ? RZ1 : RZ0;
    // Local plan coords (x, b): b = distance in from the end wall. World z = zWall - s*b.
    const g = QP_GAP, rc = DUCT_RC, L = DUCT_LEG, T = DUCT_TAPER;
    const xa = RX0 + g, xb = RX1 - g;
    const path: { x: number; b: number; nx: number; nb: number }[] = [];
    const push = (x: number, b: number, nx: number, nb: number) => path.push({ x, b, nx, nb });
    for (let i = 0; i <= 6; i++) push(xa, g + rc + L * (1 - i / 6), 1, 0);                    // west leg, heading to the wall
    for (let i = 1; i <= 10; i++) { const th = Math.PI + (i / 10) * Math.PI / 2; push(xa + rc + rc * Math.cos(th), g + rc + rc * Math.sin(th), -Math.cos(th), -Math.sin(th)); }
    const xs0 = xa + rc, xs1 = xb - rc;
    for (let i = 1; i < 8; i++) push(xs0 + (xs1 - xs0) * (i / 8), g, 0, 1);                    // across the end wall
    for (let i = 0; i <= 10; i++) { const th = 1.5 * Math.PI + (i / 10) * Math.PI / 2; push(xb - rc + rc * Math.cos(th), g + rc + rc * Math.sin(th), -Math.cos(th), -Math.sin(th)); }
    for (let i = 1; i <= 6; i++) push(xb, g + rc + L * (i / 6), -1, 0);                        // east leg, away from the wall
    // Arc length along the coping, and the taper: full size except the last T metres of each leg.
    const acc = [0];
    for (let i = 1; i < path.length; i++) acc.push(acc[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].b - path[i - 1].b));
    const tot = acc[acc.length - 1];
    const size = (i: number) => { const u = Math.min(1, Math.min(acc[i], tot - acc[i]) / T); return Math.max(0.03, u * u * (3 - 2 * u)); };
    const wz = (b: number) => zWall - s * b;
    const SEG = 12;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const row = SEG + 2;                                   // profile points + the wall-side deck point
    for (let i = 0; i < path.length; i++) {
      const p = path[i], f = size(i), H = QP_H * f, D = QP_D * f;
      for (let k = 0; k <= SEG; k++) {
        const t = (k / SEG) * Math.PI / 2;                 // 0 = floor edge, π/2 = coping
        const d = D * (1 - Math.sin(t));
        pos.push(p.x + p.nx * d, H * (1 - Math.cos(t)), wz(p.b + p.nb * d));
        uv.push(acc[i] / 1.2, (t * Math.max(H, 0.2)) / 1.2);
      }
      // Deck: from the coping straight back to whichever wall is nearer along -n.
      const tx = p.nx > 1e-3 ? (p.x - RX0) / p.nx : p.nx < -1e-3 ? (RX1 - p.x) / -p.nx : 1e9;
      const tb = p.nb > 1e-3 ? p.b / p.nb : 1e9;
      const tw = Math.min(tx, tb);
      pos.push(p.x - p.nx * tw, H, wz(p.b - p.nb * tw));
      uv.push(acc[i] / 1.2, (Math.PI / 2 * Math.max(H, 0.2) + tw) / 1.2);
    }
    for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < row - 1; k++) {
      const a = i * row + k, b2 = a + 1, c = a + row, e = c + 1;
      if (s > 0) idx.push(a, b2, c, b2, e, c); else idx.push(a, c, b2, b2, c, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, ductMat); mesh.castShadow = mesh.receiveShadow = true; add(mesh);
    colliders.push({
      position: new THREE.Vector3(0, 0, 0), halfExtents: new THREE.Vector3(rw / 2, QP_H / 2, QP_D / 2), rotationY: 0,
      trimesh: { vertices: new Float32Array(pos), indices: new Uint32Array(idx) },
    });
    // Coping pipe the whole way round; the straight run is the grind.
    const cop = path.map((p, i) => new THREE.Vector3(p.x, QP_H * size(i) + 0.02, wz(p.b)));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cop), 96, 0.045, 6, false), steelMat);
    tube.castShadow = true; add(tube);
    rails.push({ start: new THREE.Vector3(xs0, QP_H + 0.06, wz(g + 0.045)), end: new THREE.Vector3(xs1, QP_H + 0.06, wz(g + 0.045)) });
    // Duct grille above the coping.
    const grille = new THREE.Mesh(new THREE.BoxGeometry(xs1 - xs0 + 2 * rc, 1.2, 0.1), steelMat);
    grille.position.set(rcx, QP_H + 1.1, wz(0.12)); add(grille);
  }

  // ---- the NOC wall: the dead end of the cross aisle gets something to look at
  {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 384;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#05080d'; g.fillRect(0, 0, 1024, 384);
    let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let p = 0; p < 6; p++) {
      const px = 12 + (p % 3) * 337, py = 12 + Math.floor(p / 3) * 186;
      g.strokeStyle = '#1f6fb2'; g.lineWidth = 3; g.strokeRect(px, py, 325, 174);
      g.strokeStyle = ['#44e38a', '#ffcf3a', '#5fc8ff', '#ff5d5d', '#44e38a', '#c38bff'][p]; g.lineWidth = 4;
      g.beginPath(); let y = py + 120;
      for (let x = px + 10; x < px + 315; x += 15) { y = Math.max(py + 30, Math.min(py + 160, y + (rnd() - 0.55) * 30)); x === px + 10 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
      g.fillStyle = '#9fb7cc'; g.font = '22px monospace';
      g.fillText(['CPU 99%', 'STONKS API', 'LATENCY', 'ERRORS', 'UPTIME 99.9', 'CHAIR TELEMETRY'][p], px + 10, py + 26);
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.8 });
    const noc = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 2.8), m);
    noc.position.set(RX0 + 0.05, 2.6, (DOOR_Z0 + DOOR_Z1) / 2); noc.rotation.y = Math.PI / 2;
    root.add(noc);
  }

  // ---- lights: two cold overheads and blue status glow
  for (const lz of [-10, 6]) {
    const l = new THREE.PointLight(0x9ecbff, 0.8, 18, 2);
    l.position.set(rcx, CEIL - 0.5, lz); root.add(l);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, 0.4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcfe6ff, emissiveIntensity: 1.1 }));
    panel.position.set(rcx, CEIL - 0.03, lz); add(panel);
  }

  // ---- the corridor from the atrium, flat, office-finished
  {
    const cw = DOOR_Z1 - DOOR_Z0, cz = (DOOR_Z0 + DOOR_Z1) / 2, clen = OFFICE_WEST - RX1;
    const cx = (OFFICE_WEST + RX1) / 2;
    plane(clen + 0.1, cw, carpetMat, cx, 0.01, cz, -Math.PI / 2, 0);
    plane(clen, cw, ceilMat, cx, DOOR_H, cz, Math.PI / 2, 0);
    wall(cx, DOOR_Z0, clen, DOOR_H, 0, 0, corridorWallMat);
    wall(cx, DOOR_Z1, clen, DOOR_H, 0, Math.PI, corridorWallMat);
    // A handrail down one side: the corridor itself is a line.
    const hz = DOOR_Z1 - 0.35, y = 0.85;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, clen - 1.0, 8), steelMat);
    bar.rotation.z = Math.PI / 2; bar.position.set(cx, y, hz); add(bar);
    rails.push({ start: new THREE.Vector3(OFFICE_WEST - 0.5, y + 0.02, hz), end: new THREE.Vector3(RX1 + 0.5, y + 0.02, hz) });
    const cl = new THREE.PointLight(0xfff1dc, 0.7, 12, 2);
    cl.position.set(cx, DOOR_H - 0.4, cz); root.add(cl);
    // "SERVER ROOM" sign over the atrium-side door.
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#1d2530'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#7fd0ff'; g.font = 'bold 110px Arial'; g.textAlign = 'center'; g.fillText('← SERVER ROOM', 512, 140);
    g.fillStyle = '#c7d3df'; g.font = '44px Arial'; g.fillText('Authorised staff only  •  No food or drink', 512, 215);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.3 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), signMat);
    sign.position.set(OFFICE_WEST + 0.05, DOOR_H + 0.55, cz); sign.rotation.y = Math.PI / 2; root.add(sign);
  }

  root.updateMatrixWorld(true);
  const merged = mergePropsByMaterial(meshes);
  merged.name = 'serverWingMerged';
  root.add(merged);
  return { root, colliders, rails, door: { z0: DOOR_Z0, z1: DOOR_Z1, height: DOOR_H }, minX: RX0 };
}
