/* ---------- protocolos de compactação: [W] pistões, Marshall (impacto) e giratório (SGC) ---------- */
// Todos partem da mesma coluna solta de partículas e devolvem o simulador com a base em z = 0 e a altura final.
// AVC travado: se a compactação não chegou à altura H do AVC alvo, um ajuste com a mesma física (gravidade, atrito e
// mastique) leva a placa de cima até H, e o esforço de ajuste fica registrado. AVC livre: a altura final é medida.
const G_MM=9810,W_PEN_STOP=0.1,W_HOLD=0.1;// mm: limite de aprovação do K8 (raio da menor partícula, 1 mm × 0,1); s

// coluna solta: partículas em ordem aleatória, sem sobreposição dos raios envolventes. Quando não há lugar, a coluna sobe;
// nenhuma partícula é colocada sobreposta (antes, a colocação desistia depois de 200 tentativas)
function placeColumn(S,R,r1,gap){
  const n=S.n;let z=0,raised=0;
  for(let i=0;i<n;i++){
    const rb=S.brad[i];let p,tries=0;
    for(;;tries++){
      const rr=Math.max(0,R-rb-0.2)*Math.sqrt(r1()),th=r1()*2*Math.PI;
      p=[rr*Math.cos(th),rr*Math.sin(th),z+rb+r1()*2];
      let bad=false;
      for(let j=Math.max(0,i-500);j<i;j++){const dx=S.pos[3*j]-p[0],dy=S.pos[3*j+1]-p[1],dz=S.pos[3*j+2]-p[2],rc=S.brad[j]+rb+gap;if(dx*dx+dy*dy+dz*dz<rc*rc){bad=true;break;}}
      if(!bad)break;
      if(tries%20===19){z+=0.5;raised++;}
    }
    S.pos.set(p,3*i);
    const qq=[r1.normal(),r1.normal(),r1.normal(),r1.normal()];const L=Math.hypot(...qq);S.q.set(qq.map(v=>v/L),4*i);
  }
  return raised;
}

// quadros da animação: posições, orientações e placas; acima do teto, descarta um quadro sim, um não
function makeRecorder(S,n){
  const capF=clamp(Math.floor(48e6/(28*n)),80,600);
  let fP=[],fQ=[],fM=[],stride=1,count=0;
  const rec={flip:0,ham:0,
    snap(txt,force){if(!force&&(count++%stride))return;
      const [lo,hi]=S.extent();fP.push(new Float32Array(S.pos));fQ.push(new Float32Array(S.q));
      fM.push([S.zb,S.zp,lo,hi,rec.flip,rec.ham,S.tilt,S.phi,txt]);
      if(fP.length>capF){const ev=(_,k)=>k%2===0;fP=fP.filter(ev);fQ=fQ.filter(ev);fM=fM.filter(ev);stride*=2;}},
    // a base passa a ser z = 0 também nos quadros
    pack(zs){const nf=fP.length,aP=new Float32Array(nf*3*n),aQ=new Float32Array(nf*4*n),aZ=new Float32Array(nf*6),aF=new Int8Array(nf*2),aT=[];
      for(let k=0;k<nf;k++){const p=fP[k];for(let i=2;i<3*n;i+=3)p[i]-=zs;aP.set(p,k*3*n);aQ.set(fQ[k],k*4*n);
        const m=fM[k];aZ.set([m[0]-zs,m[1]-zs,m[2]-zs,m[3]-zs,m[6],m[7]],6*k);aF[2*k]=m[4];aF[2*k+1]=m[5];aT.push(m[8]);}
      return {nf,P:aP,Q:aQ,Z:aZ,F:aF,txt:aT};}};
  return rec;
}

