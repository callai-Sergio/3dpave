/* ---------- casca convexa (força bruta; 36 pontos) ---------- */
function hull3(P){
  const n=P.length/3,F=[];
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)for(let k=j+1;k<n;k++){
    const ax=P[3*j]-P[3*i],ay=P[3*j+1]-P[3*i+1],az=P[3*j+2]-P[3*i+2];
    const bx=P[3*k]-P[3*i],by=P[3*k+1]-P[3*i+1],bz=P[3*k+2]-P[3*i+2];
    let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
    const L=Math.hypot(nx,ny,nz); if(L<1e-10)continue; nx/=L;ny/=L;nz/=L;
    const d=-(nx*P[3*i]+ny*P[3*i+1]+nz*P[3*i+2]);
    let pos=false,neg=false;
    for(let m=0;m<n;m++){
      if(m===i||m===j||m===k)continue;
      const s=nx*P[3*m]+ny*P[3*m+1]+nz*P[3*m+2]+d;
      if(s>1e-9)pos=true;else if(s<-1e-9)neg=true;
      if(pos&&neg)break;
    }
    if(pos&&neg)continue;
    if(pos)F.push(i,k,j);else F.push(i,j,k);
  }
  return F;
}
function planesOf(V,F){
  const nf=F.length/3,PL=new Float64Array(4*nf);
  for(let f=0;f<nf;f++){
    const a=F[3*f],b=F[3*f+1],c=F[3*f+2];
    const ax=V[3*b]-V[3*a],ay=V[3*b+1]-V[3*a+1],az=V[3*b+2]-V[3*a+2];
    const bx=V[3*c]-V[3*a],by=V[3*c+1]-V[3*a+1],bz=V[3*c+2]-V[3*a+2];
    let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;const L=Math.hypot(nx,ny,nz)||1;nx/=L;ny/=L;nz/=L;
    PL[4*f]=nx;PL[4*f+1]=ny;PL[4*f+2]=nz;PL[4*f+3]=-(nx*V[3*a]+ny*V[3*a+1]+nz*V[3*a+2]);
  }
  return PL;
}
function jacobi3(A){
  const a=A.slice(),V=[1,0,0,0,1,0,0,0,1],pairs=[[0,1],[0,2],[1,2]];
  for(let sweep=0;sweep<60;sweep++){
    if(a[1]*a[1]+a[2]*a[2]+a[5]*a[5]<1e-24*(a[0]*a[0]+a[4]*a[4]+a[8]*a[8]))break;
    for(const [p,q] of pairs){
      const apq=a[3*p+q]; if(Math.abs(apq)<1e-300)continue;
      const theta=(a[3*q+q]-a[3*p+p])/(2*apq);
      const t=(theta>=0?1:-1)/(Math.abs(theta)+Math.sqrt(theta*theta+1));
      const c=1/Math.sqrt(t*t+1),s=t*c;
      for(let k=0;k<3;k++){const kp=a[3*k+p],kq=a[3*k+q];a[3*k+p]=c*kp-s*kq;a[3*k+q]=s*kp+c*kq;}
      for(let k=0;k<3;k++){const pk=a[3*p+k],qk=a[3*q+k];a[3*p+k]=c*pk-s*qk;a[3*q+k]=s*pk+c*qk;}
      for(let k=0;k<3;k++){const kp=V[3*k+p],kq=V[3*k+q];V[3*k+p]=c*kp-s*kq;V[3*k+q]=s*kp+c*kq;}
    }
  }
  return {w:[a[0],a[4],a[8]],V};
}

