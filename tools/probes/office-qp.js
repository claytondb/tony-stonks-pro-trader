// Ride at every quarter pipe in the office from the ROOM side (local -Z is the flat
// approach; the curve rises toward local +Z) at cruise, holding W, and report what happens.
const {g,step,down,releaseAll,clearPlayerState,place}=ctx;
const cols=(g.officeInterior?.colliders||[]).filter(c=>c.trimesh);
const out=[];
for (const c of cols) {
  const yaw=c.rotationY;
  const fx=Math.sin(yaw), fz=Math.cos(yaw);      // world direction of local +Z (up the ramp)
  const sx=c.position.x-fx*5.5, sz=c.position.z-fz*5.5;
  clearPlayerState(); place(sx,0.75,sz,Math.atan2(fx,fz)); step(10);
  g.physics.setVelocity(g.chairBody,{x:fx*13,y:0,z:fz*13}); g.carriedSpeed=13;
  down('KeyW');
  let maxY=0, cur=0, maxAir=0, maxAng=0, samples=[];
  for (let i=0;i<180;i++){ step(); const p=g.chairBody.translation(), v=g.chairBody.linvel();
    maxY=Math.max(maxY,p.y); maxAng=Math.max(maxAng,g.surfaceAngle||0);
    if(!g.playerState.isGrounded){cur++; maxAir=Math.max(maxAir,cur);} else cur=0;
    if(i%10==0) samples.push([i,+p.y.toFixed(2),+Math.hypot(v.x,v.z).toFixed(1),+v.y.toFixed(1),g.playerState.isGrounded?'G':'A',Math.round(g.surfaceAngle)]); }
  releaseAll();
  const v=g.chairBody.linvel();
  out.push({at:[+c.position.x.toFixed(1),+c.position.z.toFixed(1)], maxY:+maxY.toFixed(2), maxAng:Math.round(maxAng), maxAirS:+(maxAir/60).toFixed(2), endSpeed:+Math.hypot(v.x,v.z).toFixed(1), samples});
}
return out;
