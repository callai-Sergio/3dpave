/* ---------- quadros da animação no .mdres.gz (formato 2) ---------- */
// A saída do mdsim guarda cada quadro em float32 (28 bytes por partícula). No arquivo, os quadros vão como a diferença para o
// quadro anterior em inteiros de 16 bits (posição em passos de 0,005 mm; quaternion em 1/32767), em zigue-zague e com os
// bytes baixos separados dos altos: o gzip aperta bem mais e nenhum quadro precisa ser descartado (o formato 1 guardava metade).
// Só os quadros perdem precisão (até 0,0025 mm); posições e orientações finais, curva e traço seguem byte a byte.
// Funções puras (Uint8Array → Uint8Array), sem DOM: stress/gerar_exemplos.mjs carrega este mesmo arquivo.
function qfPartes(u){
  const jl=new DataView(u.buffer,u.byteOffset,4).getUint32(0,true),H=JSON.parse(new TextDecoder().decode(u.subarray(4,4+jl)));
  return {H,fin:4+jl,ini:4+jl+56*H.n};
}
function qfJunta(H,partes){
  const js=new TextEncoder().encode(JSON.stringify(H)),hd=new Uint8Array(4);new DataView(hd.buffer).setUint32(0,js.length,true);
  const all=[hd,js,...partes];let len=0;for(const p of all)len+=p.byteLength;
  const out=new Uint8Array(len);let off=0;for(const p of all){out.set(new Uint8Array(p.buffer,p.byteOffset,p.byteLength),off);off+=p.byteLength;}
  return out;
}
// saída bruta do mdsim → a mesma saída com os quadros compactos (cabeçalho ganha qf = {sp: passo da posição em mm})
function compactarQuadros(u){
  const {H,fin,ini}=qfPartes(u),n=H.n,nf=H.nf,m=3*n,m4=4*n;
  if(H.qf||nf<2)return u;
  const f32=(off,len)=>new Float32Array(u.slice(off,off+4*len).buffer),P=f32(ini,m*nf),Q=f32(ini+4*m*nf,m4*nf),NP=m*(nf-1),NQ=m4*nf;
  // posições: se algum salto entre quadros não couber em 16 bits, o passo cresce
  let sp=0.005,dP;
  for(;;){
    dP=new Uint8Array(2*NP);let cabe=true;const prev=new Int32Array(m);for(let i=0;i<m;i++)prev[i]=Math.round(P[i]/sp);
    for(let k=1;k<nf&&cabe;k++){const o=(k-1)*m;
      for(let i=0;i<m;i++){const v=Math.round(P[k*m+i]/sp),d=v-prev[i];if(d>32767||d<-32768){cabe=false;break;}
        prev[i]=v;const z=((d<<1)^(d>>15))&0xFFFF;dP[o+i]=z&255;dP[NP+o+i]=z>>8;}}
    if(cabe)break;sp*=4;}
  // orientações: q e −q são a mesma rotação; o sinal segue o do quadro anterior para a diferença ficar pequena
  const dQ=new Uint8Array(2*NQ),pq=new Int16Array(m4),a=[0,0,0,0];
  for(let k=0;k<nf;k++)for(let j=0;j<n;j++){const o=k*m4+4*j;let dot=0;
    for(let c=0;c<4;c++){a[c]=Math.max(-32767,Math.min(32767,Math.round(Q[o+c]*32767)));dot+=a[c]*pq[4*j+c];}
    for(let c=0;c<4;c++){const v=dot<0?-a[c]:a[c],d=(v-pq[4*j+c])<<16>>16,z=((d<<1)^(d>>15))&0xFFFF;pq[4*j+c]=v;dQ[o+c]=z&255;dQ[NQ+o+c]=z>>8;}}
  return qfJunta({...H,qf:{sp}},[u.subarray(fin,ini),u.subarray(ini,ini+4*m),dP,dQ,u.subarray(ini+28*n*nf)]);
}
// o inverso: devolve a saída no formato do mdsim (quadros em float32), para o worker reabrir o resultado
function expandirQuadros(u){
  const {H,fin,ini}=qfPartes(u);if(!H.qf)return u;
  const n=H.n,nf=H.nf,m=3*n,m4=4*n,sp=H.qf.sp,NP=m*(nf-1),NQ=m4*nf,oP=ini+4*m,oQ=oP+2*NP,un=z=>(z>>>1)^-(z&1);
  const P=new Float32Array(m*nf),Q=new Float32Array(m4*nf);P.set(new Float32Array(u.slice(ini,ini+4*m).buffer));
  const prev=new Int32Array(m);for(let i=0;i<m;i++)prev[i]=Math.round(P[i]/sp);
  for(let k=1;k<nf;k++){const o=(k-1)*m;for(let i=0;i<m;i++){prev[i]+=un(u[oP+o+i]|u[oP+NP+o+i]<<8);P[k*m+i]=prev[i]*sp;}}
  const pq=new Int16Array(m4);
  for(let k=0;k<nf;k++)for(let i=0;i<m4;i++){const o=k*m4+i,v=(pq[i]+un(u[oQ+o]|u[oQ+NQ+o]<<8))<<16>>16;pq[i]=v;Q[o]=v/32767;}
  const H2={...H};delete H2.qf;
  return qfJunta(H2,[u.subarray(fin,ini),P,Q,u.subarray(oQ+2*NQ)]);
}
