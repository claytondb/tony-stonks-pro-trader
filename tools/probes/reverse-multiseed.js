const {g,step,down,up,releaseAll,grounded,vel,bodyYaw,clearPlayerState,ZERO,wrap}=ctx;
const agg={moving:0,back:0,byState:{},streaks:[]};
for (const seed0 of [11,22,33,44,55,66,77,88]) {
  for (const airSteer of [true,false]) {
  clearPlayerState(); g.loadLevel('ch1_office');
  g.physics.setVelocity(g.chairBody, ZERO); g.physics.setAngularVelocity(g.chairBody, ZERO); step(60);
  let seed=seed0; const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  let turnKey=null, turnLeft=0, streak=0, buf=[]; down('KeyW');
  for (let i=0;i<1800;i++){
    if (turnLeft<=0){ if(turnKey){up(turnKey);turnKey=null;} const r=rnd(); if(r<0.4)turnKey='KeyA'; else if(r<0.8)turnKey='KeyD'; turnLeft=20+Math.floor(rnd()*60); if(airSteer&&turnKey) down(turnKey);}
    turnLeft--;
    if (turnKey && !airSteer){ if(grounded()) down(turnKey); else up(turnKey); }
    if(i%90===0)down('Space'); else if(i%90===3)up('Space');
    if(i%150===0)down('KeyE'); else if(i%150===60)up('KeyE');
    step();
    const v=vel(); const sp=Math.hypot(v.x,v.z); const y=bodyYaw();
    const st=g.grindSystem?.isGrinding?.()?'grind':(grounded()?'ground':'air');
    const b=agg.byState[st]=agg.byState[st]||{m:0,b:0};
    if (sp>=0.5){ agg.moving++; b.m++; if (v.x*Math.sin(y)+v.z*Math.cos(y)<0){agg.back++; b.b++; streak++; const P=g.chairBody.translation(); buf.push([st,+sp.toFixed(1),+(y*57.3).toFixed(0),+(Math.atan2(v.x,v.z)*57.3).toFixed(0),[+P.x.toFixed(1),+P.y.toFixed(1),+P.z.toFixed(1)],+v.y.toFixed(1),g.surfaceAngle|0,+g.turnCommand.toFixed(1)]);} else { if(streak>15) (agg.ex=agg.ex||[]).push({seed0,airSteer,n:streak,f:buf.filter((_,k)=>k%8==0)}); if(streak) agg.streaks.push(streak); streak=0; buf=[]; } } else { if(streak>15) (agg.ex=agg.ex||[]).push({seed0,airSteer,n:streak,f:buf.filter((_,k)=>k%8==0)}); if(streak) agg.streaks.push(streak); streak=0; buf=[]; }
  }
  releaseAll(); step(1);
  }
}
const s=agg.streaks.sort((a,b)=>b-a);
return {pct:+(100*agg.back/agg.moving).toFixed(2), byState:Object.fromEntries(Object.entries(agg.byState).map(([k,v])=>[k,+(100*v.b/v.m).toFixed(2)])), top:s.slice(0,8), over15:s.filter(x=>x>15).length, over5:s.filter(x=>x>5).length, ex:agg.ex};
