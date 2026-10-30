/* ---------- composição (massa fixa, como em [W]: 1000 g em Ø102 mm) ---------- */
function interp(g,x){ // g ordenado desc; interpolação linear em log da abertura (como gradlib.interp)
  if(x>=g[0].s)return g[0].p;if(x<=g[g.length-1].s)return g[g.length-1].p;
  for(let i=1;i<g.length;i++)if(x>=g[i].s){const a=g[i],b=g[i-1],t=(Math.log(x)-Math.log(a.s))/(Math.log(b.s)-Math.log(a.s));return a.p+(b.p-a.p)*t;}
  return 0;
}
// tamanhos do CP: [massa (g), diâmetro do molde (mm), voxel (mm)]
const SIZES={p:[250,65,0.25],w:[1000,102,0.4],m:[1200,101.6,0.4],g:[4700,150,0.6]};
function composicao(cfg){
  const SZ=SIZES[cfg.size]||SIZES.p,mass=cfg.mass??SZ[0],D=cfg.D??SZ[1],R=D/2;
  const Gmm=100/((100-cfg.pb)/cfg.ra+cfg.pb/cfg.rb),Gmb=Gmm*(1-cfg.avc/100),V=mass/Gmb,H=V*1000/(Math.PI*R*R);
  const m_agg=mass*(1-cfg.pb/100),m_bit=mass*cfg.pb/100,p2=interp(cfg.grad,2),m_fino=m_agg*p2/100,m_graudo=m_agg-m_fino;
  const edges=[...new Set(cfg.grad.map(r=>r.s).filter(s=>s>2).concat([2]))].sort((a,b)=>a-b),fracoes=[];
  for(let i=0;i<edges.length-1;i++){const lo=edges[i],hi=edges[i+1],pct=interp(cfg.grad,hi)-interp(cfg.grad,lo);if(pct>0)fracoes.push([lo,hi,pct]);}
  const dmax=cfg.grad[0].s;
  return {D,H,R,V,Gmm,Gmb,mass,m_agg,m_bit,p2,m_fino,m_graudo,V_graudo:m_graudo/cfg.ra,M:m_fino/cfg.ra+m_bit/cfg.rb,V_void:V*cfg.avc/100,k250:250/mass,k1000:1000/mass,fracoes,dmax};
}

/* ---------- viscosidade do betume e do mastique na compactação ---------- */
// betume: relação A-VTS (ASTM D2493), log log η(cP) = A + VTS·log T(Rankine); A e VTS típicos por grau (valores padrão do MEPDG,
// os graus EN pelos de penetração equivalentes). Temperatura de referência: EN 12697-35:2025 Tabela 1 (η ≈ 0,28 Pa·s).
const AVTS={'35/50':[10.5254,-3.5047],'40/60':[10.5785,-3.5286],'50/70':[10.6316,-3.5524],'70/100':[11.2508,-3.7701],'100/150':[11.0897,-3.7152],'160/220':[11.8107,-4.0068],
  'PG 58-28':[11.010,-3.701],'PG 64-22':[10.980,-3.680],'PG 70-22':[10.299,-3.426],'PG 76-22':[9.715,-3.208]};
const TREF={'35/50':165,'40/60':155,'50/70':150,'70/100':145,'100/150':140,'160/220':135};
const etaBinder=(grade,T)=>{const [A,V]=AVTS[grade]||AVTS['50/70'],TR=T*1.8+32+459.67;return Math.pow(10,Math.pow(10,A+V*Math.log10(TR)))/1000;}; // Pa·s
const tRef=grade=>{if(TREF[grade])return TREF[grade];const [A,V]=AVTS[grade],TR=Math.pow(10,(Math.log10(Math.log10(280))-A)/V);return Math.round((TR-459.67-32)/1.8);};
// mastique: o fíler (< 0,075 mm) no betume e depois os finos (0,075–2 mm) nesse mastique, por Krieger–Dougherty (φmax 0,62 e 0,74)
function viscMastic(cfg,comp){
  const etaB=etaBinder(cfg.grade,cfg.temp),p0075=interp(cfg.grad,0.075),Vf=comp.m_agg*p0075/100/cfg.ra,Vb=comp.m_bit/cfg.rb,Vs=Math.max(0,comp.m_fino/cfg.ra-Vf);
  const KD=(phi,pm)=>Math.pow(1-Math.min(phi,0.95*pm)/pm,-2.5*pm),phiF=Vf/(Vf+Vb),phiS=Vs/comp.M;
  return {etaB,etaM:etaB*KD(phiF,0.62)*KD(phiS,0.74),phiF,phiS};
}

