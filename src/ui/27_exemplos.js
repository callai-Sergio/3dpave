/* ---------- resultados salvos e exemplos prontos (O2/O3) ----------
   Arquivo .mdres.gz = gzip de [u32 tamanho do cabeçalho][cabeçalho JSON: formato, nome, formulário, números de conferência][saída do mdsim].
   Abrir um arquivo preenche o formulário e roda o app normal, mas a compactação (a parte lenta) sai do arquivo; só voxels, mastique e
   bolhas são refeitos. Salvar grava o que o núcleo em C acabou de calcular. Os exemplos do pacote (exemplos/index.json) usam o mesmo formato. */
const FORM_IDS=['f-nome','f-seed','f-lib','f-pb','f-avc','f-ra','f-rb','f-proto','f-size','f-avcmode','f-golpes','f-gsim','f-ngir','f-gsimg','f-press','f-ang','f-grade','f-temp',
  'f-bub','f-bB','f-bSc','f-bSh','f-lam','f-etak','f-escE','f-escP','f-facew','f-segk'];
function formSnap(){
  const vals={};FORM_IDS.forEach(id=>vals[id]=$(id).value);
  return {curve:preset.replace(/^lib:/,''),preset,rows:rows.map(r=>({s:r.s,p:r.p})),vals,checks:{'f-seg':$('f-seg').checked}};
}
function restoreForm(f){
  const vals=f.vals||{};
  if(/^w:\d+$/.test(f.preset||''))loadW(+f.preset.slice(2));else loadCurve(f.curve);
  if(f.rows&&f.rows.length)setRows(f.rows);
  if('f-proto' in vals)$('f-proto').value=vals['f-proto'];
  syncSize();
  for(const id in vals)if(id!=='f-proto')$(id).value=vals[id];
  for(const id in (f.checks||{}))$(id).checked=f.checks[id];
  syncForm();onInputs();
}
async function gunzip(buf){return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}
async function abrirMdres(gzbuf){
  let buf,h,jl;
  try{buf=await gunzip(gzbuf);jl=new DataView(buf).getUint32(0,true);h=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,4,jl)));}
  catch(e){throw new Error('o arquivo não é um resultado do Marshall Simulator');}
  if(h.formato!==1)throw new Error(`o arquivo é de um formato mais novo (v${h.formato}); atualize o app`);
  restoreForm(h.form);
  generate({replay:buf.slice(4+jl),na:h.na});
}
function setSalvar(off){$('b-save').disabled=!!off||!(result&&result.rawOut&&!running);}
// metade dos quadros da animação (os pares e o último): o arquivo cai quase à metade e a animação segue fluida (igual a stress/gerar_exemplos.mjs)
function podarQuadros(buf){
  const jl=new DataView(buf).getUint32(0,true),H=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,4,jl))),n=H.n,nf=H.nf;
  if(nf<=240)return buf;
  const keep=[];for(let k=0;k<nf;k+=2)keep.push(k);if(keep[keep.length-1]!==nf-1)keep.push(nf-1);
  const u=new Uint8Array(buf);let off=4+jl;const seg=b=>{const s=u.subarray(off,off+b);off+=b;return s;};
  const pos=seg(24*n),q=seg(32*n),P=seg(12*n*nf),Q=seg(16*n*nf),Z=seg(24*nf),F=seg(2*nf),rest=u.subarray(off);
  const pick=(b,w)=>keep.map(k=>b.subarray(k*w,(k+1)*w));
  H.nf=keep.length;H.txt=keep.map(k=>H.txt[k]);
  const js=new TextEncoder().encode(JSON.stringify(H)),hd=new Uint8Array(4);new DataView(hd.buffer).setUint32(0,js.length,true);
  return new Blob([hd,js,pos,q,...pick(P,12*n),...pick(Q,16*n),...pick(Z,24),...pick(F,2),rest]);
}
async function salvarMdres(){
  const r=result;if(!r||!r.rawOut)return;
  const nm=(runForm.vals['f-nome']||'mistura').replace(/[^\w-]+/g,'_')+'_'+runForm.vals['f-proto']+'.mdres.gz',note=$('exp-note');
  note.textContent='Gravando o resultado…';
  const cab=new TextEncoder().encode(JSON.stringify({formato:1,nome:runForm.vals['f-nome'],form:runForm,tDem:r.st.tDem,threads:r.st.comp.motor.threads,avc:r.st.AVC,na:r.NA,criado:new Date().toISOString()}));
  const n4=new Uint8Array(4);new DataView(n4.buffer).setUint32(0,cab.length,true);
  const blob=await new Response(new Blob([n4,cab,podarQuadros(r.rawOut)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  if(window.pywebview&&window.pywebview.api&&window.pywebview.api.save_file){
    const b64=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]);fr.readAsDataURL(blob);});
    const path=await window.pywebview.api.save_file(nm,b64);note.textContent=path?`Resultado salvo em ${path} (${fmt(blob.size/1e6,1)} MB).`:'Salvamento cancelado.';return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nm;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);note.textContent=`Arquivo ${nm} baixado (${fmt(blob.size/1e6,1)} MB).`;
}
$('b-save').addEventListener('click',()=>{salvarMdres().catch(e=>{$('exp-note').textContent='Não consegui salvar: '+(e&&e.message||e);});});
$('b-open').addEventListener('click',()=>{if(!running&&typeof DecompressionStream!=='undefined')$('f-open').click();});
$('f-open').addEventListener('change',async()=>{
  const f=$('f-open').files[0];$('f-open').value='';if(!f||running)return;
  try{$('overlay').hidden=false;$('errbox').textContent='';$('ptext').textContent='Abrindo o resultado…';await abrirMdres(await f.arrayBuffer());}
  catch(err){showError('Não consegui abrir o resultado: '+(err&&err.message||err));}
});

// exemplos do pacote: só o servidor local traz a pasta exemplos/; no HTML solto o menu fica oculto
let EXEMPLOS=[];
function exNota(){
  const e=EXEMPLOS[$('ex-sel').selectedIndex];
  $('n-ex').textContent=e?`${e.nota} · calculado em ${fmt(e.tDem,0)} s no servidor (${e.threads} threads) · AVC ${fmt(e.avc,2)}% · ${fmt(e.na,0)} partículas`:'';
}
async function abrirExemplo(){
  const e=EXEMPLOS[$('ex-sel').selectedIndex];if(!e||running)return;
  $('b-ex').disabled=true;
  try{
    $('overlay').hidden=false;$('errbox').textContent='';$('ptext').textContent='Carregando o exemplo…';
    const r=await fetch(`exemplos/${e.arquivo}`);if(!r.ok)throw new Error('HTTP '+r.status);
    await abrirMdres(await r.arrayBuffer());
  }catch(err){showError('Não consegui abrir o exemplo: '+(err&&err.message||err));}
  finally{$('b-ex').disabled=false;}
}
if(/^https?:$/.test(location.protocol)){
  fetch('exemplos/index.json').then(r=>r.ok?r.json():null).then(j=>{
    if(!j||!j.length||typeof DecompressionStream==='undefined')return;
    EXEMPLOS=j;$('ex-sel').innerHTML=j.map((e,i)=>`<option value="${i}">${e.nome}</option>`).join('');
    $('ex-box').hidden=false;exNota();$('ex-sel').addEventListener('input',exNota);$('b-ex').addEventListener('click',abrirExemplo);
  }).catch(()=>{});
}
