// Ride straight up every kicker in the office layout at 13 m/s: does it launch?
const {g,step,down,releaseAll,clearPlayerState,place}=ctx;
const THREEV=g.chairBody.translation().constructor;
const out=[];
// Kickers are the office colliders built from the 'wedge' prop collider: trimesh, not QPs.
for (const c of (g.officeInterior?.colliders||[]).filter(c=>c.trimesh && c.halfExtents.y < 0.6)) {
  const yaw=c.rotationY, fx=Math.sin(yaw), fz=Math.cos(yaw);
  clearPlayerState(); place(c.position.x-fx*7, 0.75, c.position.z-fz*7, yaw); step(8);
  g.physics.setVelocity(g.chairBody,{x:fx*13,y:0,z:fz*13}); g.carriedSpeed=13; down('KeyW');
  let maxY=0, air=0, cur=0;
  for(let i=0;i<120;i++){ step(); const p=g.chairBody.translation(); maxY=Math.max(maxY,p.y); if(!g.playerState.isGrounded){cur++;air=Math.max(air,cur);} else cur=0; }
  releaseAll(); const v=g.chairBody.linvel();
  out.push({at:[+c.position.x.toFixed(1),+c.position.z.toFixed(1)], maxY:+maxY.toFixed(2), airS:+(air/60).toFixed(2), endSpeed:+Math.hypot(v.x,v.z).toFixed(1)});
}
return out;
