'use strict';
/* ===================== Marshall Digital — worker: método de Wan et al. (2024) ===================== */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeRng(seed){
  const r=mulberry32(seed>>>0);
  r.unif=(a,b)=>a+(b-a)*r();
  r.int=n=>Math.floor(r()*n);
  r.normal=()=>{let u=r();while(u<1e-12)u=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r());};
  return r;
}
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const weibQ=(l,k,p)=>l*Math.pow(-Math.log(1-p),1/k);

// [W] Tabela 2: WSc/WSh do Min Feret (mm), WSc/WSh do AR e espessura relativa h; 'ate' = limite superior da faixa (mm)
const LIBS={
  WL:[{ate:4,mfL:2.92,mfK:6.53,arL:.75,arK:5.97,h:.67,nome:'L1'},{ate:6,mfL:4.67,mfK:4.56,arL:.74,arK:7.36,h:.88,nome:'L2'},
      {ate:10,mfL:8.60,mfK:5.55,arL:.74,arK:6.45,h:.66,nome:'L3'},{ate:14,mfL:11.44,mfK:6.69,arL:.74,arK:6.91,h:.75,nome:'L4'},
      {ate:1e9,mfL:17.12,mfK:7.11,arL:.75,arK:7.24,h:.82,nome:'L5'}],
  WG:[{ate:4,mfL:2.77,mfK:6.23,arL:.75,arK:9.61,h:.87,nome:'G1'},{ate:6,mfL:5.10,mfK:4.20,arL:.71,arK:6.25,h:.78,nome:'G2'},
      {ate:10,mfL:7.10,mfK:3.68,arL:.70,arK:5.79,h:.76,nome:'G3'},{ate:14,mfL:11.36,mfK:5.91,arL:.74,arK:6.72,h:.82,nome:'G4'},
      {ate:1e9,mfL:17.36,mfK:7.39,arL:.75,arK:7.18,h:.77,nome:'G5'}]
};
const classOf=(cls,hi)=>{let k=cls.findIndex(c=>hi<=c.ate+1e-9);return k<0?cls.length-1:k;};

function eqW(NA,M,AVC){ // [W] Eqs. (3)-(5); NA e M por 1000 g; B em %, BSc em cm
  // fora da faixa calibrada a Eq. (3) diverge (denominador perto de zero): usa a mediana da Tabela 3 de [W], B = 48%
  const den=NA-23.01*M+2106;let B=(81.38*NA-125.2*M-170800)/den,Bfallback=false;
  if(!(B>=0&&B<=100)||Math.abs(den)<200){B=48;Bfallback=true;}
  let BSc=(73.22*AVC+60.94*B-1065)/(AVC+426.7*B+4318);
  let BSh=(507.9*AVC+1189*B-8587)/(AVC+910.6*B-5781);
  let fallback=false;
  if(!(BSh>=0.8&&BSh<=4)||!(BSc>=0.02&&BSc<=0.3)){BSc=0.115;BSh=1.47;fallback=true;}
  return {B,BSc,BSh,fallback,Bfallback,Braw:(81.38*NA-125.2*M-170800)/den};
}

// ganchos do harness de estresse (stress/engine.mjs passa __probe); no navegador não existem
const PROBE=(typeof __probe!=='undefined')?__probe:null;
let lastPost=0;
function post(o,tr){self.postMessage(o,tr||[]);}
function progress(stage,pct,text,force){
  const t=Date.now();if(PROBE)PROBE.stage(stage,t);
  if(!force&&t-lastPost<150)return;
  lastPost=t; post({type:'progress',stage,pct,text});
}
const br=(x,d)=>x.toFixed(d).replace('.',',');

