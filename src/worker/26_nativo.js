/* ---------- núcleo em C (native/mdsim.c): a mesma compactação, compilada ---------- */
// O JavaScript faz a ordem aleatória e a coluna solta (as mesmas funções do compactar() abaixo); o mdsim faz a física e
// os protocolos. Usado pelo app quando o mini app Python serve o mdsim (cfg.native) e pelo harness (stress/native.mjs),
// que passa o seu próprio envio (arquivos + processo) e o probe.
const NATIVE_PROTO={w:0,marshall:1,giratorio:2};

// entrada binária do mdsim: cabeçalho, parâmetros, biblioteca de formas, partículas
function nativeInput(cfg,comp,lib,Ps,pos,q){
  const parts=[],I32=a=>parts.push(new Int32Array(a)),F64=a=>parts.push(new Float64Array(a));
  const mc=cfg.mastic||{},mh=cfg.marshall||{},gi=cfg.gir||{},seg=cfg.seg||{},n=Ps.tpl.length;
  I32([0x4D445331,n,lib.length,NATIVE_PROTO[cfg.proto||'w'],cfg.avcMode==='livre'?0:1,cfg.seed,
    mh.golpes??75,mh.sim??0,gi.N??100,gi.sim??0,seg.on?1:0]);
  F64([comp.R,comp.H,cfg.dt,cfg.coat,comp.V_graudo,comp.M,comp.mass,cfg.rhoA*1e-6,
    mc.lam??0.55,mc.kf??0.05,(mc.eta??20)*(mc.etaK??1),mc.coh??0.005,mc.mu??0.2,
    mh.escE??0.002,gi.P??600,gi.escP??0.001,gi.ang??1.16,gi.Tg??0.04,seg.k??0]);
  for(const t of lib){I32([t.pr.length/3,t.pl.length/4]);F64(t.pr);F64(t.pl);F64([t.vol,...t.I.map(Math.abs),t.area,t.rmax]);}
  I32(Ps.tpl);F64(Ps.sc);F64(pos);F64(q);
  let len=0;for(const p of parts)len+=p.byteLength;
  const out=new Uint8Array(len);let off=0;
  for(const p of parts){out.set(new Uint8Array(p.buffer,p.byteOffset,p.byteLength),off);off+=p.byteLength;}
  return out.buffer;
}

// saída do mdsim: JSON com os escalares e, em seguida, posições, quadros da animação, curva de compactação e traço
function nativeOutput(buf){
  const u8=new Uint8Array(buf),jl=new DataView(buf).getUint32(0,true);
  const H=JSON.parse(new TextDecoder().decode(u8.subarray(4,4+jl))),n=H.n,nf=H.nf;let off=4+jl;
  const take=(Ctor,len)=>{const bytes=len*Ctor.BYTES_PER_ELEMENT,a=new Ctor(buf.slice(off,off+bytes));off+=bytes;return a;};
  H.pos=take(Float64Array,3*n);H.q=take(Float64Array,4*n);
  H.anim={nf,P:take(Float32Array,nf*3*n),Q:take(Float32Array,nf*4*n),Z:take(Float32Array,nf*6),F:take(Int8Array,nf*2),txt:H.txt};
  const hs=take(Float64Array,2*H.nhist),tr=take(Float64Array,6*H.ntrace);
  H.hist=[];for(let k=0;k<H.nhist;k++)H.hist.push([hs[2*k],hs[2*k+1]]);
  H.trace=[];for(let k=0;k<H.ntrace;k++)H.trace.push(Array.from(tr.subarray(6*k,6*k+6)));
  return H;
}

// mesma assinatura e mesmo retorno do compactar(); send(ArrayBuffer de entrada) devolve o ArrayBuffer de saída
function compactarNativo(cfg,P,lib,NA,comp,send,probe){
  const n=NA,R=comp.R,perm=[...Array(n).keys()],r1=makeRng(cfg.seed+1);
  for(let i=n-1;i>0;i--){const j=r1.int(i+1);[perm[i],perm[j]]=[perm[j],perm[i]];}
  const Ps={tpl:perm.map(i=>P.tpl[i]),sc:perm.map(i=>P.sc[i]),fr:perm.map(i=>P.fr[i])};
  const rho=cfg.rhoA*1e-6,brad=new Float64Array(n),mass=new Float64Array(n);
  for(let i=0;i<n;i++){const t=lib[Ps.tpl[i]],s=Ps.sc[i];brad[i]=t.rmax*s;mass[i]=t.vol*s*s*s*rho;}
  const S0={n,brad,pos:new Float64Array(3*n),q:new Float64Array(4*n)};
  const raised=placeColumn(S0,R,r1,0.1);
  const H=nativeOutput(send(nativeInput(cfg,comp,lib,Ps,S0.pos,S0.q)));
  const S={n,pos:H.pos,q:H.q,mass,brad,zb:0,zp:H.zp},proto=cfg.proto||'w';
  if(probe){
    probe.S=S;probe.lib=lib;probe.Ps=Ps;probe.trace=H.trace;probe.native={tDem:H.tDem,threads:H.threads,vcap:H.vcap};
    if(proto==='w'){probe.p1={t:H.p1.t,gap:H.p1.gap,gap50:H.p1.gap50,timedOut:H.p1.gap>H.p1.gap50+1e-6};probe.p2={t:H.p2.t,forced:!!H.forced,fpist:H.p2.fpist,tEnd:H.p2.tEnd};}
    probe.zb=0;probe.zp=H.zp;probe.maxovEnd=H.maxov;
  }
  const I=H.info;
  const info=proto==='marshall'?{golpes:I[0],ns:I[1],v0:I[2],Mh:I[3],E:I[4],film:I[5],tFilm:I[6],AVCsolto:I[7],AVCcomp:I[8]}
    :proto==='giratorio'?{N:I[0],ns:I[1],Fp:I[2],ang:I[3],Tg:I[4],film:I[5],tFilm:I[6],AVCsolto:I[7],AVCcomp:I[8]}:null;
  return {S,Ps,n,out:{maxov:H.maxov},forced:!!H.forced,stalled:!!H.stalled,Hf:H.Hf,hist:H.hist,locked:!!H.locked,dH:H.dH,
    Hsolto:H.Hsolto>=0&&proto!=='w'?H.Hsolto:undefined,Hcomp:H.Hcomp,info,anim:H.anim,raised,pen:H.pen,motor:{nome:'C',threads:H.threads}};
}

// envio no app: POST síncrono (permitido em workers) para o servidor local do mini app, que roda o mdsim
function nativeSendXHR(nat){
  return buf=>{
    const x=new XMLHttpRequest();
    x.open('POST',`${nat.base}native/mdsim?t=${encodeURIComponent(nat.token)}`,false);
    x.responseType='arraybuffer';x.setRequestHeader('Content-Type','application/octet-stream');x.send(buf);
    if(x.status!==200)throw new Error(`mdsim: HTTP ${x.status}`);
    return x.response;
  };
}