// película de mastique: o volume M espalhado sobre a área da casca de todos os agregados; a distância de contato entre
// duas pedras é a soma das duas películas, reduzida por λ (Komaragiri et al. 2021 usaram 0,6) porque parte do mastique
// fica nos vazios do esqueleto
function masticSetup(S,comp,cfg){
  const mc=cfg.mastic||{},lam=mc.lam??0.55;let Atot=0;for(let i=0;i<S.n;i++)Atot+=S.area[i];
  const t=comp.M*1000/Atot;
  S.film=Math.max(cfg.coat,2*lam*t);S.kf=DEM_KN*(mc.kf??0.05);S.lub=0.5*S.film;
  S.eta=(mc.eta??20)*1e-3*(mc.etaK??1);S.coh=mc.coh??0.005;S.mu=mc.mu??0.2;
  // altura mínima: AVC 0,5% (o mastique, que não está nas partículas do DEM, ocupa o volume M)
  S.gapMin=(comp.V_graudo+comp.M)*1000/(Math.PI*comp.R*comp.R*(1-0.005));
  return {film:S.film,tFilm:t,Atot};
}

// altura entre as placas pelo extremo das partículas
const heightOf=S=>{const [lo,hi]=S.extent();return {lo,hi,H:hi-lo};};

// ajuste do modo travado: a placa de cima desce até zb+H com a física completa; registra quanto da altura foi pelo ajuste
function lockToH(S,H,dt,tt,gz,progress,label){
  let {lo,hi}=heightOf(S);S.zb=lo-0.02;S.zp=hi+0.02;
  const H0=S.zp-S.zb,chunk=Math.round(0.005/dt);let out={maxov:0,fpist:0,ke:0},t=0,fmax=0;
  if(H0>H){
    while(S.zp-S.zb>H+1e-6&&t<3){
      out=S.run(chunk,{dt,gd:4,gz,vt:-20,t0:tt});tt+=chunk*dt;t+=chunk*dt;fmax=Math.max(fmax,out.ftop);
      if(S.zp-S.zb<H){S.zp=S.zb+H;}
      progress('compac',Math.min(1,(H0-(S.zp-S.zb))/Math.max(H0-H,1e-6))*0.9,`${label} · altura ${br(S.zp-S.zb,1)} mm`);
    }
  }else S.zp=S.zb+H;
  for(let k=0;k<12;k++){out=S.run(chunk,{dt,gd:8,gz,t0:tt});tt+=chunk*dt;}
  return {tt,out,dH:Math.max(0,H0-H),fmax};
}