/* ---------- uma forma de agregado em escala unitária (Min Feret = 1), [W] §3.1 ---------- */
function makeShape(rng,par,ang){
  const AR=clamp(weibQ(par.arL,par.arK,rng.unif(0.03,0.97)),0.3,0.99);
  const h=clamp(par.h*(1+0.08*rng.normal()),0.42,0.98);
  const dims=[1/AR,1,h];
  const ar=[dims[1]*dims[2],dims[1]*dims[2],dims[0]*dims[2],dims[0]*dims[2],dims[0]*dims[1],dims[0]*dims[1]];
  const tot=ar.reduce((s,x)=>s+x,0),N=36,P=new Float64Array(3*N);
  for(let m=0;m<N;m++){
    let u=rng()*tot,face=0; while(face<5&&u>ar[face]){u-=ar[face];face++;}
    for(let a=0;a<3;a++)P[3*m+a]=(rng()-0.5)*dims[a];
    const ax=face>>1,sg=(face&1)?1:-1;
    P[3*m+ax]=sg*dims[ax]/2*(1-rng()*ang);
  }
  const F=hull3(P);
  const used=new Map(),Vl=[];
  const F2=F.map(i=>{if(!used.has(i)){used.set(i,Vl.length/3);Vl.push(P[3*i],P[3*i+1],P[3*i+2]);}return used.get(i);});
  const nv=Vl.length/3,V=new Float64Array(Vl);
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9],mean=[0,0,0];
  for(let i=0;i<nv;i++)for(let a=0;a<3;a++){const x=V[3*i+a];mean[a]+=x/nv;if(x<mn[a])mn[a]=x;if(x>mx[a])mx[a]=x;}
  for(let i=0;i<nv;i++)for(let a=0;a<3;a++)V[3*i+a]=(V[3*i+a]-mean[a])*dims[a]/(mx[a]-mn[a]);
  return finishShape(V,F2,{AR,h},rng);
}

// a partir da casca (vértices e faces): planos, volume, centroide, eixos principais de inércia, esferas e pontos de prova
function finishShape(V,F2,meta,rng){
  const nv=V.length/3;
  let PL=planesOf(V,F2);
  let vol=0;
  for(let f=0;f<F2.length/3;f++){
    const a=F2[3*f],b=F2[3*f+1],c=F2[3*f+2];
    vol+=(V[3*a]*(V[3*b+1]*V[3*c+2]-V[3*b+2]*V[3*c+1])-V[3*a+1]*(V[3*b]*V[3*c+2]-V[3*b+2]*V[3*c])+V[3*a+2]*(V[3*b]*V[3*c+1]-V[3*b+1]*V[3*c]))/6;
  }
  const G=17,bmn=[1e9,1e9,1e9],bmx=[-1e9,-1e9,-1e9];
  for(let i=0;i<nv;i++)for(let a=0;a<3;a++){const x=V[3*i+a];if(x<bmn[a])bmn[a]=x;if(x>bmx[a])bmx[a]=x;}
  const gi=[],np=PL.length/4;
  for(let ix=0;ix<G;ix++)for(let iy=0;iy<G;iy++)for(let iz=0;iz<G;iz++){
    const x=bmn[0]+(bmx[0]-bmn[0])*(ix+0.5)/G,y=bmn[1]+(bmx[1]-bmn[1])*(iy+0.5)/G,z=bmn[2]+(bmx[2]-bmn[2])*(iz+0.5)/G;
    let ok=true; for(let p=0;p<np;p++){if(PL[4*p]*x+PL[4*p+1]*y+PL[4*p+2]*z+PL[4*p+3]>0){ok=false;break;}}
    if(ok)gi.push(x,y,z);
  }
  const ng=gi.length/3,c=[0,0,0];
  for(let i=0;i<ng;i++)for(let a=0;a<3;a++)c[a]+=gi[3*i+a]/ng;
  const S=[0,0,0,0,0,0,0,0,0];let tr=0;
  for(let i=0;i<ng;i++){const r=[gi[3*i]-c[0],gi[3*i+1]-c[1],gi[3*i+2]-c[2]];tr+=r[0]*r[0]+r[1]*r[1]+r[2]*r[2];for(let a=0;a<3;a++)for(let b=0;b<3;b++)S[3*a+b]+=r[a]*r[b];}
  const I=[0,0,0,0,0,0,0,0,0];for(let a=0;a<3;a++)for(let b=0;b<3;b++)I[3*a+b]=((a===b?tr:0)-S[3*a+b])/ng*vol;
  const J=jacobi3(I),Q=J.V;
  const det=Q[0]*(Q[4]*Q[8]-Q[5]*Q[7])-Q[1]*(Q[3]*Q[8]-Q[5]*Q[6])+Q[2]*(Q[3]*Q[7]-Q[4]*Q[6]);
  if(det<0){Q[2]=-Q[2];Q[5]=-Q[5];Q[8]=-Q[8];}
  const toP=(arr,n)=>{const o=new Float64Array(3*n);for(let i=0;i<n;i++){const r=[arr[3*i]-c[0],arr[3*i+1]-c[1],arr[3*i+2]-c[2]];for(let j=0;j<3;j++)o[3*i+j]=r[0]*Q[j]+r[1]*Q[3+j]+r[2]*Q[6+j];}return o;};
  const Vp=toP(V,nv),Gp=toP(gi,ng);
  PL=planesOf(Vp,F2);
  const di=new Float64Array(ng);
  for(let i=0;i<ng;i++){let m=1e9;for(let p=0;p<np;p++){const s=-(PL[4*p]*Gp[3*i]+PL[4*p+1]*Gp[3*i+1]+PL[4*p+2]*Gp[3*i+2]+PL[4*p+3]);if(s<m)m=s;}di[i]=m;}
  const nc=Math.min(160,ng),cand=new Int32Array(nc);
  for(let j=0;j<nc;j++)cand[j]=rng.int(ng);
  const cov=new Uint8Array(nc*ng);
  for(let j=0;j<nc;j++){const cj=cand[j],r=di[cj]*1.10,r2=r*r;
    for(let i=0;i<ng;i++){const dx=Gp[3*i]-Gp[3*cj],dy=Gp[3*i+1]-Gp[3*cj+1],dz=Gp[3*i+2]-Gp[3*cj+2];if(dx*dx+dy*dy+dz*dz<r2)cov[j*ng+i]=1;}}
  const covered=new Uint8Array(ng),sp=[];let ncov=0;
  for(let it=0;it<10;it++){
    let best=-1,bg=0;
    for(let j=0;j<nc;j++){if(di[cand[j]]*1.10<=0.07)continue;let g=0;const o=j*ng;for(let i=0;i<ng;i++)if(cov[o+i]&&!covered[i])g++;if(g>bg){bg=g;best=j;}}
    if(best<0||bg<0.01*ng)break;
    const cj=cand[best];sp.push(Gp[3*cj],Gp[3*cj+1],Gp[3*cj+2],di[cj]*1.10);
    for(let i=0;i<ng;i++)if(cov[best*ng+i]&&!covered[i]){covered[i]=1;ncov++;}
    if(ncov/ng>0.96)break;
  }
  if(!sp.length){let zm=0;for(let i=0;i<nv;i++)zm=Math.max(zm,Math.abs(Vp[3*i+2]));sp.push(0,0,0,Math.max(0.1,Math.min(zm,0.5)));}
  return Object.assign({v:new Float32Array(Vp),f:new Uint16Array(F2),pl:PL,vol,I:J.w.map(Math.abs),sp:new Float64Array(sp)},meta,probesOf(Vp,F2));
}

