const {g,step,down,up,releaseAll,pos,vel,grounded,round,wrap,bodyYaw,clearPlayerState,place}=ctx;
const out=[];
for (const hold of [[],['KeyE']]) {
  clearPlayerState(); place(0,1,-9,0); step(30);
  down('KeyW'); step(90); up('KeyW');
  for (const k of hold) down(k);
  down('Space'); step(3); up('Space');
  const y0=bodyYaw(); const trace=[];
  for (let i=0;i<60;i++){ step(); if(i%6==0) trace.push([grounded()?'G':'A', round(wrap(bodyYaw()-y0)*57.3,1), round(g.turnCommand,2)]); }
  releaseAll(); out.push({hold, trace});
}
return out;