/* ---------- [A] Awuah et al. (2024), Eq. (3) e Tabela 6 — extra ---------- */
const EQA={w:[1.70e9,1.07e7,-9.90e5,5.90e5,-6.86e3],S:[6.25,-1.50e-3,-1.92e-3,-9.52e-3,-2.51e-4],F:[2.62e-1,3.97e-2,-5.13e-4,-1.00e-2,-2.62e-4],AVC:[4.36e8,-2.62e6,-2.0e5,5.62e5,2.13e2]};
const eqA=(M,NA)=>{const o={};for(const k in EQA){const b=EQA[k];o[k]=(b[0]+b[1]*M+b[2]*NA)/(1+b[3]*M+b[4]*NA);}return o;};
const LIMS={w:v=>v>=50&&v<=80,S:v=>v>6.7,F:v=>v>=2&&v<=4,AVC:v=>v>=3&&v<=5};
function eqW(NA,M,AVC){
  const den=NA-23.01*M+2106,Braw=(81.38*NA-125.2*M-170800)/den;let B=Braw,Bfb=false;
  if(!(B>=0&&B<=100)||Math.abs(den)<200){B=48;Bfb=true;}
  let BSc=(73.22*AVC+60.94*B-1065)/(AVC+426.7*B+4318),BSh=(507.9*AVC+1189*B-8587)/(AVC+910.6*B-5781),fb=false;
  if(!(BSh>=0.8&&BSh<=4)||!(BSc>=0.02&&BSc<=0.3)){BSc=0.115;BSh=1.47;fb=true;}
  return {B,BSc,BSh,fallback:fb,Bfallback:Bfb,Braw};
}

/* ---------- cores ---------- */
const STONE={WL:[[184,178,166],[164,158,147],[199,192,178],[146,141,132],[210,203,190]],WG:[[150,148,150],[118,116,120],[176,170,168],[96,94,98],[196,186,180]],
  RS:[[92,96,92],[74,78,76],[110,114,108],[64,66,66],[126,128,120]],RT:[[132,130,124],[104,104,100],[156,152,144],[86,86,84],[176,170,160]]};
// nome curto da biblioteca de formas, para a legenda e o cabeçalho
const STONE_NAME={WL:'calcário',WG:'granito',RS:'diabásio, formas reais',RT:'formas reais (F001 + F004)'};
const FRACC=[[232,197,71],[214,135,64],[91,141,196],[64,92,168],[176,72,140],[120,170,110],[150,110,200],[90,180,190]];
const C_MAST=[30,29,28],C_VOID=[226,61,40],C_BUB=[240,128,96];
const toneOf=i=>(Math.imul(i,2654435761)>>>0)%5;
const fracColor=f=>FRACC[f%FRACC.length];
const stonePal=()=>STONE[(result&&result.stone)||(lastCfg&&lastCfg.lib)||'WL'];

/* ---------- gráfico da curva granulométrica (escala potência 0,45, como no exemplo da pasta) ---------- */
function renderGradChart(){
  const g=rows.map(r=>({s:parseNum(r.s),p:parseNum(r.p)})).filter(r=>isFinite(r.s)&&r.s>0&&isFinite(r.p)).sort((a,b)=>b.s-a.s);
  const el=$('gchart');if(g.length<2){el.innerHTML='';return;}
  const W=420,Hh=170,ml=30,mr=8,mt=8,mb=30,smin=Math.min(0.075,g[g.length-1].s),smax=Math.max(...g.map(r=>r.s),band?band.pts[0][0]:0);
  const X=s=>ml+(Math.pow(s,0.45)-Math.pow(smin,0.45))/(Math.pow(smax,0.45)-Math.pow(smin,0.45))*(W-ml-mr),Y=p=>mt+(1-p/100)*(Hh-mt-mb);
  let s='';
  for(let p=0;p<=100;p+=20)s+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(p)}" y2="${Y(p)}" stroke="var(--line)"/><text x="${ml-4}" y="${Y(p)+3}" text-anchor="end" font-size="9" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${p}</text>`;
  const ticks=[0.075,0.3,0.6,1.18,2.36,4.75,9.5,12.5,19,25,37.5,50].filter(t=>t>=smin*0.99&&t<=smax*1.01);
  ticks.forEach(t=>{s+=`<line x1="${X(t)}" x2="${X(t)}" y1="${mt}" y2="${Hh-mb}" stroke="var(--line)" stroke-dasharray="2 3"/><text x="${X(t)}" y="${Hh-mb+12}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${fmt(t,t<1?(t<0.1?3:2):t<10?2:1).replace(/,?0+$/,'')}</text>`;});
  if(band&&!(band.user&&!band.band)){const pts=band.pts.filter(p=>p[1]!=null&&p[2]!=null);
    if(pts.length>1){const up=pts.map(p=>`${X(p[0])},${Y(p[2])}`),lo=pts.slice().reverse().map(p=>`${X(p[0])},${Y(p[1])}`);
      s+=`<polygon points="${up.concat(lo).join(' ')}" fill="var(--band)" fill-opacity="0.14" stroke="var(--band)" stroke-width="1.2"/>`;}
    band.pts.filter(p=>p[1]==null||p[2]==null).forEach(p=>{const v=p[1]!=null?p[1]:p[2];s+=`<line x1="${X(p[0])}" x2="${X(p[0])}" y1="${Y(p[1]!=null?p[1]:0)}" y2="${Y(p[2]!=null?p[2]:100)}" stroke="var(--band)" stroke-width="4" stroke-opacity="0.5"/>`;});}
  const dm=g[0].s,mdl=[];for(let k=0;k<=40;k++){const sv=smin*Math.pow(dm/smin,k/40);mdl.push(`${X(sv)},${Y(Math.min(100,100*Math.pow(sv/dm,0.45)))}`);}
  s+=`<polyline points="${mdl.join(' ')}" fill="none" stroke="var(--muted)" stroke-dasharray="4 3" stroke-width="1"/>`;
  s+=`<polyline points="${g.map(r=>`${X(r.s)},${Y(r.p)}`).join(' ')}" fill="none" stroke="var(--fg)" stroke-width="1.8"/>`;
  g.forEach(r=>{s+=`<circle cx="${X(r.s)}" cy="${Y(r.p)}" r="2.6" fill="var(--fg)"/>`;});
  s+=`<line x1="${X(2)}" x2="${X(2)}" y1="${mt}" y2="${Hh-mb}" stroke="var(--accent)" stroke-width="1"/><text x="${X(2)+3}" y="${mt+9}" font-size="9" fill="var(--accent)">2 mm</text>`;
  s+=`<text x="${(ml+W-mr)/2}" y="${Hh-4}" text-anchor="middle" font-size="9" fill="var(--muted)">abertura da peneira (mm), escala potência 0,45</text>`;
  el.innerHTML=`<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Curva granulométrica e faixa">${s}</svg><div class="note">Linha cheia: curva de projeto · área: faixa · tracejado: densidade máxima (n = 0,45). À direita da linha de 2 mm, os agregados entram na simulação.</div>`;
}