// pontos de prova do contato: vértices da casca e meios das arestas longas (> 0,6 do Min Feret), mais a área da casca e o raio envolvente
function probesOf(V,F){
  const nv=V.length/3,P=Array.from(V),seen=new Set();let area=0,rmax=0;
  for(let f=0;f<F.length/3;f++){
    const a=F[3*f],b=F[3*f+1],c=F[3*f+2];
    const ux=V[3*b]-V[3*a],uy=V[3*b+1]-V[3*a+1],uz=V[3*b+2]-V[3*a+2],wx=V[3*c]-V[3*a],wy=V[3*c+1]-V[3*a+1],wz=V[3*c+2]-V[3*a+2];
    area+=Math.hypot(uy*wz-uz*wy,uz*wx-ux*wz,ux*wy-uy*wx)/2;
    for(const [i,j] of [[a,b],[b,c],[c,a]]){const k=i<j?i*nv+j:j*nv+i;if(seen.has(k))continue;seen.add(k);
      const L=Math.hypot(V[3*i]-V[3*j],V[3*i+1]-V[3*j+1],V[3*i+2]-V[3*j+2]);
      if(L>0.6)P.push((V[3*i]+V[3*j])/2,(V[3*i+1]+V[3*j+1])/2,(V[3*i+2]+V[3*j+2])/2);}
  }
  for(let i=0;i<nv;i++)rmax=Math.max(rmax,Math.hypot(V[3*i],V[3*i+1],V[3*i+2]));
  return {pr:new Float64Array(P),area,rmax};
}

