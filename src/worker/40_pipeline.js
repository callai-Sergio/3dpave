/* ---------- pipeline ---------- */
function runAll(cfg){
  const comp=cfg.comp,R=comp.R,t0=Date.now();let H=comp.H;
  progress('formas',0,'Gerando a biblioteca de formas',true);
  // formas: [W] Tabela 2 (calcário WL, granito WG, geradas) ou formas reais medidas (RS diabásio SMA, RT todas)
  const real=!LIBS[cfg.lib],rng=makeRng(cfg.seed),cls=real?REAL_SHAPES[cfg.lib]:LIBS[cfg.lib],ntpl=60;
  const usedCls=new Set();comp.fracoes.forEach(([lo,hi])=>usedCls.add(classOf(cls,hi)));
  const lib=[],off=[],nTpl=[],ang=0.28;
  cls.forEach((par,k)=>{off.push(lib.length);nTpl.push(0);if(!usedCls.has(k))return;
    if(real)par.formas.forEach(m=>lib.push(shapeFromMesh(m,rng)));else for(let i=0;i<ntpl;i++)lib.push(makeShape(rng,par,ang));
    nTpl[k]=lib.length-off[k];progress('formas',lib.length/(usedCls.size*ntpl),'Gerando a biblioteca de formas');});
  const P=sampleParts(cfg,lib,off,nTpl),NA=P.tpl.length;
  if(NA<2)throw new Error('A granulometria não tem agregados acima de 2 mm suficientes para simular.');
  const NA1000=NA*comp.k1000,M1000=comp.M*comp.k1000;
  let bub;
  if(cfg.bub.mode==='auto')bub=Object.assign({mode:'auto'},eqW(NA1000,M1000,cfg.avc));
  else if(cfg.bub.mode==='manual')bub={mode:'manual',B:clamp(cfg.bub.B,0,100),BSc:cfg.bub.BScmm/10,BSh:cfg.bub.BSh,fallback:false};
  else bub={mode:'off',B:0,BSc:0.1,BSh:1.5,fallback:false};
  post({type:'sampled',NA,rel:P.rel,bub,ARmin:Math.min(...lib.map(t=>t.AR)),ARmax:Math.max(...lib.map(t=>t.AR))});

  // compactação pelo protocolo escolhido ([W] pistões, Marshall ou giratório); a base fica em z = 0
  const C=compactar(cfg,P,lib,NA,comp),S=C.S,Ps=C.Ps,n=NA,out=C.out,forced=C.forced;
  // AVC livre: a altura medida define o volume do CP e os vazios; AVC travado: a altura do AVC alvo
  const Vsol=comp.V_graudo+comp.M,areaC=Math.PI*R*R/1000;
  if(!C.locked){H=C.Hf;}
  const Vcp=areaC*H,AVCcp=100*(Vcp-Vsol)/Vcp;
  let warnC='';
  if(!C.locked&&AVCcp<0.3)warnC='Os golpes ou giros compactaram o esqueleto além do volume de sólidos: a película de mastique está fina demais para esta mistura (calibre em Avançado).';
  if(C.stalled)warnC=`O esqueleto de agregados travou antes da altura do AVC alvo: os pistões pararam em AVC ${br(AVCcp,1)}% para não fazer as pedras entrarem umas nas outras. Esta granulometria não chega a ${br(cfg.avc,1)}% de vazios com este teor de ligante.`;
  const Vvoid0=Math.max(0.003*Vcp,Vcp-Vsol);
  if(!C.locked&&cfg.bub.mode==='auto')bub=Object.assign({mode:'auto'},eqW(NA1000,M1000,Math.max(AVCcp,0.5)));
  const tDem=(Date.now()-t0)/1000;

  /* ---------- voxels ---------- */
  progress('pintura',0,'Voxelizando os agregados',true);
  const h=cfg.voxel,nx=Math.ceil(2*R/h),ny=nx,nz=Math.ceil(H/h),nvox=nx*ny*nz,sxy=nx*ny;
  const lab=new Int32Array(nvox),phase=new Uint8Array(nvox);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const X=(x+0.5)*h-R,Y=(y+0.5)*h-R;if(X*X+Y*Y<=R*R)for(let zz=0;zz<nz;zz++)phase[zz*sxy+y*nx+x]=1;}
  let over=0;
  for(let i=0;i<n;i++){
    const t=lib[Ps.tpl[i]],s=Ps.sc[i];
    const qw=S.q[4*i],qx=S.q[4*i+1],qy=S.q[4*i+2],qz=S.q[4*i+3];
    const Rm=[1-2*(qy*qy+qz*qz),2*(qx*qy-qw*qz),2*(qx*qz+qw*qy),2*(qx*qy+qw*qz),1-2*(qx*qx+qz*qz),2*(qy*qz-qw*qx),2*(qx*qz-qw*qy),2*(qy*qz+qw*qx),1-2*(qx*qx+qy*qy)];
    const px=S.pos[3*i],py=S.pos[3*i+1],pz=S.pos[3*i+2];
    const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
    for(let v=0;v<t.v.length;v+=3){const a=t.v[v]*s,b=t.v[v+1]*s,c=t.v[v+2]*s;const wv=[Rm[0]*a+Rm[1]*b+Rm[2]*c+px,Rm[3]*a+Rm[4]*b+Rm[5]*c+py,Rm[6]*a+Rm[7]*b+Rm[8]*c+pz];for(let k=0;k<3;k++){if(wv[k]<mn[k])mn[k]=wv[k];if(wv[k]>mx[k])mx[k]=wv[k];}}
    const np=t.pl.length/4,PW=new Float64Array(4*np);
    for(let p=0;p<np;p++){const a=t.pl[4*p],b=t.pl[4*p+1],c=t.pl[4*p+2];PW[4*p]=Rm[0]*a+Rm[1]*b+Rm[2]*c;PW[4*p+1]=Rm[3]*a+Rm[4]*b+Rm[5]*c;PW[4*p+2]=Rm[6]*a+Rm[7]*b+Rm[8]*c;PW[4*p+3]=t.pl[4*p+3]*s;}
    const x0=Math.max(0,Math.floor((mn[0]+R)/h)),x1=Math.min(nx,Math.ceil((mx[0]+R)/h)),y0=Math.max(0,Math.floor((mn[1]+R)/h)),y1=Math.min(ny,Math.ceil((mx[1]+R)/h)),z0=Math.max(0,Math.floor(mn[2]/h)),z1=Math.min(nz,Math.ceil(mx[2]/h));
    for(let zz=z0;zz<z1;zz++){const Z=(zz+0.5)*h-pz;
      for(let y=y0;y<y1;y++){const Y=(y+0.5)*h-R-py;
        for(let x=x0;x<x1;x++){const Xr=(x+0.5)*h-R-px;
          let ok=true;for(let p=0;p<np;p++){if(PW[4*p]*Xr+PW[4*p+1]*Y+PW[4*p+2]*Z+PW[4*p+3]>0){ok=false;break;}}
          if(!ok)continue;const id=zz*sxy+y*nx+x;if(phase[id]===0)continue;
          if(lab[id]>0)over++;else{lab[id]=i+1;phase[id]=4;}
        }}}
    if(i%200===0)progress('pintura',0.15*i/n,'Voxelizando os agregados');
  }
  // [W] §3.6: pintura do mastique a partir das bordas dos agregados (as paredes contam como agregado)
  progress('pintura',0.2,'Distância até os agregados e as paredes',true);
  const D=new Uint16Array(nvox);
  for(let zz=0;zz<nz;zz++){const fw=cfg.faceW??2.5,lim=Math.min(Math.round(3*fw*(zz+1)),Math.round(3*fw*(nz-zz)),65535);for(let k=0;k<sxy;k++){const id=zz*sxy+k;D[id]=phase[id]===1?lim:0;}}
  chamfer(D,nx,ny,nz);
  const noise=valueNoise(cfg.seed*7+3),cellN=1/h;
  const dP=new Float32Array(nvox);
  let ncyl=0;
  for(let zz=0;zz<nz;zz++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const id=zz*sxy+y*nx+x;if(phase[id]!==0)ncyl++;if(phase[id]===1)dP[id]=D[id]/3+0.15*noise(x/cellN,y/cellN,zz/cellN);}
  const vv=h*h*h/1000;
  const Vvoid=Vvoid0*(ncyl*vv)/Vcp;
  const nVoidT=Math.round(Vvoid/vv),nBubT=Math.round(nVoidT*bub.B/100),nEsqT=nVoidT-nBubT;
  const NB=4096;
  function convert(from,to,nsel,desc,skip){
    if(nsel<=0)return 0;
    let dmax=0;for(let id=0;id<nvox;id++)if(phase[id]===from&&dP[id]>dmax)dmax=dP[id];
    const sc=(NB-1)/(dmax+1e-6+0.2),hist=new Int32Array(NB),bin=v=>clamp(Math.floor((v+0.2)*sc),0,NB-1);
    for(let id=0;id<nvox;id++)if(phase[id]===from&&!(skip&&skip[id]))hist[bin(dP[id])]++;
    let acc=0,T=desc?NB-1:0;
    if(desc){for(;T>=0;T--){if(acc+hist[T]>=nsel)break;acc+=hist[T];}}else{for(;T<NB;T++){if(acc+hist[T]>=nsel)break;acc+=hist[T];}}
    let rem=nsel-acc,done=0;
    for(let id=0;id<nvox;id++){if(phase[id]!==from||(skip&&skip[id]))continue;const b=bin(dP[id]);
      if(desc?b>T:b<T){phase[id]=to;done++;}else if(b===T&&rem>0){phase[id]=to;rem--;done++;}}
    return done;
  }
  const count=c=>{let k=0;for(let id=0;id<nvox;id++)if(phase[id]===c)k++;return k;};
  progress('pintura',0.45,'Pintando o mastique a partir dos agregados',true);
  convert(1,2,nEsqT,true);
  const flipped=new Uint8Array(nvox);
  for(let iter=0;iter<3;iter++){
    const list=[];
    for(let zz=1;zz<nz-1;zz++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const id=zz*sxy+y*nx+x;if(phase[id]!==1)continue;
      let c=0;for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(phase[id+dz*sxy+dy*nx+dx]===2)c++;}
      if(c>=10)list.push(id);}
    if(!list.length)break;
    for(const id of list){phase[id]=2;flipped[id]=1;}
    const ex=count(2)-nEsqT;if(ex>0)convert(2,1,ex,false,flipped);
    progress('pintura',0.5+0.1*iter,'Redução de ruído do mastique',true);
  }
  {
    const seen=new Uint8Array(nvox),qu=new Int32Array(nvox);let removed=0;
    for(let id0=0;id0<nvox;id0++){if(phase[id0]!==2||seen[id0])continue;
      let qh=0,qt=0;qu[qt++]=id0;seen[id0]=1;
      while(qh<qt){const id=qu[qh++],x=id%nx,y=Math.floor(id/nx)%ny,zz=Math.floor(id/sxy);
        const nb=[x>0?id-1:-1,x<nx-1?id+1:-1,y>0?id-nx:-1,y<ny-1?id+nx:-1,zz>0?id-sxy:-1,zz<nz-1?id+sxy:-1];
        for(const j of nb)if(j>=0&&!seen[j]&&phase[j]===2){seen[j]=1;qu[qt++]=j;}}
      if(qt<30){for(let k=0;k<qt;k++)phase[qu[k]]=1;removed+=qt;}
    }
    if(removed>0)convert(1,2,removed,true);
  }
  // bolhas no mastique, com diâmetro pela Weibull (BSc, BSh)
  progress('bolhas',0,'Semeando bolhas no mastique',true);
  const DV=new Uint16Array(nvox);
  for(let id=0;id<nvox;id++)DV[id]=phase[id]===2?0:65535;
  chamfer(DV,nx,ny,nz);
  const cand=[];
  for(let id=0;id<nvox;id++)if(phase[id]===1&&D[id]/3*h>=2*h&&DV[id]/3*h>=1.0)cand.push(id);
  const rb=makeRng(cfg.seed+5),bubbles=[],bubC=[],cs=6,hash=new Map();
  const key=(a,b,c)=>a+','+b+','+c;
  let nBub=0,fails=0,warn='';
  while(nBub<nBubT&&cand.length){
    let d=clamp(10*bub.BSc*Math.pow(-Math.log(1-rb()),1/bub.BSh),2*h,5);
    let placed=false;
    for(let shrink=0;shrink<7&&!placed;shrink++,d=Math.max(2*h,d*0.8)){
      for(let tr=0;tr<120;tr++){
        const id=cand[rb.int(cand.length)];if(phase[id]!==1)continue;
        const r=d/2;
        if(D[id]/3*h<r+h)continue;
        const x=id%nx,y=Math.floor(id/nx)%ny,zz=Math.floor(id/sxy),cx=(x+0.5)*h-R,cy=(y+0.5)*h-R,cz=(zz+0.5)*h;
        const gx=Math.floor(cx/cs),gy=Math.floor(cy/cs),gz=Math.floor(cz/cs);let ok=true;
        for(let a=-1;a<=1&&ok;a++)for(let b=-1;b<=1&&ok;b++)for(let c=-1;c<=1&&ok;c++){const L=hash.get(key(gx+a,gy+b,gz+c));if(!L)continue;
          for(const o of L){if(Math.hypot(o[0]-cx,o[1]-cy,o[2]-cz)-o[3]-r<h){ok=false;break;}}}
        if(!ok)continue;
        const rv=r/h,x0=Math.max(0,Math.floor(x-rv)),x1=Math.min(nx-1,Math.ceil(x+rv)),y0=Math.max(0,Math.floor(y-rv)),y1=Math.min(ny-1,Math.ceil(y+rv)),z0=Math.max(0,Math.floor(zz-rv)),z1=Math.min(nz-1,Math.ceil(zz+rv));
        for(let Z=z0;Z<=z1;Z++)for(let Y=y0;Y<=y1;Y++)for(let Xx=x0;Xx<=x1;Xx++){const dx=Xx-x,dy=Y-y,dz=Z-zz;if(dx*dx+dy*dy+dz*dz<=rv*rv){const j=Z*sxy+Y*nx+Xx;if(phase[j]===1){phase[j]=3;nBub++;}}}
        bubbles.push(d);bubC.push(cx,cy,cz,r);const k=key(gx,gy,gz);if(!hash.has(k))hash.set(k,[]);hash.get(k).push([cx,cy,cz,r]);
        placed=true;break;
      }
    }
    if(!placed){if(++fails>400)break;}else fails=0;
    if(bubbles.length%40===0)progress('bolhas',Math.min(nBub/Math.max(nBubT,1),1),`Bolhas: ${bubbles.length} semeadas`);
  }
  if(nBub<nBubT){const rest=nBubT-nBub;convert(1,2,rest,true);warn=`Faltou espaço para ${br(rest*vv,2)} cm³ de bolhas; completei com vazios do esqueleto.`;}

  /* ---------- estatísticas ---------- */
  const cnt=[0,0,0,0,0];for(let id=0;id<nvox;id++)cnt[phase[id]]++;
  const st={ncyl,Vcil:ncyl*vv,Vagg:cnt[4]*vv,Vmast:cnt[1]*vv,Vesq:cnt[2]*vv,Vbol:cnt[3]*vv,over:over*vv,tDem,warn,maxov:out.maxov,forced,
    nBubbles:bubbles.length,VvoidT:Vvoid,VbolT:nBubT*vv,VesqT:nEsqT*vv};
  st.AVC=(cnt[2]+cnt[3])/ncyl*100;st.Breal=(cnt[2]+cnt[3])?cnt[3]/(cnt[2]+cnt[3])*100:0;
  bubbles.sort((a,b)=>a-b);st.bubMed=bubbles.length?bubbles[bubbles.length>>1]:0;
  const zc=Math.floor(nz/2),prof=new Float64Array(20),pTot=new Float64Array(20),quad=[0,0,0,0],qTot=[0,0,0,0];
  for(let zz=Math.floor(nz/3);zz<Math.ceil(2*nz/3);zz++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const p=phase[zz*sxy+y*nx+x];if(!p)continue;const k=Math.min(19,Math.floor((x+0.5)/nx*20)),v=(p===2||p===3)?1:0;prof[k]+=v;pTot[k]++;
    if(zz===zc){const qd=(x>=nx/2?1:0)+(y>=ny/2?2:0);quad[qd]+=v;qTot[qd]++;}}
  st.profile=[...prof].map((v,k)=>pTot[k]?v/pTot[k]*100:0);st.quad=quad.map((v,k)=>qTot[k]?v/qTot[k]*100:0);
  // perfil vertical (K31): 20 fatias da base ao topo, com as frações de vazio e de agregado
  const vp=new Float64Array(20),va=new Float64Array(20),vt=new Float64Array(20);
  for(let zz=0;zz<nz;zz++){const k=Math.min(19,Math.floor((zz+0.5)/nz*20));for(let j=zz*sxy,e=j+sxy;j<e;j++){const p=phase[j];if(!p)continue;vt[k]++;if(p===2||p===3)vp[k]++;else if(p===4)va[k]++;}}
  st.vprofile=[...vp].map((v,k)=>vt[k]?v/vt[k]*100:0);st.vagg=[...va].map((v,k)=>vt[k]?v/vt[k]*100:0);
  // perfil fino junto às faces (K28, K30): % de vazios por camada de voxels nos primeiros 4 mm da base e do topo
  {const nf=Math.min(nz>>1,Math.ceil(4/h)),lay=zz=>{let v=0,t=0;for(let j=zz*sxy,e=j+sxy;j<e;j++){const p=phase[j];if(!p)continue;t++;if(p===2||p===3)v++;}return t?v/t*100:0;};
   st.vface={dz:h,bot:Array.from({length:nf},(_,i)=>+lay(i).toFixed(3)),top:Array.from({length:nf},(_,i)=>+lay(nz-1-i).toFixed(3))};}
  // compactação: protocolo, curva altura × golpe/giro, modo de AVC, esforço de ajuste e penetração pela casca (K33)
  const Hs=C.Hsolto??null,Hc=C.Hcomp??C.Hf;
  st.comp={proto:cfg.proto||'w',locked:C.locked,AVCcp,Hf:C.Hf,Hsolto:Hs,Hcomp:Hc,AVCcomp:100*(areaC*Hc-Vsol)/(areaC*Hc),dH:C.dH,
    esforco:Hs!=null&&Hs>H?C.dH/(Hs-H):(C.forced?1:0),hist:C.hist,info:C.info||null,raised:C.raised,stalled:!!C.stalled};
  st.pen=C.pen;
  if(warnC)st.warn=(st.warn?st.warn+' ':'')+warnC;

  progress('bolhas',0.97,'Malhando os vazios',true);
  let step=Math.max(1,Math.round(0.5/h)),mE;
  for(;;){mE=surfaceMesh(phase,nx,ny,nz,h,R,[2],step);if(mE.idx.length/3<=250000||step>4)break;step++;}
  const bubF=new Float32Array(bubC);
  const tplArr=new Int32Array(Ps.tpl),scArr=new Float32Array(Ps.sc),frArr=new Int8Array(Ps.fr);
  const posF=new Float32Array(S.pos),qF=new Float32Array(S.q);
  const libOut=lib.map(t=>({v:t.v,f:t.f}));
  const tr=[lab.buffer,phase.buffer,posF.buffer,qF.buffer,tplArr.buffer,scArr.buffer,frArr.buffer,mE.pos.buffer,mE.idx.buffer,bubF.buffer];
  const A=C.anim;tr.push(A.P.buffer,A.Q.buffer);
  post({type:'done',res:{mar:{anim:A},nx,ny,nz,h,R,H,lab,phase,pos:posF,q:qF,tpl:tplArr,sc:scArr,fr:frArr,lib:libOut,meshE:mE,bubbles:bubF,st,NA,bub,rel:P.rel,
    tTotal:(Date.now()-t0)/1000}},tr);
}

self.onmessage=e=>{try{runAll(e.data);}catch(err){post({type:'error',message:(err&&err.message)||String(err),stack:err&&err.stack});}};