// ---------- [W]: mistura sem gravidade, pistões até AVC 50% e força crescente até o AVC alvo ----------
function protoW(S,cfg,comp,R,H,rec,r1){
  const n=S.n,dt=cfg.dt,chunk=Math.round(0.005/dt),area=Math.PI*R*R/1000,Vsol=comp.V_graudo+comp.M;
  const avcOf=gap=>100*(area*gap-Vsol)/(area*gap);
  S.film=cfg.coat;S.kf=DEM_KN;S.eta=0;S.coh=0;S.mu=0;
  let zlo=1e9,zhi=-1e9;for(let i=0;i<n;i++){zlo=Math.min(zlo,S.pos[3*i+2]-S.brad[i]);zhi=Math.max(zhi,S.pos[3*i+2]+S.brad[i]);}
  S.zb=zlo-0.5;S.zp=zhi+0.5;rec.ham=2;
  let mmin=1e9;for(let i=0;i<n;i++)if(S.mass[i]<mmin)mmin=S.mass[i];
  const fbn=cfg.seg.on?cfg.seg.k*0.3*mmin*G_MM:0,kick={f:3*mmin*G_MM,period:0.1,dur:0.005};
  const gap50=Vsol/(0.5*area),gap0=S.zp-S.zb;let tt=0,out={gap:gap0,fpist:0,maxov:0};
  rec.snap('Mistura e pistões',true);
  while(out.gap>gap50+1e-6&&tt<4){
    out=S.run(chunk,{dt,gd:4,vp:150,gapT:gap50,fbn,kick,t0:tt});tt+=chunk*dt;rec.snap(`Pistões · AVC ${br(avcOf(out.gap),0)}%`);
    progress('mistura',(gap0-out.gap)/Math.max(gap0-gap50,1e-6),`Pistões · altura ${br(out.gap,1)} mm · AVC(Eq. 1) ${br(avcOf(out.gap),1)}%`);
  }
  if(PROBE)PROBE.phase1(tt,out.gap,gap50);
  // A10: quando uma pedra entra mais de W_PEN_STOP em outra (K8), os pistões param e as pedras podem se rearranjar; se a
  // penetração não cai em W_HOLD s, o esqueleto não cabe na altura do AVC alvo. O CP fica na altura em que travou, com o
  // AVC medido, e o app avisa (em vez de forçar)
  let tB=0,forced=false,stalled=false,hold=0;const F0=5000,Frate=100000;
  while(out.gap>H+1e-6){
    const cap=F0+Frate*tB,vp=hold>0?0:(out.fpist<cap||forced)?40:0;
    out=S.run(chunk,{dt,gd:5,vp,gapT:H,fbn,t0:tt});tt+=chunk*dt;tB+=chunk*dt;
    if(out.maxov>W_PEN_STOP){hold+=chunk*dt;if(hold>W_HOLD-1e-9){stalled=true;break;}}else hold=0;
    if(tB>1.5)forced=true;
    rec.snap(`Força nos pistões · AVC ${br(avcOf(out.gap),1)}%`);
    progress('compac',(gap50-out.gap)/Math.max(gap50-H,1e-6)*0.9,`Força nos pistões ${br(out.fpist/1000,1)} N (limite ${br(cap/1000,0)} N) · AVC ${br(avcOf(out.gap),1)}%`);
  }
  if(PROBE)PROBE.phase2(tB,forced,out.fpist,tt);
  const nrel=Math.round(0.06/dt),gapR=stalled?S.zp-S.zb:H;
  for(let k=0;k<nrel;k+=chunk){out=S.run(chunk,{dt,gd:8,vp:0,gapT:gapR,t0:tt});tt+=chunk*dt;progress('compac',0.9+0.1*k/nrel,'Acomodação');}
  rec.snap('Corpo de prova compactado',true);
  return {out,forced,stalled,Hf:S.zp-S.zb,hist:[],locked:!stalled,dH:forced?1:0};
}

// a mistura com mastique é reunida numa massa solta (sem gravidade, como na bacia, até ~AVC 35%) e cai 20 mm no molde.
// Uma queda livre da coluna inteira seria lenta de simular e chegaria ao fundo a ~2 m/s, o que não acontece no ensaio.
function deposit(S,cfg,rec,tt,R,comp){
  const dt=cfg.dt,chunk=Math.round(0.005/dt);let Mtot=0;for(let i=0;i<S.n;i++)Mtot+=S.mass[i];
  const keStop=0.5*Mtot*20*20,area=Math.PI*R*R/1000,gapL=(comp.V_graudo+comp.M)/(0.65*area);
  let zlo=1e9,zhi=-1e9;for(let i=0;i<S.n;i++){zlo=Math.min(zlo,S.pos[3*i+2]-S.brad[i]);zhi=Math.max(zhi,S.pos[3*i+2]+S.brad[i]);}
  S.zb=zlo-0.5;S.zp=zhi+0.5;rec.ham=2;
  const gap0=S.zp-S.zb;let out={gap:gap0,ke:0},tm=0;
  rec.snap('Mistura com mastique',true);
  while(out.gap>gapL+1e-6&&tm<2){
    out=S.run(chunk,{dt,gd:4,vp:300,gapT:gapL,t0:tt});tt+=chunk*dt;tm+=chunk*dt;
    rec.snap('Mistura com mastique');
    progress('mistura',(gap0-out.gap)/Math.max(gap0-gapL,1e-6),`Reunindo a mistura · altura ${br(out.gap,1)} mm`);
  }
  S.run(4*chunk,{dt,gd:8,t0:tt});tt+=4*chunk*dt;
  S.zb-=20;S.zp=1e6;rec.ham=0;let tq=0;
  rec.snap('Queda no molde',true);
  while(tq<0.8){
    out=S.run(chunk,{dt,gd:1,gz:-G_MM,t0:tt});tt+=chunk*dt;tq+=chunk*dt;
    rec.snap(`Queda no molde · ${br(tq,2)} s`);
    progress('queda',Math.min(tq/0.6,0.97),`Queda no molde · ${br(tq,2)} s`);
    if(tq>0.2&&out.ke<keStop)break;
  }
  return tt;
}

