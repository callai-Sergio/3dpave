/* ---------- DEM de corpos rígidos convexos com película de mastique ---------- */
// O contato usa a casca convexa desenhada na tela: os pontos de prova de uma partícula (vértices e meios das arestas longas)
// contra os semiplanos da outra, nos dois sentidos. Assim um grão não entra nos "buracos" de um aglomerado de esferas.
// Distância g entre a superfície de pedra de A e a de B (g < 0: as pedras se interpenetram):
//   g < film        mola mole kf da película de mastique (betume + fíler + finos < 2 mm), mais amortecimento
//   g < 0           mola de pedra kn·fk, com fk = max(1, sa·sb/(sa+sb)) (Hertz linearizado; sa, sb = Min Feret, parede: sb → ∞),
//                   até a trava de 0,125 × Min Feret da menor pedra (A4: com kn e trava fixos, pedras grandes afundavam umas nas outras)
//   g < film + lub  lubrificação viscosa, F = η·A·v / max(g, hmin) (Komaragiri et al. 2021), e coesão contra a separação
// Unidades: mm, kg, s; força em mN; η em mN·s/mm² (1 Pa·s = 1e-3).
const DEM_KN=1000,DEM_ZETA=0.3,DEM_HMIN=0.02,DEM_VMAX=5000;

