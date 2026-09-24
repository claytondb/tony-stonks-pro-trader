// SWERVE PLAY — the levelsim agent, driven through the REAL game. Holds W, swerves the stick in
// random segments, steers away from walls it can see (rays at chair height), drifts toward open
// floor, ollies low obstacles it is about to hit (65% of the time, like the sim), and holds E
// whenever the grind prompt would be up. Counts what happens.
//
// node tools/probe.mjs --snippet tools/probes/swerve-play.js
const { g, step, down, up, releaseAll, clearPlayerState, place } = ctx;
window.__PLUS_KEY = 'KeyA'; window.__MINUS_KEY = 'KeyD';   // D turns toward -yaw (Game: rate = -turn * max)
const AGENTS = window.__AGENTS ?? 10, SECONDS = window.__SECONDS ?? 40, DT = 1 / 60;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const V = g.chairBody.translation().constructor;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const yawOf = () => { const q = g.chairBody.rotation(); return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z)); };
const cast = (h, y, max) => {
  const p = g.chairBody.translation();
  const d = g.physics.castRay({ x: p.x, y: p.y - 0.7 + y, z: p.z }, { x: Math.sin(h), y: 0, z: Math.cos(h) }, max, g.chairBody);
  return d === null ? max : d;
};
const tot = { air: 0, qpAir: 0, grind: 0, manual: 0, hardHit: 0, stuck: 0, seconds: 0, comboTime: 0, dist: 0, heat: [], hits: [], bails: 0 };
for (let a = 0; a < AGENTS; a++) {
  // Spawn on open floor, random heading.
  let x = 0, z = 0;
  for (let k = 0; k < 60; k++) {
    x = (rnd() * 2 - 1) * 20; z = (rnd() * 2 - 1) * 20;
    const hit = g.physics.raycastGround(new V(x, 3.6, z), 4);
    if (hit && hit.point.y < 0.1 && [0, 1.57, 3.14, -1.57].every((h) => g.physics.castRay({ x, y: 0.9, z }, { x: Math.sin(h), y: 0, z: Math.cos(h) }, 1.5) === null)) break;
  }
  clearPlayerState(); place(x, 0.75, z, rnd() * 6.28 - 3.14); step(10);
  down('KeyW');
  let turnKey = null, segLeft = 0, target = 0, wasAir = false, airT = 0, takeoffTrans = false;
  let prevSurf = 0, wasBail = false, wasGrind = false, wasManual = false, lastTrick = -99, prevSpeed = 0, slowT = 0, inHit = false;
  for (let i = 0; i < SECONDS * 60; i++) {
    const t = i * DT;
    const p = g.chairBody.translation(), v = g.chairBody.linvel();
    const speed = Math.hypot(v.x, v.z), h = yawOf();
    // --- steering: swerve, roam toward open floor, avoid walls
    segLeft -= DT;
    if (segLeft <= 0) { target = rnd() < 0.3 ? 0 : rnd() * 2 - 1; segLeft = 0.5 + rnd() * 1.6; }
    let want = target;
    if (i % 6 === 0 && rnd() < 0.5) {
      let bh = 0, bd = -1;
      for (const off of [-1, -0.5, 0, 0.5, 1]) { const d = cast(h + off, 0.9, 30); if (d > bd + 0.5) { bd = d; bh = off; } }
      want = want * 0.6 + Math.max(-1, Math.min(1, bh * 1.5)) * 0.4;
    }
    const look = speed * 0.9 + 2;
    if (cast(h, 0.9, look) < look) want = cast(h + 0.6, 0.9, look) > cast(h - 0.6, 0.9, look) ? 1 : -1;
    // +yaw is toward +x; in this game D (turnRight) turns the chair toward... measured below.
    // On a rail A/D are the balance, and a player lets the rail carry them: hands off.
    const key = g.grindSystem.isGrinding() ? null : want > 0.33 ? window.__PLUS_KEY : want < -0.33 ? window.__MINUS_KEY : null;
    if (key !== turnKey) { if (turnKey) up(turnKey); if (key) down(key); turnKey = key; }
    // --- ollie over low stuff about to be hit
    if (g.playerState.isGrounded && speed > 3) {
      const low = cast(h, 0.25, speed * 0.35), high = cast(h, 1.6, speed * 0.35);
      if (low < speed * 0.35 && high >= speed * 0.35 && rnd() < 0.65 / 6) { down('Space'); }
      else up('Space');
    } else up('Space');
    // --- the grind prompt: hold E while it would be showing
    const pr = g.grindSystem.probeRail(new V(p.x, p.y, p.z), new V(v.x, v.y, v.z));
    if (pr && pr.horizontalDist < 1.7) down('KeyE'); else if (!g.grindSystem.isGrinding()) up('KeyE');
    step();
    // --- measure
    const air = !g.playerState.isGrounded && !g.grindSystem.isGrinding();
    if (air && !wasAir) { airT = 0; takeoffTrans = prevSurf > 30; }
    if (air) airT += DT;
    if (!air && wasAir && airT > 0.35) { tot.air++; if (takeoffTrans) tot.qpAir++; lastTrick = t; }
    const grinding = g.grindSystem.isGrinding();
    if (grinding && !wasGrind) { tot.grind++; lastTrick = t; }
    const manual = !!g.balance?.isManualing;
    if (manual && !wasManual) { tot.manual++; lastTrick = t; }
    const sp2 = Math.hypot(g.chairBody.linvel().x, g.chairBody.linvel().z);
    const hit = g.playerState.isGrounded && !grinding && prevSpeed - sp2 > 2.5;
    if (hit && !inHit) { tot.hardHit++; tot.hits.push([+p.x.toFixed(1), +p.z.toFixed(1), +prevSpeed.toFixed(1), +sp2.toFixed(1), +(h * 57.3).toFixed(0)]); }
    inHit = hit;
    slowT = sp2 < 1 ? slowT + DT : 0;
    if (slowT > 1.5) { tot.stuck++; slowT = 0; }
    if (t - lastTrick < 2.6) tot.comboTime += DT;
    tot.dist += sp2 * DT;
    if (i % 30 === 0) tot.heat.push([+p.x.toFixed(1), +p.z.toFixed(1)]);
    const bailing = (g.bailRecovery ?? 0) > 0;
    if (bailing && !wasBail) tot.bails++;
    wasBail = bailing;
    prevSurf = g.playerState.isGrounded ? (g.surfaceAngle ?? 0) : prevSurf;
    prevSpeed = sp2; wasAir = air; wasGrind = grinding; wasManual = manual;
  }
  releaseAll(); step(2);
  tot.seconds += SECONDS;
}
const pm = (k) => +(tot[k] / (tot.seconds / 60)).toFixed(2);
return { perMin: { air: pm('air'), qpAir: pm('qpAir'), grind: pm('grind'), manual: pm('manual'), tricks: +((tot.air + tot.grind + tot.manual) / (tot.seconds / 60)).toFixed(2), hardHit: pm('hardHit'), stuck: pm('stuck'), bails: pm('bails') },
  comboShare: +(tot.comboTime / tot.seconds).toFixed(3), meanSpeed: +(tot.dist / tot.seconds).toFixed(2), heat: tot.heat, hits: tot.hits };
