const fs = require('fs');
const paths=[];
for(const [cx,cy,rx,ry,phase,count] of [[1110,40,440,285,.4,19],[-110,610,370,230,1.6,16],[1130,1070,590,300,2.8,20]]) {
 for(let i=0;i<count;i++){
  const scale=.48+i*.037;
  const pts=Array.from({length:100},(_,j)=>{
   const t=j*Math.PI*2/100;
   const r=1+.20*Math.sin(3*t+phase)+.085*Math.cos(5*t-phase)+.045*Math.sin(7*t+phase);
   return [cx+rx*scale*r*Math.cos(t)+35*scale*Math.sin(2*t),cy+ry*scale*r*Math.sin(t)];
  });
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  let start=mid(pts[99],pts[0]);
  let d=`M${start.map(v=>v.toFixed(1)).join(' ')}`;
  for(let j=0;j<100;j++){const m=mid(pts[j],pts[(j+1)%100]);d+=`Q${pts[j].map(v=>v.toFixed(1)).join(' ')} ${m.map(v=>v.toFixed(1)).join(' ')}`;}
  paths.push(`<path d="${d}Z"/>`);
 }
}
const crosses=[[46,29],[46,135],[460,98],[1120,104],[870,280],[110,420],[78,740],[1080,640],[1140,510]];
const marks=crosses.map(([x,y])=>`<path d="M${x-5} ${y}h10 M${x} ${y-5}v10"/>`).join('');
fs.writeFileSync('apps/web/public/brand/login-survey-contours.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1000" fill="none"><g stroke="#9b8969" stroke-opacity=".085" stroke-width=".65">${paths.join('')}</g><g stroke="#ab9167" stroke-opacity=".38" stroke-width=".75">${marks}</g><g stroke="#a39174" stroke-opacity=".11" stroke-width=".65" stroke-dasharray="3 4"><path d="M45 135H180 M460 98C530 85 540 30 620 25 M110 420V510 M1080 640h70 M46 29v106"/></g></svg>`);
