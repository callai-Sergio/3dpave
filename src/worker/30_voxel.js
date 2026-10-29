/* ---------- distância chamfer 3-4-5 (resultado ×3 em unidades de voxel) ---------- */
function chamfer(D,nx,ny,nz){
  const sxy=nx*ny,off=[],w=[];
  for(let dz=-1;dz<=0;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(dz===0&&(dy>0||(dy===0&&dx>=0)))continue;
    off.push([dx,dy,dz]);w.push([0,3,4,5][Math.abs(dx)+Math.abs(dy)+Math.abs(dz)]);
  }
  for(let pass=0;pass<2;pass++){
    const sg=pass===0?1:-1;
    for(let zi=0;zi<nz;zi++){const z=pass===0?zi:nz-1-zi;
      for(let yi=0;yi<ny;yi++){const y=pass===0?yi:ny-1-yi;
        for(let xi=0;xi<nx;xi++){const x=pass===0?xi:nx-1-xi;
          const id=z*sxy+y*nx+x;let v=D[id];if(v===0)continue;
          for(let k=0;k<off.length;k++){
            const X=x+sg*off[k][0],Y=y+sg*off[k][1],Z=z+sg*off[k][2];
            if(X<0||Y<0||Z<0||X>=nx||Y>=ny||Z>=nz)continue;
            const c=D[Z*sxy+Y*nx+X]+w[k];if(c<v)v=c;
          }
          D[id]=v;
        }}}
  }
}

/* ---------- superfície (surface nets) de uma máscara, subamostrada ---------- */
function surfaceMesh(phase,nx,ny,nz,h,R,codes,step){
  const bx=Math.ceil(nx/step),by=Math.ceil(ny/step),bz=Math.ceil(nz/step);
  const X=bx+2,Y=by+2,Z=bz+2,f=new Float32Array(X*Y*Z),g=new Float32Array(X*Y*Z);
  const isC=new Uint8Array(256);codes.forEach(c=>isC[c]=1);
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){const row=(z*ny+y)*nx;for(let x=0;x<nx;x++)if(isC[phase[row+x]])f[((Math.floor(z/step)+1)*Y+Math.floor(y/step)+1)*X+Math.floor(x/step)+1]+=1;}
  const inv=1/(step*step*step);for(let i=0;i<f.length;i++)f[i]*=inv;
  const blur=(src,dst,sx)=>{for(let z=1;z<Z-1;z++)for(let y=1;y<Y-1;y++)for(let x=1;x<X-1;x++){const i=(z*Y+y)*X+x;dst[i]=0.5*src[i]+0.25*(src[i-sx]+src[i+sx]);}};
  blur(f,g,1);blur(g,f,X);blur(f,g,X*Y);
  const fld=g,iso=0.5;
  const cell=new Int32Array(X*Y*Z).fill(-1),P=[];
  const corners=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const val=new Float32Array(8);
  for(let z=0;z<Z-1;z++)for(let y=0;y<Y-1;y++)for(let x=0;x<X-1;x++){
    let mask=0;
    for(let c=0;c<8;c++){const v=fld[((z+corners[c][2])*Y+y+corners[c][1])*X+x+corners[c][0]];val[c]=v;if(v>iso)mask|=1<<c;}
    if(mask===0||mask===255)continue;
    let sx=0,sy=0,sz=0,ne=0;
    for(const [a,b] of edges){const ia=(mask>>a)&1,ib=(mask>>b)&1;if(ia===ib)continue;const t=(iso-val[a])/(val[b]-val[a]);
      sx+=corners[a][0]+t*(corners[b][0]-corners[a][0]);sy+=corners[a][1]+t*(corners[b][1]-corners[a][1]);sz+=corners[a][2]+t*(corners[b][2]-corners[a][2]);ne++;}
    cell[(z*Y+y)*X+x]=P.length/3;
    P.push(((x+sx/ne-1)*step+step/2)*h-R,((y+sy/ne-1)*step+step/2)*h-R,((z+sz/ne-1)*step+step/2)*h);
  }
  const I=[];
  const quad=(c0,c1,c2,c3,flip)=>{if(c0<0||c1<0||c2<0||c3<0)return;if(flip)I.push(c0,c2,c1,c0,c3,c2);else I.push(c0,c1,c2,c0,c2,c3);};
  const C=(x,y,z)=>(x<0||y<0||z<0||x>=X-1||y>=Y-1||z>=Z-1)?-1:cell[(z*Y+y)*X+x];
  for(let z=1;z<Z-1;z++)for(let y=1;y<Y-1;y++)for(let x=1;x<X-1;x++){
    const v0=fld[(z*Y+y)*X+x]>iso;
    {const v1=fld[(z*Y+y)*X+x+1]>iso;if(v0!==v1)quad(C(x,y-1,z-1),C(x,y,z-1),C(x,y,z),C(x,y-1,z),v1);}
    {const v1=fld[(z*Y+y+1)*X+x]>iso;if(v0!==v1)quad(C(x-1,y,z-1),C(x-1,y,z),C(x,y,z),C(x,y,z-1),v1);}
    {const v1=fld[((z+1)*Y+y)*X+x]>iso;if(v0!==v1)quad(C(x-1,y-1,z),C(x,y-1,z),C(x,y,z),C(x-1,y,z),v1);}
  }
  return {pos:new Float32Array(P),idx:new Uint32Array(I)};
}

/* ---------- ruído de valor 3D ---------- */
function valueNoise(seed){
  const hash=(x,y,z)=>{let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^seed;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295*2-1;};
  const sm=t=>t*t*(3-2*t);
  return (x,y,z)=>{const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),fx=sm(x-xi),fy=sm(y-yi),fz=sm(z-zi);
    const l=(a,b,t)=>a+(b-a)*t;
    return l(l(l(hash(xi,yi,zi),hash(xi+1,yi,zi),fx),l(hash(xi,yi+1,zi),hash(xi+1,yi+1,zi),fx),fy),
             l(l(hash(xi,yi,zi+1),hash(xi+1,yi,zi+1),fx),l(hash(xi,yi+1,zi+1),hash(xi+1,yi+1,zi+1),fx),fy),fz);};
}