/* ---------- partículas: Min Feret pela Weibull da classe ([W] §4.1, p entre 0,005 e 0,65) ---------- */
// cnt: número de formas de cada classe na biblioteca. Nas formas reais a Weibull do Min Feret foi ajustada à distribuição
// medida inteira, então o sorteio usa p entre 0,02 e 0,98 (em [W], 0,005–0,65, como no paper)
function sampleParts(cfg,lib,off,cnt){
  const real=!LIBS[cfg.lib],r=makeRng(cfg.seed+7),tpl=[],sc=[],fr=[],rel=[],cls=real?REAL_SHAPES[cfg.lib]:LIBS[cfg.lib],pmax=real?0.98:0.65,pmin=real?0.02:0.005;
  cfg.comp.fracoes.forEach(([lo,hi,pct],fi)=>{
    // A7: a fração não termina no primeiro candidato grande demais. Pedras que cabem no que falta entram; depois de 200
    // candidatos que não cabem, entra o que deixa a massa mais perto do alvo, se melhorar. Antes o déficit chegava a meia pedra
    // grande (4% da massa no CP de 250 g com Dmáx 19–25 mm), e essa massa virava mastique (K3)
    const alvo=cfg.comp.m_agg*pct/100,kc=classOf(cls,hi);let acc=0,n=0,guard=0,miss=0,best=null;
    const add=(ti,s,mg)=>{acc+=mg;n++;tpl.push(ti);sc.push(s);fr.push(fi);};
    while(true){
      const s=weibQ(cls[kc].mfL,cls[kc].mfK,r.unif(pmin,pmax));
      if(s<2){if(++guard>20000)break;continue;}
      const ti=off[kc]+r.int(cnt[kc]),mg=lib[ti].vol*s*s*s*cfg.rhoA/1000,rem=alvo-acc;
      if(mg<=rem){add(ti,s,mg);miss=0;best=null;continue;}
      if(!best||mg<best.mg)best={ti,s,mg};
      if(++miss>200){if(best.mg-rem<rem)add(best.ti,best.s,best.mg);break;}
    }
    rel.push({lo,hi,n,massa:acc,alvo,classe:cls[kc].nome});
  });
  return {tpl,sc,fr,rel};
}


// forma real da biblioteca (REAL_SHAPES): a casca medida, com Min Feret = 1, reduzida pelo fator linear vr^(1/3) para ter o
// volume real da pedra (a casca é ~20% maior que ela). As faces são orientadas para fora antes dos planos.
function shapeFromMesh(m,rng){
  const k=Math.cbrt(clamp(m.vr||1,0.3,1)),V=new Float64Array(m.v.length),F2=m.f.slice(),nv=V.length/3,c=[0,0,0];
  for(let i=0;i<V.length;i++)V[i]=m.v[i]*k;
  for(let i=0;i<nv;i++)for(let a=0;a<3;a++)c[a]+=V[3*i+a]/nv;
  for(let f=0;f<F2.length/3;f++){const a=F2[3*f],b=F2[3*f+1],d=F2[3*f+2];
    const ux=V[3*b]-V[3*a],uy=V[3*b+1]-V[3*a+1],uz=V[3*b+2]-V[3*a+2],wx=V[3*d]-V[3*a],wy=V[3*d+1]-V[3*a+1],wz=V[3*d+2]-V[3*a+2];
    const nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;
    if(nx*(V[3*a]-c[0])+ny*(V[3*a+1]-c[1])+nz*(V[3*a+2]-c[2])<0){F2[3*f+1]=d;F2[3*f+2]=b;}}
  // AR e h da forma medida (eixos x = L, y = I, z = S)
  const ext=[0,1,2].map(a=>{let lo=1e9,hi=-1e9;for(let i=0;i<nv;i++){const x=V[3*i+a];if(x<lo)lo=x;if(x>hi)hi=x;}return hi-lo;});
  return finishShape(V,F2,{AR:ext[1]/ext[0],h:ext[2]/ext[1],id:m.id,real:true},rng);
}