// ---------- Marshall: queda no molde e golpes do soquete por face, com o molde virado na face 2 ----------
function protoMarshall(S,cfg,comp,R,H,rec,r1){
  const MC=cfg.marshall,dt=cfg.dt,chunk=Math.round(0.005/dt),chunkB=Math.round(0.001/dt),area=Math.PI*R*R/1000,Vsol=comp.V_graudo+comp.M;
  const avcOf=h=>100*(area*h-Vsol)/(area*h);
  const ms=masticSetup(S,comp,cfg);
  let tt=deposit(S,cfg,rec,0,R,comp);
  const nb=MC.golpes,ns=Math.max(1,Math.min(nb,MC.sim||nb));
  // energia de um golpe real: 4,536 kg caindo 457,2 mm (20,3 J), escalada pela massa do CP (norma: ~1200 g) e pela escala de carga
  // do modelo (as pedras do DEM são ~1000× mais moles que as reais); cada golpe simulado leva a energia de nb/ns golpes
  const Mh=4.536*comp.mass/1200,E=MC.escE*20.35e6*comp.mass/1200*nb/ns,v0=Math.sqrt(2*E/Mh);
  let Mtot=0;for(let i=0;i<S.n;i++)Mtot+=S.mass[i];const keStop=0.5*Mtot*10*10;
  let e=heightOf(S);const Hsolto=e.H,hist=[[0,Hsolto]];
  for(let f=1;f<=2;f++){
    const side=f===1?1:-1,gz=-side*G_MM;
    if(f===2){e=heightOf(S);S.zp=e.hi+0.05;rec.flip=1;
      S.run(chunk,{dt,gd:6,gz,t0:tt});tt+=chunk*dt;rec.snap('Molde virado · face 2',true);}
    for(let k=1;k<=ns;k++){
      const a=Math.round((k-1)*nb/ns)+1,b=Math.round(k*nb/ns),txt=`${a===b?'Golpe '+a:'Golpes '+a+'–'+b} de ${nb} · face ${f}`;
      e=heightOf(S);
      if(side>0)S.zp=e.hi+0.3;else S.zb=e.lo-0.3;
      S.hv=-side*v0;rec.ham=side;rec.snap(txt,true);
      let tb=0,deep=false;
      // o soquete fica apoiado até o material parar (o repique é amortecido) para a energia elástica não lançar partículas
      while(tb<0.03){
        S.run(chunkB,{dt,gd:deep?8:1,gz,ham:{side,M:Mh,gk:MC.escE},t0:tt});tt+=chunkB*dt;tb+=chunkB*dt;
        if(!deep&&side*S.hv>=0){deep=true;rec.snap(txt,true);}
        if(deep)S.hv*=0.5;
        if(deep&&tb>0.012){let ke=0;for(let i=0;i<3*S.n;i++)ke+=0.5*S.mass[(i/3)|0]*S.vel[i]*S.vel[i];if(ke<keStop)break;}
      }
      if(side>0)S.zp=1e6;else S.zb=-1e6;rec.ham=0;
      S.run(chunk,{dt,gd:6,gz,t0:tt});tt+=chunk*dt;
      e=heightOf(S);hist.push([(f-1)*nb+b,e.H]);rec.snap(txt,true);
      progress('golpes',((f-1)*ns+k)/(2*ns),`${txt} · altura ${br(e.H,1)} mm · AVC ${br(avcOf(e.H),1)}%`);
    }
    if(f===2){// desvira: a face 2 terminou com a gravidade para +z; volta para a base em baixo
      rec.flip=0;}
  }
  // o CP volta à posição normal: assenta com a gravidade para baixo entre placas fixas no extremo
  e=heightOf(S);S.zb=e.lo-0.02;S.zp=e.hi+0.02;
  for(let k=0;k<6;k++){S.run(chunk,{dt,gd:8,gz:-G_MM,t0:tt});tt+=chunk*dt;}
  e=heightOf(S);const Hgolpes=e.H;
  let adj={dH:0,fmax:0,out:{maxov:0}};
  if(cfg.avcMode==='travado'){adj=lockToH(S,H,dt,tt,-G_MM,progress,'Ajuste até o AVC alvo');tt=adj.tt;}
  else{S.zb=e.lo;S.zp=e.hi;}
  rec.snap('Corpo de prova compactado',true);
  return {out:adj.out,forced:false,Hf:S.zp-S.zb,hist,locked:cfg.avcMode==='travado',dH:adj.dH,Hsolto,Hcomp:Hgolpes,
    info:{golpes:nb,ns,v0,Mh,E,film:ms.film,tFilm:ms.tFilm,AVCsolto:avcOf(Hsolto),AVCcomp:avcOf(Hgolpes)}};
}