/* ---------- painel ---------- */
let colorMode='s',mastMode=true,cutMode='x',showVoids=true,distBub=false;
function renderLegend(){
  const c=lastCfg&&lastCfg.comp,L=$('legend');const it=[];
  const sw=(rgb,t)=>`<div><span class="sw" style="background:rgb(${rgb})"></span>${t}</div>`;
  if(colorMode==='s')it.push(sw(stonePal()[0],`Agregado (${STONE_NAME[(result&&result.stone)||(lastCfg&&lastCfg.lib)]||'calcário'}, 5 tons)`));
  else{const rel=(result&&result.rel)||(sampled&&sampled.rel);
    if(c)c.fracoes.forEach(([lo,hi],k)=>{const r=rel&&rel[k];it.push(sw(fracColor(k),`${fmt(lo,lo<10?2:1)}–${fmt(hi,hi<10?2:1)} mm${r?` · ${r.classe} · ${fmt(r.n,0)}`:''}`));});}
  it.push(sw(C_MAST,'Mastique (betume + fíler + finos < 2 mm)'));
  it.push(sw(C_VOID,distBub?'Vazio do esqueleto':'Vazio de ar'));
  if(distBub)it.push(sw(C_BUB,'Bolha no mastique'));
  L.innerHTML=it.join('');
}
function renderPanel(){
  if(!lastCfg)return;
  const cfg=lastCfg,c=cfg.comp,live=result&&!stale?result:null,NA=live?live.NA:sampled?sampled.NA:null,k=c.k250,k1=c.k1000;
  const st=live&&live.st;
  $('comp').innerHTML=[
    ['Massa total',fmt(c.mass,0)+' g'],['Molde',`Ø${fmt(c.D,0)} × ${fmt(c.H,1)} mm`],[`Betume (${fmt(cfg.pb,1)}%)`,fmt(c.m_bit,1)+' g'],
    ['Passante em 2 mm',fmt(c.p2,1)+'%'],
    ['Agregados ≥ 2 mm',`${fmt(c.m_graudo,1)} g · ${fmt(st?st.Vagg:c.V_graudo,1)} cm³`],
    ['Número de agregados NA',NA?`${fmt(NA,0)} (${fmt(NA*k1,0)} por 1000 g)`:'calculando…'],
    ['Mastique M',`${fmt(st?st.Vmast:c.M,1)} cm³ (${fmt(c.M*k1,1)} por 1000 g)`],
    ['Vazios de ar',fmt(st?st.Vesq+st.Vbol:c.V_void,2)+' cm³'],
    ['Gmm · Gmb',`${fmt(c.Gmm,3)} · ${fmt(c.Gmb,3)}`]
  ].map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('');
  const b=sampled&&sampled.bub,wi=cfg.preset&&cfg.preset.startsWith('w:')?+cfg.preset.slice(2):-1,wref=wi>=0?WMIX[wi]:null;
  const vr=[];
  if(b){vr.push(['B previsto',b.mode==='off'?'desligado':fmt(b.B,1)+'%'+(b.mode==='manual'?' (manual)':b.Bfallback?' †':'')]);
    if(b.mode!=='off')vr.push(['BSc · BSh',`${fmt(b.BSc*10,2)} mm · ${fmt(b.BSh,2)}`+(b.fallback?' *':'')]);}
  if(wref)vr.push(['Medido em [W] (B · BSc · BSh)',`${fmt(wref[9]*100,0)}% · ${fmt(wref[10]*10,1)} mm · ${fmt(wref[11],2)}`],['NA · M em [W] (1000 g)',`${fmt(wref[12],0)} · ${fmt(wref[13],1)} cm³`]);
  if(st){vr.push(['Vazios do esqueleto',`${fmt(st.Vesq,2)} cm³ (alvo ${fmt(st.VesqT,2)})`],['Bolhas',`${fmt(st.Vbol,2)} cm³ (alvo ${fmt(st.VbolT,2)}) · ${fmt(st.nBubbles,0)}`],
    ['B real',fmt(st.Breal,1)+'%'],['Mediana do diâmetro das bolhas',fmt(st.bubMed,2)+' mm'],['AVC real',fmt(st.AVC,2)+'%'],
    ['AVC por quadrante (meia altura)',st.quad.map(v=>fmt(v,1)).join(' · ')],['Sobreposição de agregados',fmt(st.over,2)+' cm³']);}
  $('voids').innerHTML=vr.map(([a,v])=>`<dt>${a}</dt><dd>${v}</dd>`).join('')+(b&&b.Bfallback&&b.mode==='auto'?`<dt class="note" style="grid-column:1/-1">† Esta mistura está fora da faixa em que a [W] Eq. (3) foi calibrada: ela daria ${fmt(b.Braw,0)}%. Usei a mediana da Tabela 3 de [W] (48%). Ajuste em Avançado › Bolhas › Manual, se quiser.</dt>`:'')+
    (b&&b.fallback?'<dt class="note" style="grid-column:1/-1">* A [W] Eq. (4) ou (5) saiu da faixa válida; usei as medianas da Tabela 3 de [W].</dt>':'')+
    (st&&st.warn?`<dt class="warn" style="grid-column:1/-1">${st.warn}</dt>`:'')+(st&&st.forced?'<dt class="warn" style="grid-column:1/-1">O esqueleto travou antes do AVC alvo; os pistões foram levados à altura final assim mesmo.</dt>':'');
  renderRadial(st);renderCompaction(st);
  // extra: Awuah
  const props=NA?eqA(c.M*k,NA*k):null,rowsP=[['w','Trabalhabilidade ω (%)'],['S','Estabilidade S (kN)'],['F','Fluência F (mm)'],['AVC','Vazios AVC (%)']];
  const cell=(kk,v)=>v==null?'—':`<span class="pill ${LIMS[kk](v)?'ok':'bad'}">${fmt(v,kk==='F'?2:1)}</span>`;
  $('props').innerHTML='<tr><th></th><th>[A] Eq. (3)</th></tr>'+rowsP.map(([kk,l])=>`<tr><td>${l}</td><td>${props?cell(kk,props[kk]):'…'}</td></tr>`).join('');
  $('propnote').textContent=NA?`Com M = ${fmt(c.M*k,1)} cm³ e NA = ${fmt(NA*k,0)} por 250 g. A Eq. (3) de Awuah et al. foi calibrada para SMA 8 de calcário, betume 40/60 e tamanho máximo de 10 mm (erro médio de ~22% fora disso), e o NA de lá vem de outra calibração de tamanho. Use só como referência.`:'Aguardando o sorteio dos agregados.';
}
function renderRadial(st){
  const el=$('radial');
  if(!st){el.innerHTML='';$('radial-note').textContent='O perfil radial de vazios aparece quando a simulação terminar.';return;}
  const W=320,Hh=150,ml=34,mr=8,mt=14,mb=26,p=st.profile,R=result.R;
  const ymax=Math.max(2,Math.ceil(Math.max(...p)/2)*2),xs=i=>ml+(i+0.5)/20*(W-ml-mr),ys=v=>mt+(1-v/ymax)*(Hh-mt-mb);
  let g='';
  for(let t=0;t<=ymax+1e-9;t+=ymax/4){g+=`<line x1="${ml}" x2="${W-mr}" y1="${ys(t)}" y2="${ys(t)}" stroke="var(--line)" stroke-width="1"/><text x="${ml-5}" y="${ys(t)+4}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${fmt(t,0)}</text>`;}
  [-R,0,R].forEach((x,i)=>{const X=ml+(x+R)/(2*R)*(W-ml-mr);g+=`<text x="${X}" y="${Hh-8}" text-anchor="${['start','middle','end'][i]}" font-size="10" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${fmt(x,0)} mm</text>`;});
  const pts=p.map((v,i)=>`${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  g+=`<polygon points="${xs(0)},${ys(0)} ${pts} ${xs(19)},${ys(0)}" fill="var(--accent)" fill-opacity="0.12"/><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  p.forEach((v,i)=>{g+=`<circle cx="${xs(i)}" cy="${ys(v)}" r="2.5" fill="var(--accent)"/>`;});
  g+=`<line x1="${ml}" x2="${W-mr}" y1="${ys(st.AVC)}" y2="${ys(st.AVC)}" stroke="var(--fg)" stroke-dasharray="3 3" stroke-width="1"/>`;
  el.innerHTML=`<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Perfil radial de vazios"><text x="${ml}" y="9" font-size="10" fill="var(--muted)">AVC (%) em 20 faixas ao longo do diâmetro · terço central</text>${g}</svg>`;
  const wall=(p[0]+p[1]+p[18]+p[19])/4,mid=p.slice(7,13).reduce((a,b)=>a+b,0)/6;
  $('radial-note').textContent=`Junto às paredes: ${fmt(wall,1)}% · centro: ${fmt(mid,1)}%. ${wall>mid?'O perfil tem forma de banheira, como em [W] Fig. 16.':'O perfil não tem forma de banheira.'} A linha tracejada é o AVC médio.`;
}
// ---------- compactação: protocolo, AVC previsto ou esforço de ajuste, curva AVC × golpe/giro e perfil vertical ----------
function renderCompaction(st){
  const cfg=lastCfg,c=cfg.comp,C=st&&st.comp,el=$('ccomp');
  if(!C){el.innerHTML='<dt class="note" style="grid-column:1/-1">A compactação aparece quando a simulação terminar.</dt>';$('cchart').innerHTML='';$('vprof').innerHTML='';$('vprof-note').textContent='';return;}
  const pill=(v,ok,warn,txt)=>`<span class="pill ${ok?'ok':warn?'':'bad'}">${txt}</span>`,I=C.info||{},rows=[];
  const pname={marshall:'Marshall',giratorio:'Giratório (SGC)',w:'[W] pistões'}[C.proto];
  rows.push(['Protocolo',pname],['Motor da física',C.motor&&C.motor.nome==='C'?`C compilado · ${C.motor.threads} núcleos`:'JavaScript (navegador)'],['Modo de AVC',C.locked||C.stalled?'travado':'livre']);
  if(C.proto==='marshall')rows.push(['Golpes por face',I.ns<I.golpes?`${I.golpes} (${I.ns} simulados)`:fmt(I.golpes,0)]);
  if(C.proto==='giratorio')rows.push(['Giros',I.ns<I.N?`${I.N} (${I.ns} simulados)`:fmt(I.N,0)]);
  if(I.film!=null)rows.push(['Película de mastique (entre pedras)',fmt(I.film,2)+' mm']);
  if(C.Hsolto!=null)rows.push(['Altura solta, após a queda',`${fmt(C.Hsolto,1)} mm · AVC ${fmt(I.AVCsolto,1)}%`]);
  if(C.proto!=='w')rows.push([C.proto==='marshall'?'Altura após os golpes':'Altura após os giros',`${fmt(C.Hcomp,1)} mm · AVC ${fmt(C.AVCcomp,1)}%`]);
  if(C.locked){const e=C.esforco*100;rows.push(['AVC alvo',fmt(cfg.avc,1)+'%'],['Esforço de ajuste',pill(e,e<=10,e<=25,fmt(e,0)+'%')]);}
  else if(C.stalled)rows.push(['AVC alvo',fmt(cfg.avc,1)+'%'],['AVC final (o esqueleto travou)',pill(0,false,false,fmt(C.AVCcp,2)+'%')]);
  else{const d=C.AVCcp-cfg.avc;rows.push(['AVC previsto',fmt(C.AVCcp,2)+'%'],['AVC de referência (campo AVC)',`${fmt(cfg.avc,1)}% · diferença ${d>=0?'+':''}${fmt(d,2)} pp`]);}
  if(st.pen){const p=st.pen.max*100;rows.push(['Penetração máx. entre pedras (K33)',pill(p,p<=2,p<=4,fmt(p,2)+'% do Min Feret')],['Pares acima de 2%',fmt(st.pen.nBad,0)]);}
  el.innerHTML=rows.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('')+(C.locked&&C.esforco>0.25?'<dt class="warn" style="grid-column:1/-1">A maior parte da compactação veio do ajuste final: os golpes ou giros não chegaram perto do AVC alvo. Veja o modo livre ou a calibração em Avançado.</dt>':'');
  // curva AVC × golpe/giro
  const h=C.hist||[];
  if(h.length>1){const W=320,Hh=170,ml=34,mr=8,mt=16,mb=26,area=Math.PI*c.R*c.R/1000,Vs=c.V_graudo+c.M,avc=x=>100*(area*x-Vs)/(area*x);
    const xs=h.map(p=>p[0]),ys=h.map(p=>avc(p[1])).concat([cfg.avc]),xmax=Math.max(...xs),ymin=Math.max(0,Math.floor(Math.min(...ys)-1)),ymax=Math.ceil(Math.max(...ys)+1);
    const X=x=>ml+x/xmax*(W-ml-mr),Y=y=>mt+(1-(y-ymin)/(ymax-ymin))*(Hh-mt-mb);let g='';
    for(let k=0;k<=4;k++){const y=ymin+(ymax-ymin)*k/4;g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(y)}" y2="${Y(y)}" stroke="var(--line)"/><text x="${ml-5}" y="${Y(y)+3}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${fmt(y,0)}</text>`;}
    [0,xmax/2,xmax].forEach((x,i)=>{g+=`<text x="${X(x)}" y="${Hh-8}" text-anchor="${['start','middle','end'][i]}" font-size="10" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${fmt(x,0)}</text>`;});
    if(C.proto==='marshall'){const m=xmax/2;g+=`<line x1="${X(m)}" x2="${X(m)}" y1="${mt}" y2="${Hh-mb}" stroke="var(--muted)" stroke-dasharray="2 3"/>`;}
    g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(cfg.avc)}" y2="${Y(cfg.avc)}" stroke="var(--fg)" stroke-dasharray="4 3"/>`;
    const pts=h.map(p=>`${X(p[0]).toFixed(1)},${Y(avc(p[1])).toFixed(1)}`).join(' ');
    g+=`<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>`+h.map(p=>`<circle cx="${X(p[0])}" cy="${Y(avc(p[1]))}" r="2.3" fill="var(--accent)"/>`).join('');
    $('cchart').innerHTML=`<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="AVC por golpe ou giro"><text x="${ml}" y="10" font-size="10" fill="var(--muted)">AVC (%) × ${C.proto==='marshall'?'golpes acumulados (faces 1 e 2)':'giros'} · tracejado: AVC alvo</text>${g}</svg>`;}
  else $('cchart').innerHTML='';
  // perfil vertical (K31): AVC por fatia de altura, da base ao topo
  const p=st.vprofile;if(!p){$('vprof').innerHTML='';return;}
  const W=320,Hh=150,ml=34,mr=8,mt=16,mb=26,ymax=Math.max(2,Math.ceil(Math.max(...p)/2)*2),xs=i=>ml+(i+0.5)/20*(W-ml-mr),ys=v=>mt+(1-v/ymax)*(Hh-mt-mb);let g='';
  for(let t=0;t<=ymax+1e-9;t+=ymax/4)g+=`<line x1="${ml}" x2="${W-mr}" y1="${ys(t)}" y2="${ys(t)}" stroke="var(--line)"/><text x="${ml-5}" y="${ys(t)+4}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${fmt(t,0)}</text>`;
  g+=`<text x="${ml}" y="${Hh-8}" font-size="10" fill="var(--muted)">base</text><text x="${W-mr}" y="${Hh-8}" text-anchor="end" font-size="10" fill="var(--muted)">topo</text>`;
  const pts=p.map((v,i)=>`${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  g+=`<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>`+p.map((v,i)=>`<circle cx="${xs(i)}" cy="${ys(v)}" r="2.3" fill="var(--accent)"/>`).join('');
  g+=`<line x1="${ml}" x2="${W-mr}" y1="${ys(st.AVC)}" y2="${ys(st.AVC)}" stroke="var(--fg)" stroke-dasharray="3 3"/>`;
  $('vprof').innerHTML=`<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Perfil vertical de vazios"><text x="${ml}" y="10" font-size="10" fill="var(--muted)">AVC (%) em 20 fatias da base ao topo</text>${g}</svg>`;
  const face=(p[0]+p[19])/2,core=p.slice(7,13).reduce((a,b)=>a+b,0)/6;
  $('vprof-note').textContent=`Junto às faces: ${fmt(face,1)}% · miolo: ${fmt(core,1)}%. ${face>core?'Mais vazios nas faces, como na tomografia de CPs reais (banheira vertical).':'O miolo tem mais vazios que as faces.'}`;
}
function renderCalc(){
  const NA=+$('s-NA').value,M=+$('s-M').value,AVC=+$('s-AVC').value;
  $('v-NA').textContent=fmt(NA,0);$('v-M').textContent=fmt(M,1)+' cm³';$('v-AVC').textContent=fmt(AVC,1)+'%';
  const w=eqW(NA,M,AVC),mean=10*w.BSc*gammaFn(1+1/w.BSh);
  const box=(l,v)=>`<div>${l}<b>${v}</b></div>`;
  $('calc-out').innerHTML=box('B, bolhas nos vazios',w.Bfallback?`48% †<span class="note" style="display:block;font-weight:400">Eq. (3) daria ${fmt(w.Braw,0)}%: fora da faixa</span>`:fmt(w.B,1)+'%')+box('BSc · BSh',`${fmt(w.BSc*10,2)} mm · ${fmt(w.BSh,2)}${w.fallback?' *':''}`)+box('Diâmetro médio',fmt(mean,2)+' mm')+box('Bolhas por 1000 g',fmt(1000/((lastCfg&&lastCfg.comp.Gmb)||2.4)*AVC/100*w.B/100,1)+' cm³');
  const aM=+$('s-aM').value,aNA=+$('s-aNA').value,a=eqA(aM,aNA);
  $('v-aM').textContent=fmt(aM,1)+' cm³';$('v-aNA').textContent=fmt(aNA,0);
  const ab=(l,v,ok)=>`<div>${l}<b style="color:var(--${ok?'ok':'bad'})">${v}</b></div>`;
  $('acalc-out').innerHTML=ab('ω (%)',fmt(a.w,1),LIMS.w(a.w))+ab('S (kN)',fmt(a.S,2),LIMS.S(a.S))+ab('F (mm)',fmt(a.F,2),LIMS.F(a.F))+ab('AVC (%)',fmt(a.AVC,2),LIMS.AVC(a.AVC));
}
function gammaFn(x){const g=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  if(x<0.5)return Math.PI/(Math.sin(Math.PI*x)*gammaFn(1-x));x-=1;let a=0.99999999999980993;const t=x+7.5;for(let i=0;i<8;i++)a+=g[i]/(x+i+1);return Math.sqrt(2*Math.PI)*Math.pow(t,x+0.5)*Math.exp(-t)*a;}
['s-M','s-NA','s-AVC','s-aM','s-aNA'].forEach(id=>$(id).addEventListener('input',renderCalc));

function onInputs(){
  const {cfg,errs}=readForm();showErrs(errs);updateBandCells();renderGradChart();
  $('h-nome').textContent=cfg.nome;$('form').dataset.p=cfg.proto;
  $('n-proto').textContent=cfg.proto==='marshall'?'A mistura cai no molde com gravidade e recebe os golpes do soquete nas duas faces (DNER-ME 043 / ASTM D6926).':
    cfg.proto==='giratorio'?'A mistura cai no molde e é compactada com pressão constante e o molde inclinado girando (AASHTO T 312). O corpo de prova é o do giratório: 4700 g em Ø150 mm.':
    'Método de Wan et al. (2024): sem gravidade e sem atrito, pistões até AVC 50% e força crescente até o AVC alvo.';
  $('n-avcmode').textContent=cfg.avcMode==='livre'?'A altura final medida define o AVC do CP. Compare o AVC previsto com o do laboratório.':
    'Se a compactação não chegar à altura do AVC alvo, um ajuste leva até lá, com a mesma física. O painel mostra quanto da compactação foi pelo ajuste.';
  if(Object.keys(errs).length)return;
  const comp=composicao(cfg);
  if(cfg.proto!=='w'){const v=viscMastic(cfg,comp);
    $('n-visc').textContent=`Viscosidade estimada a ${fmt(cfg.temp,0)} °C: betume ${fmt(v.etaB,2)} Pa·s; mastique com fíler e finos ${fmt(v.etaM,1)} Pa·s. Referência EN 12697-35 para ${cfg.grade}: ${fmt(tRef(cfg.grade),0)} °C.`;}
  const slow=cfg.size==='g'?' O molde de Ø150 mm pode levar mais de 1 hora no navegador.':cfg.size!=='p'?' Leva de 10 a 40 min no navegador.':'';
  $('n-size').textContent=`Altura calculada pela densidade: ${fmt(comp.H,1)} mm.${slow}`;
  // TNM: uma peneira acima da primeira com menos de 90% passante; molde deve ter pelo menos 4 × TNM
  const gi=cfg.grad.findIndex(r=>r.p<90),tnm=gi>0?cfg.grad[gi-1].s:cfg.grad[0].s;
  const big=4*tnm>comp.D+1e-9;$('w-size').hidden=!big;if(big)$('w-size').textContent=`O TNM de ${fmt(tnm,1)} mm pede um molde de pelo menos Ø${fmt(4*tnm,0)} mm. Use uma faixa mais fina.`;
  if(running)return;
  const sig=c=>JSON.stringify([c.comp,c.lib,c.seed,c.proto,c.avcMode,c.golpes,c.gsim,c.ngir,c.gsimg,c.press,c.ang,c.grade,c.temp,c.lam,c.etaK,c.escE,c.escP,c.faceW]);
  const prev=lastCfg,changed=!prev||sig(prev)!==sig(Object.assign({},cfg,{comp}));
  if(changed&&result){stale=true;sampled=null;$('stale-note').hidden=false;}
  lastCfg=Object.assign(cfg,{comp});
  renderPanel();renderLegend();
}

/* ---------- worker ---------- */
let workerURL=null;
function getWorkerURL(){if(!workerURL)workerURL=URL.createObjectURL(new Blob([$('worker-src').textContent],{type:'text/javascript'}));return workerURL;}
const STAGES=['comp','formas','mistura','compac','pintura','bolhas','pronto'];
const STAGE_W={comp:[0,2],formas:[2,6],mistura:[6,20],compac:[20,86],pintura:[86,93],bolhas:[93,99],pronto:[100,100]};
const STAGE_ALIAS={queda:'mistura',golpes:'compac',giros:'compac'};
function setStage(s,pct,text){
  s=STAGE_ALIAS[s]||s;const i=STAGES.indexOf(s);
  document.querySelectorAll('#steps li').forEach((li,k)=>{li.classList.toggle('done',k<i);li.classList.toggle('on',k===i);});
  const [a,b]=STAGE_W[s]||[0,100];$('pbar').style.width=(a+(b-a)*Math.min(Math.max(pct||0,0),1))+'%';
  if(text!=null)$('ptext').textContent=text;
}
function generate(){
  const {cfg,errs}=readForm();showErrs(errs);
  if(Object.keys(errs).length){$('e-grad').scrollIntoView({block:'nearest'});return;}
  const comp=composicao(cfg);
  if(!comp.fracoes.length){showErrs({grad:'Não há agregados acima de 2 mm nesta granulometria.'});return;}
  lastCfg=Object.assign(cfg,{comp});sampled=null;stale=false;$('stale-note').hidden=true;
  const c=band;
  const pname=cfg.proto==='marshall'?`Marshall ${cfg.golpes} golpes`:cfg.proto==='giratorio'?`giratório ${cfg.ngir} giros`:'[W] pistões';
  $('h-spec').textContent=`${c?(c.user?c.des:`${c.norma} · ${c.des}`):`Wan et al. (2024), Tabela 1`} · ${STONE_NAME[cfg.lib]}${cfg.lib[0]==='W'?' [W]':''} · betume ${fmt(cfg.pb,1)}% · AVC ${fmt(cfg.avc,1)}%${cfg.avcMode==='livre'?' (livre)':''} · ${fmt(comp.mass,0)} g em Ø${fmt(comp.D,1)} mm · ${pname}`;
  renderPanel();renderLegend();setExport(false);
  if(worker)worker.terminate();
  stopAnim();$('animbar').hidden=true;
  running=true;$('overlay').hidden=false;$('errbox').textContent='';setStage('comp',1,'Composição calculada');
  try{worker=new Worker(getWorkerURL());}catch(e){running=false;showError('Não consegui iniciar o Web Worker: '+e.message);return;}
  worker.onmessage=ev=>{const m=ev.data;
    if(m.type==='progress')setStage(m.stage,m.pct,m.text);
    else if(m.type==='nativo'){nativoPoll(m.on);if(m.erro)console.warn('mdsim falhou; a simulação segue em JavaScript:',m.erro);}
    else if(m.type==='sampled'){sampled=m;renderPanel();renderLegend();
      $('ptext').textContent=`${fmt(m.NA,0)} agregados sorteados (${fmt(m.NA*comp.k1000,0)} por 1000 g)`;}
    else if(m.type==='done'){running=false;result=Object.assign(m.res,{stone:cfg.lib});setStage('pronto',1,`Pronto em ${fmt(m.res.tTotal,0)} s`);
      try{buildScene(result);}catch(e){showError('Falha ao montar a cena 3D: '+e.message);return;}
      renderPanel();renderLegend();setExport(true);setTimeout(()=>{if(!running)$('overlay').hidden=true;},700);initSection();
      if(result.mar&&result.mar.anim&&result.mar.anim.nf>1&&cfg.proto==='marshall'){setTimeout(()=>{if(!running){setViewMode('a');setFrame(0);playAnim();}},800);}}
    else if(m.type==='error'){running=false;showError('Erro na simulação: '+m.message);}
  };
  worker.onerror=e=>{running=false;showError('Erro no worker: '+(e.message||'desconhecido'));};
  const msg=workerMsg(cfg,comp);
  nativoInfo().then(nat=>{if(nat)msg.native=nat;worker.postMessage(msg);});
}
// F10: no mini app Python (pacote/), o servidor local roda o núcleo em C (mdsim). Fora dele, native/info não existe e
// a física roda em JavaScript
let nativoCache;
function nativoInfo(){
  if(nativoCache!==undefined)return Promise.resolve(nativoCache);
  if(!/^https?:$/.test(location.protocol))return Promise.resolve(nativoCache=null);
  const base=new URL('.',location.href).href;
  return fetch(base+'native/info').then(r=>r.ok?r.json():null).then(j=>nativoCache=j&&j.ok?{base,token:j.token,threads:j.threads}:null).catch(()=>nativoCache=null);
}
// enquanto o mdsim roda, o worker fica bloqueado; a página lê o progresso direto do servidor
let nativoTimer=null;
function nativoPoll(on){
  clearInterval(nativoTimer);nativoTimer=null;if(!on||!nativoCache)return;
  nativoTimer=setInterval(()=>fetch(`${nativoCache.base}native/progress?t=${encodeURIComponent(nativoCache.token)}`).then(r=>r.ok?r.json():null)
    .then(p=>{if(p&&p.stage&&running)setStage(p.stage,p.pct,p.text);}).catch(()=>{}),400);
}
// mensagem ao worker (a mesma que o harness de estresse monta em stress/engine.mjs)
function workerMsg(cfg,comp){
  const v=cfg.proto!=='w'?viscMastic(cfg,comp):{etaM:0};
  return {comp:{R:comp.R,H:comp.H,V:comp.V,mass:comp.mass,m_agg:comp.m_agg,fracoes:comp.fracoes,k250:comp.k250,k1000:comp.k1000,V_void:comp.V_void,M:comp.M,V_graudo:comp.V_graudo},
    rhoA:cfg.ra,seed:cfg.seed,lib:cfg.lib,bub:cfg.bub,seg:cfg.seg,avc:cfg.avc,voxel:(SIZES[cfg.size]||SIZES.p)[2],dt:2e-5,coat:0.25,
    proto:cfg.proto,avcMode:cfg.avcMode,faceW:cfg.faceW,
    mastic:{eta:v.etaM,lam:cfg.lam,etaK:cfg.etaK,kf:0.05,coh:0.005,mu:0.2},
    marshall:{golpes:cfg.golpes,sim:cfg.gsim,escE:cfg.escE},
    gir:{N:cfg.ngir,sim:cfg.gsimg,P:cfg.press,escP:cfg.escP,ang:cfg.ang,Tg:0.04}};
}
function showError(msg){$('overlay').hidden=false;$('errbox').textContent=msg;$('ptext').textContent='';}
$('form').addEventListener('submit',e=>{e.preventDefault();generate();});

