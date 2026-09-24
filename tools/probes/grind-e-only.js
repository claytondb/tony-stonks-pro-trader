// For every rail: approach parallel at 8 m/s, 0.9 m to the side, press and hold ONLY E
// (no Space). Does the player end up grinding? This is the "I don't know how to grind" test.
const {g,step,down,up,releaseAll,clearPlayerState,place}=ctx;
const rails=g.grindSystem.getRails(); const res=[];
for (const r of rails) {
  if (r.length < 3) continue;
  const d=r.direction.clone(); d.y=0; d.normalize();
  const side={x:-d.z,z:d.x};
  const mid=r.start.clone().lerp(r.end,0.3);
  const x=mid.x - d.x*2.5 + side.x*0.9, z=mid.z - d.z*2.5 + side.z*0.9;
  const THREE_V=mid.constructor; const fh=g.physics.raycastGround(new THREE_V(x, r.height-0.3, z), 6);
  const floorY = fh ? fh.point.y : 0;
  g.grindSystem.grindCooldown=0; clearPlayerState(); place(x, floorY+0.75, z, Math.atan2(d.x,d.z)); step(20); g.grindSystem.grindCooldown=0;
  g.physics.setVelocity(g.chairBody,{x:d.x*8,y:0,z:d.z*8}); g.carriedSpeed=8;
  down('KeyW'); step(4); down('KeyE');
  let got=-1, trace=[]; for(let i=0;i<70;i++){ step(); const P=g.chairBody.translation(); const V=g.chairBody.linvel(); if(i%8==0){const pr=g.grindSystem.probeRail(new THREE_V(P.x,P.y,P.z), new THREE_V(V.x,V.y,V.z)); trace.push([i,+P.y.toFixed(2),+Math.hypot(V.x,V.z).toFixed(1),g.playerState.isGrounded?'G':'A', pr?[pr.rail.id,+pr.horizontalDist.toFixed(2),+pr.heightDiff.toFixed(2),pr.capturable]:null]);} if(g.grindSystem.isGrinding()){got=i;break;} }
  releaseAll(); step(2);
  res.push({id:r.id, h:+r.height.toFixed(2), floorY:+floorY.toFixed(2), got, trace: got<0?trace:undefined});
}
return {n:res.length, ok:res.filter(r=>r.got>=0).length, fails:res.filter(r=>r.got<0)};