// ---------- Giratório (SGC): placa de cima por força constante e molde inclinado girando (Komaragiri: girar o molde, não a placa) ----------
function protoGiratorio(S,cfg,comp,R,H,rec,r1){
  const GC=cfg.gir,dt=cfg.dt,chunk=Math.round(0.005/dt),area=Math.PI*R*R/1000,Vsol=comp.V_graudo+comp.M;
  const avcOf=h=>100*(area*h-Vsol)/(area*h);
  const ms=masticSetup(S,comp,cfg);
  let tt=deposit(S,cfg,rec,0,R,comp);
  let e=heightOf(S);const Hsolto=e.H,hist=[[0,Hsolto]];
  // o giro simulado dura Tg em vez dos 2 s reais (30 rpm): o tempo é comprimido por 2/Tg e as forças viscosas cresceriam na mesma
  // proporção. A viscosidade efetiva é dividida por esse fator (o paper da Sensors compensa a aceleração do giro com amortecimento)
  const accel=2/GC.Tg;S.eta/=accel;
  // pressão: 1 kPa = 1 mN/mm²; escalada pela escala de carga do modelo
  const Fp=GC.P*GC.escP*Math.PI*R*R,N=GC.N,ns=Math.max(1,Math.min(N,GC.sim||N));
  const Tg=GC.Tg,omega=2*Math.PI/Tg,ang=GC.ang*Math.PI/180,stepsG=Math.round(Tg/dt),nCh=Math.max(1,Math.round(stepsG/chunk));
  S.zb=e.lo-0.02;S.zp=e.hi+0.02;rec.ham=2;S.vs=0;
  const servo={F:Fp,vmax:100};
  // assentamento com a pressão, sem giro (como a carga inicial do SGC)
  for(let k=0;k<20;k++){S.run(chunk,{dt,gd:6,gz:-G_MM,servo,t0:tt});tt+=chunk*dt;}
  rec.snap('Pressão aplicada · giro 0',true);
  hist[0]=[0,S.zp-S.zb];
  for(let g=1;g<=ns;g++){
    for(let c=0;c<nCh;c++){
      S.tilt=ang*Math.min(1,(g-1+c/nCh)/1);// o ângulo sobe no primeiro giro
      S.run(chunk,{dt,gd:2,gz:-G_MM,servo,giro:{omega},t0:tt});tt+=chunk*dt;
      if(c%Math.max(1,Math.floor(nCh/6))===0)rec.snap(`Giro ${Math.round(g*N/ns)} de ${N}`);
    }
    const Hn=S.zp-S.zb,gReal=Math.round(g*N/ns);hist.push([gReal,Hn]);
    rec.snap(`Giro ${gReal} de ${N} · altura ${br(Hn,1)} mm`,true);
    progress('giros',g/ns,`Giro ${gReal} de ${N} · altura ${br(Hn,1)} mm · AVC ${br(avcOf(Hn),1)}%`);
  }
  S.tilt=0;
  for(let k=0;k<10;k++){S.run(chunk,{dt,gd:8,gz:-G_MM,servo,t0:tt});tt+=chunk*dt;}
  const Hcomp=S.zp-S.zb;
  let adj={dH:0,fmax:0,out:{maxov:0}};
  if(cfg.avcMode==='travado'){adj=lockToH(S,H,dt,tt,-G_MM,progress,'Ajuste até o AVC alvo');tt=adj.tt;}
  else{e=heightOf(S);S.zb=e.lo;S.zp=e.hi;}
  rec.snap('Corpo de prova compactado',true);
  return {out:adj.out,forced:false,Hf:S.zp-S.zb,hist,locked:cfg.avcMode==='travado',dH:adj.dH,Hsolto,Hcomp,
    info:{N,ns,Fp,ang:GC.ang,Tg,film:ms.film,tFilm:ms.tFilm,AVCsolto:avcOf(Hsolto),AVCcomp:avcOf(Hcomp)}};
}

