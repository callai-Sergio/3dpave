/* ---------- exportação ---------- */
function setExport(on){['b-zip','b-stla','b-stlv'].forEach(id=>$(id).disabled=!on);if(!on){$('stl-box').hidden=true;$('stl-txt').value='';}}
function aggTriangles(cb){
  const r=result,m=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),s=new THREE.Vector3(),v=new THREE.Vector3();
  for(let i=0;i<r.tpl.length;i++){const t=r.lib[r.tpl[i]];p.set(r.pos[3*i],r.pos[3*i+1],r.pos[3*i+2]);q.set(r.q[4*i+1],r.q[4*i+2],r.q[4*i+3],r.q[4*i]);s.setScalar(r.sc[i]);m.compose(p,q,s);
    const W=new Float32Array(t.v.length);for(let k=0;k<t.v.length;k+=3){v.set(t.v[k],t.v[k+1],t.v[k+2]).applyMatrix4(m);W[k]=v.x;W[k+1]=v.y;W[k+2]=v.z;}
    for(let f=0;f<t.f.length;f+=3)cb(W,3*t.f[f],3*t.f[f+1],3*t.f[f+2]);}
}
function voidTriangles(cb){
  const m=result.meshE;for(let k=0;k<m.idx.length;k+=3)cb(m.pos,3*m.idx[k],3*m.idx[k+1],3*m.idx[k+2]);
  const ico=new THREE.IcosahedronGeometry(1,1).toNonIndexed().attributes.position.array,b=result.bubbles,W=new Float32Array(ico.length);
  for(let k=0;k<b.length;k+=4){for(let i=0;i<ico.length;i+=3){W[i]=b[k]+ico[i]*b[k+3];W[i+1]=b[k+1]+ico[i+1]*b[k+3];W[i+2]=b[k+2]+ico[i+2]*b[k+3];}
    for(let i=0;i<ico.length;i+=9)cb(W,i,i+3,i+6);}
}
function normalOf(P,a,b,c){const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const L=Math.hypot(nx,ny,nz)||1;return [nx/L,ny/L,nz/L];}
function stlBinary(gen,name){
  let n=0;gen(()=>n++);const buf=new ArrayBuffer(84+50*n),dv=new DataView(buf);
  for(let i=0;i<80;i++)dv.setUint8(i,i<name.length?name.charCodeAt(i)&127:32);dv.setUint32(80,n,true);let o=84;
  gen((P,a,b,c)=>{const nn=normalOf(P,a,b,c);for(const x of nn){dv.setFloat32(o,x,true);o+=4;}for(const i of [a,b,c])for(let k=0;k<3;k++){dv.setFloat32(o,P[i+k],true);o+=4;}o+=2;});
  return new Uint8Array(buf);
}
function stlAscii(gen,name){
  const out=[`solid ${name}`],f=x=>x.toExponential(5);
  gen((P,a,b,c)=>{const nn=normalOf(P,a,b,c);out.push(` facet normal ${f(nn[0])} ${f(nn[1])} ${f(nn[2])}\n  outer loop\n   vertex ${f(P[a])} ${f(P[a+1])} ${f(P[a+2])}\n   vertex ${f(P[b])} ${f(P[b+1])} ${f(P[b+2])}\n   vertex ${f(P[c])} ${f(P[c+1])} ${f(P[c+2])}\n  endloop\n endfacet`);});
  out.push(`endsolid ${name}`);return out.join('\n');
}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zip(files){
  const enc=new TextEncoder(),chunks=[],central=[];let off=0;
  for(const f of files){const nm=enc.encode(f.name),crc=crc32(f.data),L=new DataView(new ArrayBuffer(30));
    L.setUint32(0,0x04034b50,true);L.setUint16(4,20,true);L.setUint16(12,33,true);L.setUint32(14,crc,true);L.setUint32(18,f.data.length,true);L.setUint32(22,f.data.length,true);L.setUint16(26,nm.length,true);
    chunks.push(new Uint8Array(L.buffer),nm,f.data);
    const C=new DataView(new ArrayBuffer(46));C.setUint32(0,0x02014b50,true);C.setUint16(4,20,true);C.setUint16(6,20,true);C.setUint16(14,33,true);C.setUint32(16,crc,true);C.setUint32(20,f.data.length,true);C.setUint32(24,f.data.length,true);C.setUint16(28,nm.length,true);C.setUint32(42,off,true);
    central.push(new Uint8Array(C.buffer),nm);off+=30+nm.length+f.data.length;}
  const cs=central.reduce((a,b)=>a+b.length,0),E=new DataView(new ArrayBuffer(22));
  E.setUint32(0,0x06054b50,true);E.setUint16(8,files.length,true);E.setUint16(10,files.length,true);E.setUint32(12,cs,true);E.setUint32(16,off,true);
  return new Blob([...chunks,...central,new Uint8Array(E.buffer)],{type:'application/zip'});
}
let downloadsNS=null;
(async()=>{try{if(window.claude&&window.claude.use)downloadsNS=await window.claude.use('downloads');}catch(e){downloadsNS=null;}})();
$('b-zip').addEventListener('click',async()=>{
  const nm=(lastCfg&&lastCfg.nome||'mistura').replace(/[^\w-]+/g,'_');$('exp-note').textContent='Montando os arquivos…';
  await new Promise(r=>setTimeout(r,30));
  const blob=zip([{name:`${nm}_agregados.stl`,data:stlBinary(aggTriangles,nm+' agregados')},{name:`${nm}_vazios.stl`,data:stlBinary(voidTriangles,nm+' vazios')}]);
  if(window.pywebview&&window.pywebview.api&&window.pywebview.api.save_file){
    const b64=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]);fr.readAsDataURL(blob);});
    const path=await window.pywebview.api.save_file(`${nm}_STL.zip`,b64);$('exp-note').textContent=path?`Salvo em ${path}`:'Salvamento cancelado.';return;}
  if(!downloadsNS){
    if(!(window.claude&&window.claude.use)){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${nm}_STL.zip`;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),5000);$('exp-note').textContent=`Arquivo ${nm}_STL.zip baixado (${fmt(blob.size/1e6,1)} MB).`;return;}
    $('exp-note').textContent='Esta visualização não permite baixar arquivos. Use os botões de STL ASCII e copie o texto.';return;}
  try{await downloadsNS.save({filename:`${nm}_STL.zip`,data:blob});$('exp-note').textContent=`Arquivo ${nm}_STL.zip salvo (${fmt(blob.size/1e6,1)} MB).`;}
  catch(e){const c=e&&e.code;$('exp-note').textContent=c==='declined'?'Download cancelado.':c==='rate_limited'?'Já há um pedido de download aberto. Tente de novo em instantes.':'Não foi possível baixar aqui. Use os botões de STL ASCII.';}
});
function showAscii(gen,label){
  $('exp-note').textContent='Gerando o texto…';
  setTimeout(()=>{const nm=(lastCfg&&lastCfg.nome||'mistura').replace(/[^\w-]+/g,'_');const t=stlAscii(gen,`${nm}_${label}`);
    $('stl-txt').value=t;$('stl-box').hidden=false;$('copy-msg').textContent='';$('exp-note').textContent=`STL ASCII de ${label}: ${fmt(t.length/1e6,1)} MB de texto.`;},30);
}
$('b-stla').addEventListener('click',()=>showAscii(aggTriangles,'agregados'));
$('b-stlv').addEventListener('click',()=>showAscii(voidTriangles,'vazios'));
$('b-copy').addEventListener('click',()=>{const ta=$('stl-txt');
  navigator.clipboard.writeText(ta.value).then(()=>{$('copy-msg').textContent='Copiado.';},()=>{ta.focus();ta.select();$('copy-msg').textContent='Selecionei o texto. Use Ctrl+C para copiar.';});});

/* ---------- início ---------- */
try{
  loadDefault();renderCalc();renderPanel();
  initThree();
  generate();
}catch(e){showError('Falha ao iniciar: '+(e&&e.message||e));}
window.__md={get result(){return result;},eqA,eqW,composicao,readForm,wGradation};
})();
