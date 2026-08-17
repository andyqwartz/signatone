import fs from 'fs';
const { w, h } = { w: 128, h: 128 };
const data = new Uint8ClampedArray(fs.readFileSync('/tmp/photo_test.rgba'));

function luma(i){return 0.299*data[i*4]+0.587*data[i*4+1]+0.114*data[i*4+2];}
// Gaussian blur 3x3
const blurred = new Float32Array(w*h);
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  let s=0; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const k=[1,2,1][dx+1]*[1,2,1][dy+1];
    s+=luma((y+dy)*w+(x+dx))*k;
  }
  blurred[y*w+x]=s/16;
}
// Sobel -> magnitude
const g=new Float32Array(w*h); let maxg=0;
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const p=(yy,xx)=>blurred[yy*w+xx];
  const gx=-p(y-1,x-1)-2*p(y,x-1)-p(y+1,x-1)+p(y-1,x+1)+2*p(y,x+1)+p(y+1,x+1);
  const gy=-p(y-1,x-1)-2*p(y-1,x)-p(y-1,x+1)+p(y+1,x-1)+2*p(y+1,x)+p(y+1,x+1);
  const m=Math.sqrt(gx*gx+gy*gy); g[y*w+x]=m; if(m>maxg)maxg=m;
}
// high threshold -> strong edge points
const T = 0.15*maxg;
const pts=[];
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++) if(g[y*w+x]>=T) pts.push({x,y:y,x0:x,y0:y});
console.log('edge points:', pts.length);

// Greedy nearest-neighbour ordering (proven repo approach), centre the points
const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
const cy = pts.reduce((s,p)=>s+p.y,0)/pts.length;
const ordered=[];
const used=new Array(pts.length).fill(false);
let cur=0; used[0]=true; ordered.push(pts[0]);
for(let n=1;n<pts.length;n++){
  let bi=-1,bd=Infinity;
  for(let i=0;i<pts.length;i++){ if(used[i])continue; const dx=pts[i].x-pts[cur].x, dy=pts[i].y-pts[cur].y; const d=dx*dx+dy*dy; if(d<bd){bd=d;bi=i;} }
  if(bd>64) console.log('jump at',n,'dist',Math.sqrt(bd));
  cur=bi; used[bi]=true; ordered.push(pts[bi]);
}
console.log('ordered pts:', ordered.length, 'jumps>8px:',
  ordered.slice(1).reduce((n,p,i)=>n+(Math.hypot(p.x-ordered[i].x,p.y-ordered[i].y)>8?1:0),0));