function compactar(cfg,P,lib,NA,comp){
  // no servidor o harness pode trocar a física pelo núcleo em C (native/mdsim.c), com o mesmo retorno
  if(PROBE&&PROBE.compactar)return PROBE.compactar(cfg,P,lib,NA,comp);
  // no mini app (F10) o mdsim compilado faz a física do Marshall e do giratório (calibrados com ele, A5); o [W] fica em
  // JavaScript até o C passar no golden (M14). Se o mdsim falhar, a mesma simulação segue em JavaScript
  if(cfg.native&&!PROBE&&(cfg.proto==='marshall'||cfg.proto==='giratorio')){
    post({type:'nativo',on:true});
    try{return compactarNativo(cfg,P,lib,NA,comp,nativeSendXHR(cfg.native));}
    catch(e){post({type:'nativo',on:false,erro:String(e&&e.message||e)});}
    finally{post({type:'nativo',on:false});}
  }
  const R=comp.R,H=comp.H,n=NA;
  const perm=[...Array(n).keys()],r1=makeRng(cfg.seed+1);
  for(let i=n-1;i>0;i--){const j=r1.int(i+1);[perm[i],perm[j]]=[perm[j],perm[i]];}
  const Ps={tpl:perm.map(i=>P.tpl[i]),sc:perm.map(i=>P.sc[i]),fr:perm.map(i=>P.fr[i])};
  const rho=cfg.rhoA*1e-6,S=makeSim(Ps,lib,R,rho,cfg.seed+3);
  if(PROBE)PROBE.sim(S,lib,Ps);
  const raised=placeColumn(S,R,r1,0.1);
  const rec=makeRecorder(S,n),proto=cfg.proto||'w';
  const r=proto==='marshall'?protoMarshall(S,cfg,comp,R,H,rec,r1):proto==='giratorio'?protoGiratorio(S,cfg,comp,R,H,rec,r1):protoW(S,cfg,comp,R,H,rec,r1);
  const zs=S.zb;for(let i=0;i<n;i++)S.pos[3*i+2]-=zs;S.zp-=zs;S.zb=0;
  if(PROBE)PROBE.settled(S,r.out);
  r.anim=rec.pack(zs);r.raised=raised;r.pen=S.penetration();
  return Object.assign(r,{S,Ps,n});
}