function makeSim(P,lib,R,rho,seed){
  const n=P.tpl.length,rk=makeRng(seed);
  const prStart=new Int32Array(n+1);
  for(let i=0;i<n;i++)prStart[i+1]=prStart[i]+lib[P.tpl[i]].pr.length/3;
  const npr=prStart[n],prLoc=new Float64Array(3*npr),prW=new Float64Array(3*npr);
  const mass=new Float64Array(n),Ib=new Float64Array(3*n),brad=new Float64Array(n),area=new Float64Array(n),sc=new Float64Array(n),tplI=new Int32Array(n);
  for(let i=0;i<n;i++){
    const t=lib[P.tpl[i]],s=P.sc[i];sc[i]=s;tplI[i]=P.tpl[i];
    for(let k=prStart[i],j=0;k<prStart[i+1];k++,j++){prLoc[3*k]=t.pr[3*j]*s;prLoc[3*k+1]=t.pr[3*j+1]*s;prLoc[3*k+2]=t.pr[3*j+2]*s;}
    brad[i]=t.rmax*s;area[i]=t.area*s*s;mass[i]=t.vol*s*s*s*rho;
    for(let a=0;a<3;a++)Ib[3*i+a]=Math.max(t.I[a],1e-6)*Math.pow(s,5)*rho;
  }
  const pos=new Float64Array(3*n),q=new Float64Array(4*n),vel=new Float64Array(3*n),w=new Float64Array(3*n),Rm=new Float64Array(9*n);
  const F=new Float64Array(3*n),T=new Float64Array(3*n),FL=new Float64Array(3*n),TL=new Float64Array(3*n),Cs=new Float64Array(n),posB=new Float64Array(3*n),kdir=new Float64Array(3*n);
  let pairs=new Int32Array(1<<16),npairs=0,lastKick=-1,pairRange=0,built=false,builtRange=-1;
  // candidatos ponto-de-prova × partícula: [par, lado, ponto]; refeitos quando algum ponto anda mais que CAND_MARGIN/2
  // candidatos agrupados por par (candPS = início do bloco de cada par); uma partícula que andou mais que CAND_MARGIN/2 desde a sua
// última varredura marca os seus pares para nova varredura, os outros blocos são só copiados
const CAND_MARGIN=0.15,prS=new Float64Array(3*npr),stale=new Uint8Array(n);
let cand=new Int32Array(1<<16),candPl=new Int16Array(4<<16),ncand=0,candStale=true,candPS=new Int32Array(1<<14);
let cand2=new Int32Array(1<<16),candPl2=new Int16Array(4<<16);
  let pg=new Float64Array(1<<12),pd=new Float64Array(6<<12);
  // estado público: placas zb/zp, soquete (hv), película, viscosidade e coesão do mastique, molde inclinado
  const S={n,npr,pos,q,vel,w,mass,brad,area,sc,tpl:tplI,prStart,prW,zb:0,zp:1e4,hv:0,
    film:0,kf:0,eta:0,lub:0,coh:0,mu:0,tilt:0,phi:0,gapMin:0};

  function rotations(){
    for(let i=0;i<n;i++){const qw=q[4*i],qx=q[4*i+1],qy=q[4*i+2],qz=q[4*i+3],o=9*i;
      Rm[o]=1-2*(qy*qy+qz*qz);Rm[o+1]=2*(qx*qy-qw*qz);Rm[o+2]=2*(qx*qz+qw*qy);
      Rm[o+3]=2*(qx*qy+qw*qz);Rm[o+4]=1-2*(qx*qx+qz*qz);Rm[o+5]=2*(qy*qz-qw*qx);
      Rm[o+6]=2*(qx*qz-qw*qy);Rm[o+7]=2*(qy*qz+qw*qx);Rm[o+8]=1-2*(qx*qx+qy*qy);
      const px=pos[3*i],py=pos[3*i+1],pz=pos[3*i+2];
      for(let k=prStart[i];k<prStart[i+1];k++){const a=prLoc[3*k],b=prLoc[3*k+1],c=prLoc[3*k+2];
        prW[3*k]=Rm[o]*a+Rm[o+1]*b+Rm[o+2]*c+px;prW[3*k+1]=Rm[o+3]*a+Rm[o+4]*b+Rm[o+5]*c+py;prW[3*k+2]=Rm[o+6]*a+Rm[o+7]*b+Rm[o+8]*c+pz;}
    }
  }
  S.rotations=rotations;

  function buildPairs(skin){
    let bmax=0;for(let i=0;i<n;i++)if(brad[i]>bmax)bmax=brad[i];
    const cs=2*bmax+skin+pairRange;let zmin=1e9,zmax=-1e9,rmx=R;
    for(let i=0;i<n;i++){const z=pos[3*i+2];if(z<zmin)zmin=z;if(z>zmax)zmax=z;rmx=Math.max(rmx,Math.abs(pos[3*i]),Math.abs(pos[3*i+1]));}
    const x0=-rmx-cs,z0=zmin-cs,nx=Math.floor((2*rmx+2*cs)/cs)+1,ny=nx,nz=Math.floor((zmax-zmin+2*cs)/cs)+1;
    const head=new Int32Array(nx*ny*nz).fill(-1),next=new Int32Array(n),cell=new Int32Array(n);
    for(let i=0;i<n;i++){
      const cx=clamp(Math.floor((pos[3*i]-x0)/cs),0,nx-1),cy=clamp(Math.floor((pos[3*i+1]-x0)/cs),0,ny-1),cz=clamp(Math.floor((pos[3*i+2]-z0)/cs),0,nz-1);
      const c=(cz*ny+cy)*nx+cx;cell[i]=c;next[i]=head[c];head[c]=i;
    }
    npairs=0;
    for(let i=0;i<n;i++){
      const c=cell[i],cx=c%nx,cy=Math.floor(c/nx)%ny,cz=Math.floor(c/(nx*ny));
      for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const X=cx+dx,Y=cy+dy,Z=cz+dz;if(X<0||Y<0||Z<0||X>=nx||Y>=ny||Z>=nz)continue;
        for(let j=head[(Z*ny+Y)*nx+X];j>=0;j=next[j]){
          if(j<=i)continue;
          const ddx=pos[3*i]-pos[3*j],ddy=pos[3*i+1]-pos[3*j+1],ddz=pos[3*i+2]-pos[3*j+2],rc=brad[i]+brad[j]+pairRange+skin;
          if(ddx*ddx+ddy*ddy+ddz*ddz<rc*rc){
            if(2*npairs+2>pairs.length){const np2=new Int32Array(pairs.length*2);np2.set(pairs);pairs=np2;}
            pairs[2*npairs]=i;pairs[2*npairs+1]=j;npairs++;
          }
        }
      }
    }
    posB.set(pos);candStale=true;built=true;builtRange=pairRange;
  }
  // aumenta os buffers da lista nova para pelo menos 'need' entradas (os dois juntos, para não ficarem com tamanhos diferentes)
  function growCand(need){const E=Math.max(need,2*Math.floor(cand2.length/3));
    const c2=new Int32Array(3*E);c2.set(cand2.subarray(0,Math.min(cand2.length,3*E)));cand2=c2;
    const p2=new Int16Array(4*E);p2.set(candPl2.subarray(0,Math.min(candPl2.length,4*E)));candPl2=p2;}
  // varredura de um par: todos os pontos de prova de cada lado contra a casca da outra partícula, com a margem
  function scanPair(p,rr){
    const a=pairs[2*p],b=pairs[2*p+1];
    const dx=pos[3*b]-pos[3*a],dy=pos[3*b+1]-pos[3*a+1],dz=pos[3*b+2]-pos[3*a+2],L2=dx*dx+dy*dy+dz*dz,rc=brad[a]+brad[b]+rr;
    if(L2>rc*rc)return;
    // eixo entre os centros: a extensão de cada casca nesse eixo (pelos pontos de prova). Se as cascas estão separadas
    // por mais que o alcance, não há contato; senão, só os pontos do lado voltado para a outra partícula podem estar perto
    const L=Math.sqrt(L2)||1e-9,ux=dx/L,uy=dy/L,uz=dz/L;let supA=-1e9,supB=-1e9;
    for(let k=prStart[a];k<prStart[a+1];k++){const s=(prW[3*k]-pos[3*a])*ux+(prW[3*k+1]-pos[3*a+1])*uy+(prW[3*k+2]-pos[3*a+2])*uz;if(s>supA)supA=s;}
    for(let k=prStart[b];k<prStart[b+1];k++){const s=-((prW[3*k]-pos[3*b])*ux+(prW[3*k+1]-pos[3*b+1])*uy+(prW[3*k+2]-pos[3*b+2])*uz);if(s>supB)supB=s;}
    if(L-supA-supB>rr)return;
    for(let side=0;side<2;side++){const A=side?b:a,B=side?a:b,sg=side?-1:1,thr=L-(side?supA:supB)-rr;
      for(let k=prStart[A];k<prStart[A+1];k++){
        if(sg*((prW[3*k]-pos[3*A])*ux+(prW[3*k+1]-pos[3*A+1])*uy+(prW[3*k+2]-pos[3*A+2])*uz)<thr)continue;
        if(!probeIn(B,prW[3*k],prW[3*k+1],prW[3*k+2],rr))continue;
        if(3*ncand+3>cand2.length||4*ncand+4>candPl2.length)growCand(ncand+1);
        cand2[3*ncand]=p;cand2[3*ncand+1]=side;cand2[3*ncand+2]=k;candPl2.set(top4,4*ncand);ncand++;}}
  }
  // full: todos os pares (depois de refazer a lista de pares); senão só os pares com uma partícula marcada
  function scanCandidates(range,full){
    const rr=range+CAND_MARGIN,old=ncand,oc=cand,op=candPl;ncand=0;
    if(candPS.length<npairs+1)candPS=new Int32Array(2*npairs+2);
    for(let p=0;p<npairs;p++){
      const s0=candPS[p],s1=candPS[p+1];candPS[p]=ncand;
      if(!full&&!stale[pairs[2*p]]&&!stale[pairs[2*p+1]]){
        const m=s1-s0;if(m>0){
          if(3*(ncand+m)>cand2.length||4*(ncand+m)>candPl2.length)growCand(ncand+m);
          cand2.set(oc.subarray(3*s0,3*s1),3*ncand);candPl2.set(op.subarray(4*s0,4*s1),4*ncand);ncand+=m;}
        continue;}
      scanPair(p,rr);
    }
    candPS[npairs]=ncand;
    // troca os buffers (a lista nova vira a atual)
    cand=cand2;cand2=oc;candPl=candPl2;candPl2=op;
    for(let i=0;i<n;i++)if(full||stale[i]){for(let k=3*prStart[i];k<3*prStart[i+1];k++)prS[k]=prW[k];stale[i]=0;}
    candStale=false;S.nscan=(S.nscan||0)+1;S.ncand=ncand;S.npairs=npairs;
  }

  // menor distância (com sinal) de um ponto do mundo à superfície da partícula b; devolve a normal (mundo) e se está ao alcance
  const hit={g:0,nx:0,ny:0,nz:0},top4=new Int16Array(4),t4v=new Float64Array(4);
  // versão rápida para os passos entre varreduras: só os 4 planos guardados do candidato c
  function probeQuick(b,x,y,z,range,c){
    const o=9*b,dx=x-pos[3*b],dy=y-pos[3*b+1],dz=z-pos[3*b+2];
    const lx=Rm[o]*dx+Rm[o+3]*dy+Rm[o+6]*dz,ly=Rm[o+1]*dx+Rm[o+4]*dy+Rm[o+7]*dz,lz=Rm[o+2]*dx+Rm[o+5]*dy+Rm[o+8]*dz;
    const PL=lib[tplI[b]].pl,s=sc[b];let best=-1e9,bp=0;
    for(let j=4*c,e=j+4;j<e;j++){const p=candPl[j];if(p<0)continue;const d=PL[4*p]*lx+PL[4*p+1]*ly+PL[4*p+2]*lz+PL[4*p+3]*s;if(d>best){best=d;bp=p;}}
    if(best>range)return false;
    const ax=PL[4*bp],ay=PL[4*bp+1],az=PL[4*bp+2];
    hit.g=best;hit.nx=Rm[o]*ax+Rm[o+1]*ay+Rm[o+2]*az;hit.ny=Rm[o+3]*ax+Rm[o+4]*ay+Rm[o+5]*az;hit.nz=Rm[o+6]*ax+Rm[o+7]*ay+Rm[o+8]*az;
    return true;
  }
  function probeIn(b,x,y,z,range){
    const o=9*b,dx=x-pos[3*b],dy=y-pos[3*b+1],dz=z-pos[3*b+2],rr=brad[b]+range;
    if(dx*dx+dy*dy+dz*dz>rr*rr)return false;
    const lx=Rm[o]*dx+Rm[o+3]*dy+Rm[o+6]*dz,ly=Rm[o+1]*dx+Rm[o+4]*dy+Rm[o+7]*dz,lz=Rm[o+2]*dx+Rm[o+5]*dy+Rm[o+8]*dz;
    const PL=lib[tplI[b]].pl,s=sc[b],np=PL.length>>2;let best=-1e9,bp=0;
    t4v[0]=t4v[1]=t4v[2]=t4v[3]=-1e9;
    for(let p=0;p<np;p++){const d=PL[4*p]*lx+PL[4*p+1]*ly+PL[4*p+2]*lz+PL[4*p+3]*s;if(d>best){best=d;bp=p;if(d>range)return false;}
      if(d>t4v[3]){let j=3;while(j>0&&d>t4v[j-1]){t4v[j]=t4v[j-1];top4[j]=top4[j-1];j--;}t4v[j]=d;top4[j]=p;}}
    const ax=PL[4*bp],ay=PL[4*bp+1],az=PL[4*bp+2];
    hit.g=best;hit.nx=Rm[o]*ax+Rm[o+1]*ay+Rm[o+2]*az;hit.ny=Rm[o+3]*ax+Rm[o+4]*ay+Rm[o+5]*az;hit.nz=Rm[o+6]*ax+Rm[o+7]*ay+Rm[o+8]*az;
    return true;
  }

  // força normal + atrito num ponto de contato; n aponta de b para a; b<0 é uma parede com velocidade (wvx,wvy,wvz)
  let maxov=0;
  function springAt(a,b,x,y,z,g,nx,ny,nz,dt,wvx,wvy,wvz){
    const film=S.film;
    const rax=x-pos[3*a],ray=y-pos[3*a+1],raz=z-pos[3*a+2];
    let vx=vel[3*a]+w[3*a+1]*raz-w[3*a+2]*ray,vy=vel[3*a+1]+w[3*a+2]*rax-w[3*a]*raz,vz=vel[3*a+2]+w[3*a]*ray-w[3*a+1]*rax;
    let meff=mass[a],rbx=0,rby=0,rbz=0;
    if(b>=0){rbx=x-pos[3*b];rby=y-pos[3*b+1];rbz=z-pos[3*b+2];
      vx-=vel[3*b]+w[3*b+1]*rbz-w[3*b+2]*rby;vy-=vel[3*b+1]+w[3*b+2]*rbx-w[3*b]*rbz;vz-=vel[3*b+2]+w[3*b]*rby-w[3*b+1]*rbx;
      meff=mass[a]*mass[b]/(mass[a]+mass[b]);}
    else{vx-=wvx;vy-=wvy;vz-=wvz;}
    const vn=vx*nx+vy*ny+vz*nz;
    let k=0,fn=0;
    if(g<film){k=S.kf;fn=S.kf*(film-g);}
    if(g<0){const sa=sc[a],fk=Math.max(1,b>=0?sa*sc[b]/(sa+sc[b]):sa),cap=0.125*(b>=0?Math.min(sa,sc[b]):sa);
      k+=DEM_KN*fk;fn+=DEM_KN*fk*Math.min(-g,cap);if(-g>maxov)maxov=-g;}
    if(k<=0)return 0;
    const cn=2*DEM_ZETA*Math.sqrt(meff*k);
    fn-=cn*vn;if(fn<0)fn=0;
    let fx=fn*nx,fy=fn*ny,fz=fn*nz;
    if(S.mu>0&&fn>0){const tx=vx-vn*nx,ty=vy-vn*ny,tz=vz-vn*nz,vt=Math.sqrt(tx*tx+ty*ty+tz*tz);
      if(vt>1e-9){let ft=cn*vt;if(ft>S.mu*fn)ft=S.mu*fn;ft/=vt;fx-=ft*tx;fy-=ft*ty;fz-=ft*tz;}}
    F[3*a]+=fx;F[3*a+1]+=fy;F[3*a+2]+=fz;
    T[3*a]+=ray*fz-raz*fy;T[3*a+1]+=raz*fx-rax*fz;T[3*a+2]+=rax*fy-ray*fx;
    if(b>=0){F[3*b]-=fx;F[3*b+1]-=fy;F[3*b+2]-=fz;T[3*b]-=rby*fz-rbz*fy;T[3*b+1]-=rbz*fx-rbx*fz;T[3*b+2]-=rbx*fy-rby*fx;}
    return fz;
  }

  // mastique entre a e b (ou parede): lubrificação viscosa normal e tangencial, F = η·A·v/h, e coesão quando se afastam
  function masticAt(a,b,x,y,z,g,nx,ny,nz,dt,wvx,wvy,wvz,A){
    const rax=x-pos[3*a],ray=y-pos[3*a+1],raz=z-pos[3*a+2];
    let vx=vel[3*a]+w[3*a+1]*raz-w[3*a+2]*ray,vy=vel[3*a+1]+w[3*a+2]*rax-w[3*a]*raz,vz=vel[3*a+2]+w[3*a]*ray-w[3*a+1]*rax;
    let meff=mass[a],rbx=0,rby=0,rbz=0;
    if(b>=0){rbx=x-pos[3*b];rby=y-pos[3*b+1];rbz=z-pos[3*b+2];
      vx-=vel[3*b]+w[3*b+1]*rbz-w[3*b+2]*rby;vy-=vel[3*b+1]+w[3*b+2]*rbx-w[3*b]*rbz;vz-=vel[3*b+2]+w[3*b]*rby-w[3*b+1]*rbx;
      meff=mass[a]*mass[b]/(mass[a]+mass[b]);}
    else{vx-=wvx;vy-=wvy;vz-=wvz;}
    // a força vai para FL/TL; na integração ela é limitada pelo total de cada partícula (estabilidade do passo explícito)
    const c=S.eta*A/Math.max(g,DEM_HMIN);
    let fx=-c*vx,fy=-c*vy,fz=-c*vz;Cs[a]+=c;if(b>=0)Cs[b]+=c;
    const vn=vx*nx+vy*ny+vz*nz;
    if(S.coh>0&&vn>0&&g<S.film){const fc=S.coh*A;fx-=fc*nx;fy-=fc*ny;fz-=fc*nz;}
    FL[3*a]+=fx;FL[3*a+1]+=fy;FL[3*a+2]+=fz;
    TL[3*a]+=ray*fz-raz*fy;TL[3*a+1]+=raz*fx-rax*fz;TL[3*a+2]+=rax*fy-ray*fx;
    if(b>=0){FL[3*b]-=fx;FL[3*b+1]-=fy;FL[3*b+2]-=fz;TL[3*b]-=rby*fz-rbz*fy;TL[3*b+1]-=rbz*fx-rbx*fz;TL[3*b+2]-=rbx*fy-rby*fx;}
    return fz;
  }

  // o: dt, gd (amortecimento global), gz (gravidade com sinal, mm/s²), fbn (força radial), kick {f,period,dur}, t0
  //    placas: vp+gapT (dois pistões se aproximando, [W]); vb/vt (velocidade imposta); servo {F,vmax} (placa de cima por força);
  //    ham {side,M} (soquete livre: +1 no topo, −1 na base); giro {omega} (molde inclinado de S.tilt girando)
  function run(nsteps,o){
    const dt=o.dt,gd=o.gd||0,gz=o.gz||0,vp=o.vp||0,gapT=o.gapT,fbn=o.fbn||0,kick=o.kick,ham=o.ham,servo=o.servo,skin=0.6;
    const film=S.film,lubR=S.eta>0?S.lub:0,range=film+lubR;if(range!==pairRange)candStale=true;pairRange=range;
    const tilt=S.tilt,omega=o.giro?o.giro.omega:0,st=Math.sin(tilt),ct=Math.cos(tilt);
    // a lista de pares só é refeita quando o alcance muda ou alguém andou mais que a folga (abaixo)
    if(!built||builtRange!==range)buildPairs(skin);
    let fpist=0,ke=0,ftop=0,fbot=0;
    for(let step=0;step<nsteps;step++){
      const t=o.t0+step*dt;
      let dmax=0;
      for(let i=0;i<3*n;i+=3){const dx=pos[i]-posB[i],dy=pos[i+1]-posB[i+1],dz=pos[i+2]-posB[i+2],dd=dx*dx+dy*dy+dz*dz;if(dd>dmax)dmax=dd;}
      if(Math.sqrt(dmax)>skin*0.45)buildPairs(skin);
      rotations();
      F.fill(0);T.fill(0);FL.fill(0);TL.fill(0);Cs.fill(0);maxov=0;ftop=0;fbot=0;
      // partícula–partícula: pontos de prova de a contra a casca de b e vice-versa
      if(candStale)scanCandidates(range,true);
      else{const lim=0.25*CAND_MARGIN*CAND_MARGIN;let any=false;
        for(let i=0;i<n;i++){for(let k=3*prStart[i],e=3*prStart[i+1];k<e;k+=3){const dx=prW[k]-prS[k],dy=prW[k+1]-prS[k+1],dz=prW[k+2]-prS[k+2];if(dx*dx+dy*dy+dz*dz>lim){stale[i]=1;any=true;break;}}}
        if(any)scanCandidates(range,false);}
      if(pg.length<npairs){pg=new Float64Array(2*npairs);pd=new Float64Array(12*npairs);}
      pg.fill(1e9,0,npairs);
      for(let c=0;c<ncand;c++){
        const p=cand[3*c],side=cand[3*c+1],k=cand[3*c+2],a=pairs[2*p],b=pairs[2*p+1],A=side?b:a,B=side?a:b;
        const x=prW[3*k],y=prW[3*k+1],z=prW[3*k+2];
        if(!probeQuick(B,x,y,z,range,c))continue;
        const g=hit.g;
        if(g<film)springAt(A,B,x,y,z,g,hit.nx,hit.ny,hit.nz,dt,0,0,0);
        if(g<pg[p]){pg[p]=g;const sg=side?-1:1,o=6*p;pd[o]=x;pd[o+1]=y;pd[o+2]=z;pd[o+3]=sg*hit.nx;pd[o+4]=sg*hit.ny;pd[o+5]=sg*hit.nz;}
      }
      if(lubR>0)for(let p=0;p<npairs;p++){if(pg[p]>=range)continue;const a=pairs[2*p],b=pairs[2*p+1],o=6*p;
        masticAt(a,b,pd[o],pd[o+1],pd[o+2],pg[p],pd[o+3],pd[o+4],pd[o+5],dt,0,0,0,0.5*Math.min(area[a],area[b]));}
      // paredes: cilindro (eixo inclinado de tilt, girando com omega) e as duas placas horizontais
      const phi=S.phi+omega*(t-o.t0),ax=st*Math.cos(phi),ay=st*Math.sin(phi),az=ct,dax=-omega*st*Math.sin(phi),day=omega*st*Math.cos(phi);
      const zc=(S.zb+S.zp)/2;
      const moving=!ham&&vp>0&&(S.zp-S.zb)>gapT,vh=moving?vp/2:0;
      const vT=ham&&ham.side>0?S.hv:servo?S.vs:(o.vt!=null?o.vt:-vh),vB=ham&&ham.side<0?S.hv:(o.vb!=null?o.vb:vh);
      for(let i=0;i<n;i++){
        let gw=1e9,gb=1e9,gt=1e9,wx=0,wy=0,wz=0,wnx=0,wny=0,wnz=0,bx=0,by=0,bz=0,tx=0,ty=0,tz=0,wvx=0,wvy=0;
        for(let k=prStart[i];k<prStart[i+1];k++){
          const x=prW[3*k],y=prW[3*k+1],z=prW[3*k+2];
          // cilindro: distância ao eixo que passa por (0,0,zc) na direção (ax,ay,az)
          const ex=x,ey=y,ez=z-zc,s=ex*ax+ey*ay+ez*az,rx=ex-s*ax,ry=ey-s*ay,rz=ez-s*az,r=Math.sqrt(rx*rx+ry*ry+rz*rz);
          if(r>1e-9){const g=R-r;if(g<range){const nx=-rx/r,ny=-ry/r,nz=-rz/r,vwx=s*dax,vwy=s*day;
            if(g<film)springAt(i,-1,x,y,z,g,nx,ny,nz,dt,vwx,vwy,0);
            if(g<gw){gw=g;wx=x;wy=y;wz=z;wnx=nx;wny=ny;wnz=nz;wvx=vwx;wvy=vwy;}}}
          const g1=z-S.zb;if(g1<range){if(g1<film)fbot+=springAt(i,-1,x,y,z,g1,0,0,1,dt,0,0,vB);if(g1<gb){gb=g1;bx=x;by=y;bz=z;}}
          const g2=S.zp-z;if(g2<range){if(g2<film)ftop-=springAt(i,-1,x,y,z,g2,0,0,-1,dt,0,0,vT);if(g2<gt){gt=g2;tx=x;ty=y;tz=z;}}
        }
        if(lubR>0){const A=0.5*area[i];
          if(gw<range)masticAt(i,-1,wx,wy,wz,gw,wnx,wny,wnz,dt,wvx,wvy,0,A);
          if(gb<range)fbot+=masticAt(i,-1,bx,by,bz,gb,0,0,1,dt,0,0,vB,A);
          if(gt<range)ftop-=masticAt(i,-1,tx,ty,tz,gt,0,0,-1,dt,0,0,vT,A);}
      }
      fpist=(ftop+fbot)/2;
      // força radial (castanha-do-pará, [W] §3.3): igual para todas, para o centro entre os pistões
      if(fbn>0){for(let i=0;i<n;i++){const dx=-pos[3*i],dy=-pos[3*i+1],dz=zc-pos[3*i+2],L=Math.sqrt(dx*dx+dy*dy+dz*dz);if(L>1e-6){F[3*i]+=fbn*dx/L;F[3*i+1]+=fbn*dy/L;F[3*i+2]+=fbn*dz/L;}}}
      // mistura: força igual para todas, em direção aleatória, durante 'dur' a cada 'period'
      if(kick){const id=Math.floor(t/kick.period);
        if(t-id*kick.period<kick.dur){
          if(id!==lastKick){lastKick=id;for(let i=0;i<n;i++){let x=rk.normal(),y=rk.normal(),z=rk.normal();const L=Math.hypot(x,y,z)||1;kdir[3*i]=x/L;kdir[3*i+1]=y/L;kdir[3*i+2]=z/L;}}
          for(let i=0;i<3*n;i++)F[i]+=kick.f*kdir[i];
        }}
      ke=0;
      for(let i=0;i<n;i++){
        const m=mass[i];
        // viscosidade do mastique: com c·dt/m acima de ~0,5 o movimento já é quase estático; a força satura nesse limite
        if(Cs[i]>0){const fl=Math.min(1,0.5*m/(Cs[i]*dt)),Imn=Math.min(Ib[3*i],Ib[3*i+1],Ib[3*i+2]),fr=Math.min(1,0.5*Imn/(Cs[i]*brad[i]*brad[i]*dt));
          for(let k=0;k<3;k++){F[3*i+k]+=fl*FL[3*i+k];T[3*i+k]+=fr*TL[3*i+k];}}
        for(let k=0;k<3;k++){let f=F[3*i+k]-gd*m*vel[3*i+k];if(k===2)f+=m*gz;vel[3*i+k]+=f/m*dt;pos[3*i+k]+=vel[3*i+k]*dt;ke+=0.5*m*vel[3*i+k]*vel[3*i+k];}
        const qw=q[4*i],qx=q[4*i+1],qy=q[4*i+2],qz=q[4*i+3];
        const rinv=(v0,v1,v2)=>{const tx=2*(-qy*v2+qz*v1),ty=2*(-qz*v0+qx*v2),tz=2*(-qx*v1+qy*v0);return [v0+qw*tx+(-qy*tz+qz*ty),v1+qw*ty+(-qz*tx+qx*tz),v2+qw*tz+(-qx*ty+qy*tx)];};
        const tb=rinv(T[3*i],T[3*i+1],T[3*i+2]),wb=rinv(w[3*i],w[3*i+1],w[3*i+2]);
        const I0=Ib[3*i],I1=Ib[3*i+1],I2=Ib[3*i+2];
        // o torque viscoso pode exceder a estabilidade de corpos pequenos: limita a variação de ω num passo
        wb[0]+=((tb[0]-(I2-I1)*wb[1]*wb[2])/I0-gd*wb[0])*dt;
        wb[1]+=((tb[1]-(I0-I2)*wb[2]*wb[0])/I1-gd*wb[1])*dt;
        wb[2]+=((tb[2]-(I1-I0)*wb[0]*wb[1])/I2-gd*wb[2])*dt;
        const tx=2*(qy*wb[2]-qz*wb[1]),ty=2*(qz*wb[0]-qx*wb[2]),tz=2*(qx*wb[1]-qy*wb[0]);
        const w0=wb[0]+qw*tx+(qy*tz-qz*ty),w1=wb[1]+qw*ty+(qz*tx-qx*tz),w2=wb[2]+qw*tz+(qx*ty-qy*tx);
        w[3*i]=w0;w[3*i+1]=w1;w[3*i+2]=w2;
        // trava de segurança: um contato degenerado (normal trocada numa penetração funda) não pode lançar a partícula
        {const v2=vel[3*i]*vel[3*i]+vel[3*i+1]*vel[3*i+1]+vel[3*i+2]*vel[3*i+2];if(v2>DEM_VMAX*DEM_VMAX){const f=DEM_VMAX/Math.sqrt(v2);vel[3*i]*=f;vel[3*i+1]*=f;vel[3*i+2]*=f;S.vcap=(S.vcap||0)+1;}
         const wm=DEM_VMAX/brad[i],ww=w0*w0+w1*w1+w2*w2;if(ww>wm*wm){const f=wm/Math.sqrt(ww);w[3*i]*=f;w[3*i+1]*=f;w[3*i+2]*=f;}}
        const nw=qw+0.5*(-w0*qx-w1*qy-w2*qz)*dt,nx=qx+0.5*(w0*qw+w1*qz-w2*qy)*dt,ny=qy+0.5*(-w0*qz+w1*qw+w2*qx)*dt,nz=qz+0.5*(w0*qy-w1*qx+w2*qw)*dt;
        const L=Math.sqrt(nw*nw+nx*nx+ny*ny+nz*nz);q[4*i]=nw/L;q[4*i+1]=nx/L;q[4*i+2]=ny/L;q[4*i+3]=nz/L;
      }
      if(moving){S.zp-=vh*dt;S.zb+=vh*dt;const gap=S.zp-S.zb;if(gap<gapT){const c=(gapT-gap)/2;S.zp+=c;S.zb-=c;}}
      else if(o.vt!=null||o.vb!=null){if(o.vt!=null)S.zp+=o.vt*dt;if(o.vb!=null)S.zb+=o.vb*dt;}
      if(servo){const e=(servo.F-ftop)/Math.max(servo.F,1e-9);S.vs=-servo.vmax*Math.tanh(2*e);S.zp+=S.vs*dt;
        if(servo.zmin!=null&&S.zp<servo.zmin){S.zp=servo.zmin;S.vs=0;}}
      // o peso do soquete entra com a mesma escala de carga da energia (ham.gk), como as outras cargas externas do modelo
      if(ham){const gh=gz*(ham.gk??1);if(ham.side>0){S.hv+=(ftop/ham.M+gh)*dt;S.zp+=S.hv*dt;}else{S.hv+=(-fbot/ham.M+gh)*dt;S.zb+=S.hv*dt;}}
      // o mastique é incompressível: as placas não descem abaixo da altura em que sólidos + mastique enchem o molde (S.gapMin)
      if(S.gapMin>0&&S.zp-S.zb<S.gapMin){if(ham){if(ham.side>0){S.zp=S.zb+S.gapMin;if(S.hv<0)S.hv=0;}else{S.zb=S.zp-S.gapMin;if(S.hv>0)S.hv=0;}}
        else if(servo){S.zp=S.zb+S.gapMin;S.vs=0;}}
    }
    if(omega)S.phi+=omega*nsteps*dt;
    return {maxov,fpist,ftop,fbot,ke,gap:S.zp-S.zb};
  }
  S.vs=0;
  S.run=run;

  // extremos em z das partículas pelos pontos de prova; com p (0–1), o percentil p dos extremos de cada partícula (ignora grãos soltos)
  S.extent=p=>{rotations();let lo=1e9,hi=-1e9;const L=p?new Float64Array(n):null,U=p?new Float64Array(n):null;
    for(let i=0;i<n;i++){let li=1e9,ui=-1e9;for(let k=prStart[i];k<prStart[i+1];k++){const z=prW[3*k+2];if(z<li)li=z;if(z>ui)ui=z;}
      if(li<lo)lo=li;if(ui>hi)hi=ui;if(p){L[i]=li;U[i]=ui;}}
    if(!p)return [lo,hi];
    L.sort();U.sort();const k=Math.min(n-1,Math.floor(p*(n-1)));return [L[n-1-k],U[k]];};

  // penetração pedra–pedra pela casca real (K33): por par, a maior penetração de um ponto de prova, ÷ Min Feret da menor
  S.penetration=()=>{rotations();buildPairs(0);
    let worst=0,worstAbs=0,nBad=0;const rel=[];
    for(let p=0;p<npairs;p++){const a=pairs[2*p],b=pairs[2*p+1];let pen=0;
      for(let side=0;side<2;side++){const A=side?b:a,B=side?a:b;
        for(let k=prStart[A];k<prStart[A+1];k++)if(probeIn(B,prW[3*k],prW[3*k+1],prW[3*k+2],0)&&-hit.g>pen)pen=-hit.g;}
      if(pen>0){const r=pen/Math.min(sc[a],sc[b]);rel.push(r);if(r>worst)worst=r;if(pen>worstAbs)worstAbs=pen;if(r>0.02)nBad++;}}
    rel.sort((x,y)=>x-y);built=false;
    return {max:worst,maxAbs:worstAbs,p99:rel.length?rel[Math.floor(0.99*(rel.length-1))]:0,nPairs:rel.length,nBad};};
  return S;
}
