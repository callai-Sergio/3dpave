/* ---------- cena 3D ---------- */
let renderer,scene,camera,group,instMeshes=[],skin,capTop,capBot,capCut,voidE,voidB,clipPlane,dirty=true;
const cam={th:0.75,ph:1.05,r:150,tx:0,ty:20,tz:0};
function initThree(){
  if(typeof THREE==='undefined')throw new Error('A biblioteca three.js não carregou. Verifique a conexão e recarregue a página.');
  const cv=$('c3d');
  renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});
  renderer.outputEncoding=THREE.sRGBEncoding;renderer.localClippingEnabled=true;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(32,1,1,4000);
  scene.add(new THREE.HemisphereLight(0xffffff,0x5a5550,0.75));
  const d=new THREE.DirectionalLight(0xffffff,0.9);d.position.set(120,200,140);scene.add(d);
  const f=new THREE.DirectionalLight(0xffffff,0.3);f.position.set(-150,60,-120);scene.add(f);
  group=new THREE.Group();group.rotation.x=-Math.PI/2;scene.add(group);
  clipPlane=new THREE.Plane(new THREE.Vector3(-1,0,0),1e5);
  new ResizeObserver(()=>resize()).observe($('view'));resize();
  controls(cv);
  const loop=()=>{if(dirty){updateCam();renderer.render(scene,camera);dirty=false;}requestAnimationFrame(loop);};loop();
}
function resize(){const v=$('view'),w=v.clientWidth,h=v.clientHeight;if(!renderer||!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}
function updateCam(){const s=Math.sin(cam.ph);camera.position.set(cam.tx+cam.r*s*Math.sin(cam.th),cam.ty+cam.r*Math.cos(cam.ph),cam.tz+cam.r*s*Math.cos(cam.th));camera.lookAt(cam.tx,cam.ty,cam.tz);}
function controls(cv){
  const ptrs=new Map();let mode=null,last=null,pinch0=0;
  cv.addEventListener('contextmenu',e=>e.preventDefault());
  cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,[e.clientX,e.clientY]);
    mode=(e.button===2||e.shiftKey)?'pan':'rot';last=[e.clientX,e.clientY];
    if(ptrs.size===2){const p=[...ptrs.values()];pinch0=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);mode='pinch';}});
  cv.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,[e.clientX,e.clientY]);
    if(mode==='pinch'&&ptrs.size===2){const p=[...ptrs.values()],d=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);if(pinch0>0){cam.r=Math.min(1200,Math.max(20,cam.r*pinch0/d));pinch0=d;dirty=true;}return;}
    const dx=e.clientX-last[0],dy=e.clientY-last[1];last=[e.clientX,e.clientY];
    if(mode==='rot'){cam.th-=dx*0.006;cam.ph=Math.min(3.1,Math.max(0.05,cam.ph-dy*0.006));}
    else if(mode==='pan'){const k=cam.r*0.0016,ct=Math.cos(cam.th),stt=Math.sin(cam.th);cam.tx-=dx*k*ct;cam.tz+=dx*k*stt;cam.ty+=dy*k;}
    dirty=true;});
  const up=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2&&mode==='pinch')mode=null;if(ptrs.size===1){last=[...ptrs.values()][0];mode='rot';}};
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',e=>{e.preventDefault();cam.r=Math.min(1200,Math.max(20,cam.r*Math.exp(e.deltaY*0.0012)));dirty=true;},{passive:false});
}
function lin(rgb){return new THREE.Color(rgb[0]/255,rgb[1]/255,rgb[2]/255).convertSRGBToLinear();}
function particleRGB(i){return colorMode==='s'?stonePal()[toneOf(i)]:fracColor(result.fr[i]);}
function disposeScene(){
  while(group.children.length){const o=group.children.pop();if(o.geometry)o.geometry.dispose();if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}}
  instMeshes=[];
}
function buildScene(r){
  disposeScene();
  const byT=new Map();for(let i=0;i<r.tpl.length;i++){const t=r.tpl[i];if(!byT.has(t))byT.set(t,[]);byT.get(t).push(i);}
  const m4=new THREE.Matrix4(),qq=new THREE.Quaternion(),pp=new THREE.Vector3(),ss=new THREE.Vector3();
  const mat=new THREE.MeshStandardMaterial({flatShading:true,roughness:0.92,metalness:0,side:THREE.DoubleSide,clippingPlanes:[clipPlane]});
  for(const [t,list] of byT){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(r.lib[t].v,3));g.setIndex(new THREE.BufferAttribute(r.lib[t].f,1));g.computeVertexNormals();
    const im=new THREE.InstancedMesh(g,mat,list.length);im.userData.ids=list;
    list.forEach((i,k)=>{pp.set(r.pos[3*i],r.pos[3*i+1],r.pos[3*i+2]);qq.set(r.q[4*i+1],r.q[4*i+2],r.q[4*i+3],r.q[4*i]);const s=r.sc[i];ss.set(s,s,s);
      m4.compose(pp,qq,ss);im.setMatrixAt(k,m4);im.setColorAt(k,lin(particleRGB(i)));});
    im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
    group.add(im);instMeshes.push(im);
  }
  {const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(r.meshE.pos,3));g.setIndex(new THREE.BufferAttribute(r.meshE.idx,1));g.computeVertexNormals();
    voidE=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:lin(C_VOID),roughness:0.6,side:THREE.DoubleSide,clippingPlanes:[clipPlane]}));group.add(voidE);}
  {const nb=r.bubbles.length/4,g=new THREE.IcosahedronGeometry(1,2);
    voidB=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({color:lin(C_VOID),roughness:0.6,clippingPlanes:[clipPlane]}),Math.max(nb,1));voidB.count=nb;
    const q0=new THREE.Quaternion();
    for(let k=0;k<nb;k++){const b=r.bubbles;pp.set(b[4*k],b[4*k+1],b[4*k+2]);ss.setScalar(b[4*k+3]);m4.compose(pp,q0,ss);voidB.setMatrixAt(k,m4);}
    voidB.instanceMatrix.needsUpdate=true;group.add(voidB);}
  const cg=new THREE.CylinderGeometry(r.R+0.05,r.R+0.05,r.H,128,1,true);cg.rotateX(Math.PI/2);cg.translate(0,0,r.H/2);
  skin=new THREE.Mesh(cg,new THREE.MeshStandardMaterial({color:new THREE.Color(0x1b1a19).convertSRGBToLinear(),roughness:0.85,side:THREE.DoubleSide,clippingPlanes:[clipPlane]}));group.add(skin);
  const capMat=clip=>new THREE.MeshBasicMaterial({alphaTest:0.5,side:THREE.DoubleSide,clippingPlanes:clip?[clipPlane]:[]});
  capTop=new THREE.Mesh(new THREE.PlaneGeometry(2*r.R,2*r.R),capMat(true));capTop.position.z=r.H+0.03;group.add(capTop);
  capBot=new THREE.Mesh(new THREE.PlaneGeometry(2*r.R,2*r.R),capMat(true));capBot.position.z=-0.03;group.add(capBot);
  capCut=new THREE.Mesh(new THREE.PlaneGeometry(1,1),capMat(false));group.add(capCut);
  cam.r=Math.max(r.R,r.H)*5.6;cam.tx=0;cam.ty=r.H/2;cam.tz=0;
  camC=Object.assign({},cam);viewMode='c';group.rotation.x=-Math.PI/2;group.position.y=0;
  buildAnimParts(r);
  $('cut').value=500;updateCaps(true);applyModes();
}

/* ---------- animação da compactação: molde transparente, base, soquete (pé + haste) ou placa, molde inclinado no giratório ---------- */
let mold=null,base=null,foot=null,shaft=null,viewMode='c',camA=null,camC=null,curF=0,playing=false,speed=1,accF=0,lastT=0;
function buildAnimParts(r){
  const A=r.mar&&r.mar.anim;mold=base=foot=shaft=null;
  if(!A||A.nf<2){$('animbar').hidden=true;return;}
  const metal=new THREE.MeshStandardMaterial({color:0x8d8a86,roughness:0.45,metalness:0.6});
  let ztop=0;for(let k=0;k<A.nf;k++)ztop=Math.max(ztop,Math.min(A.Z[6*k+3]-A.Z[6*k],4*r.H+40));
  const mh=Math.max(ztop,r.H)+5;
  const cg=new THREE.CylinderGeometry(r.R+0.6,r.R+0.6,mh,96,1,true);cg.rotateX(Math.PI/2);
  mold=new THREE.Mesh(cg,new THREE.MeshStandardMaterial({color:0xb9c3cc,roughness:0.3,metalness:0.2,transparent:true,opacity:0.16,side:THREE.DoubleSide,depthWrite:false}));
  mold.userData.h=mh;group.add(mold);
  const disc=new THREE.CylinderGeometry(r.R+3,r.R+3,4,96);disc.rotateX(Math.PI/2);base=new THREE.Mesh(disc,metal);group.add(base);
  const fg=new THREE.CylinderGeometry(r.R-0.5,r.R-0.5,4,96);fg.rotateX(Math.PI/2);foot=new THREE.Mesh(fg,metal);group.add(foot);
  const sg=new THREE.CylinderGeometry(7,7,90,32);sg.rotateX(Math.PI/2);shaft=new THREE.Mesh(sg,metal);group.add(shaft);
  camA={th:0.75,ph:1.15,r:Math.max(r.R*2,mh)*2.4,tx:0,ty:mh/2,tz:0};
  $('frame').max=A.nf-1;$('animbar').hidden=false;
  document.querySelectorAll('#seg-modo button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v==='c')));
  showAnimParts(false);
}
function showAnimParts(on){[mold,base,foot,shaft].forEach(o=>{if(o)o.visible=on;});}
// objetos three.js de trabalho, criados na primeira pose (a página ainda roda se o three.js não carregar)
let am4,aq,ap,as,zAxis,tAxis;
function poseParticles(P,Q,oP,oQ){
  if(!am4){am4=new THREE.Matrix4();aq=new THREE.Quaternion();ap=new THREE.Vector3();as=new THREE.Vector3();zAxis=new THREE.Vector3(0,0,1);tAxis=new THREE.Vector3();}
  for(const im of instMeshes){im.userData.ids.forEach((i,j)=>{ap.set(P[oP+3*i],P[oP+3*i+1],P[oP+3*i+2]);
    aq.set(Q[oQ+4*i+1],Q[oQ+4*i+2],Q[oQ+4*i+3],Q[oQ+4*i]);const s=result.sc[i];as.set(s,s,s);am4.compose(ap,aq,as);im.setMatrixAt(j,am4);});
    im.instanceMatrix.needsUpdate=true;}
}
function setFrame(k){
  const r=result,A=r.mar.anim,n=r.tpl.length;curF=k;
  poseParticles(A.P,A.Q,k*3*n,k*4*n);
  const zb=A.Z[6*k],zp=A.Z[6*k+1],tilt=A.Z[6*k+4],phi=A.Z[6*k+5],flip=A.F[2*k],ham=A.F[2*k+1],ok=z=>Math.abs(z)<1e5;
  // face 2 do Marshall: o molde virado aparece de cabeça para baixo, com o apoio (placa do topo) embaixo
  group.rotation.x=flip?Math.PI/2:-Math.PI/2;group.position.y=flip?zp:0;
  const floorZ=flip?zp:zb,mh=mold.userData.h;
  base.visible=ok(floorZ);base.position.set(0,0,floorZ+(flip?2:-2));
  // molde: no giratório, inclinado de tilt na direção phi, girando em torno do centro do CP
  tAxis.set(Math.sin(tilt)*Math.cos(phi),Math.sin(tilt)*Math.sin(phi),Math.cos(tilt));mold.quaternion.setFromUnitVectors(zAxis,tAxis);
  const zc=ok(zp)&&ok(zb)&&ham===2?(zb+zp)/2:null;
  mold.position.set(0,0,zc!=null?zc:flip?zp-mh/2:zb+mh/2);
  const hz=ham===1||ham===2?zp:ham===-1?zb:null,dir=ham===-1?-1:1;
  foot.visible=hz!=null&&ok(hz);shaft.visible=foot.visible&&ham!==2;
  if(foot.visible){foot.position.set(0,0,hz+dir*2);shaft.position.set(0,0,hz+dir*49);}
  $('frame').value=k;$('fnum').textContent=`${k+1} / ${A.nf}`;$('flabel').textContent=l10n(A.txt[k]);dirty=true;
}
function setViewMode(m){
  stopAnim();if(!result||!mold||m===viewMode)return;
  if(viewMode==='a')camA=Object.assign({},cam);else camC=Object.assign({},cam);
  viewMode=m;document.querySelectorAll('#seg-modo button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===m)));
  $('tb3d').hidden=m==='a';
  if(m==='c'){group.rotation.x=-Math.PI/2;group.position.y=0;poseParticles(result.pos,result.q,0,0);showAnimParts(false);Object.assign(cam,camC);
    $('flabel').textContent=l10n(`Corpo de prova compactado · AVC ${fmt(result.st.AVC,2)}%`);}
  else{Object.assign(cam,camA);showAnimParts(true);setFrame(curF);}
  applyModes();dirty=true;
}
function playAnim(){if(!result||!mold)return;if(viewMode!=='a')setViewMode('a');if(curF>=result.mar.anim.nf-1)setFrame(0);playing=true;$('b-play').textContent=l10n('❚❚ Pausar');lastT=performance.now();accF=0;requestAnimationFrame(tickAnim);}
function stopAnim(){playing=false;$('b-play').textContent=l10n('▶ Reproduzir');}
function tickAnim(t){if(!playing)return;accF+=(t-lastT)/1000*24*speed;lastT=t;
  const last=result.mar.anim.nf-1;
  if(accF>=1){const k=Math.min(last,curF+Math.floor(accF));accF-=Math.floor(accF);setFrame(k);
    if(k>=last){stopAnim();setTimeout(()=>{if(!playing&&viewMode==='a'&&curF===last)setViewMode('c');},900);return;}}
  requestAnimationFrame(tickAnim);}
$('b-play').addEventListener('click',()=>playing?stopAnim():playAnim());
$('frame').addEventListener('input',e=>{stopAnim();if(viewMode!=='a')setViewMode('a');setFrame(+e.target.value);});
function sectionCanvas(kind,idx,style){
  const r=result,nx=r.nx,ny=r.ny,nz=r.nz,sxy=nx*ny,W=kind==='z'?nx:ny,H=kind==='z'?ny:nz;
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const ctx=cv.getContext('2d'),img=ctx.createImageData(W,H),d=img.data;
  const tc=style==='tc',agcache=new Map();
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){
    const id=kind==='z'?idx*sxy+(ny-1-j)*nx+i:(nz-1-j)*sxy+i*nx+idx;
    const p=r.phase[id],o=4*(j*W+i);let c=null;
    if(p===1)c=tc?[12,12,12]:C_MAST;else if(p===2)c=tc?[245,245,245]:C_VOID;else if(p===3)c=tc?[245,245,245]:(distBub?C_BUB:C_VOID);
    else if(p===4){const L=r.lab[id]-1;if(tc){const t=toneOf(L);c=[128+t*9,128+t*9,128+t*9];}else{if(!agcache.has(L))agcache.set(L,particleRGB(L));c=agcache.get(L);}}
    if(c){d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=255;}
  }
  ctx.putImageData(img,0,0);return cv;
}
function tex(cv){const t=new THREE.CanvasTexture(cv);t.encoding=THREE.sRGBEncoding;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;return t;}
function setMap(m,cv){if(m.material.map)m.material.map.dispose();m.material.map=tex(cv);m.material.needsUpdate=true;}
function cutValue(){const r=result,f=+$('cut').value/1000;return cutMode==='z'?f*r.H:(f*2-1)*r.R;}
function updateCaps(all){
  if(!result)return;const r=result;
  if(all){setMap(capTop,sectionCanvas('z',r.nz-1));setMap(capBot,sectionCanvas('z',0));}
  const c=cutValue();
  if(cutMode==='x'){
    const ix=Math.min(r.nx-1,Math.max(0,Math.floor((c+r.R)/r.h)));
    capCut.geometry.dispose();const g=new THREE.PlaneGeometry(2*r.R,r.H);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0)));
    capCut.geometry=g;capCut.position.set(c-0.03,0,r.H/2);setMap(capCut,sectionCanvas('x',ix));
    clipPlane.normal.set(-1,0,0);clipPlane.constant=c;$('cut-lbl').textContent=`x = ${fmt(c,1)} mm`;
  }else if(cutMode==='z'){
    const iz=Math.min(r.nz-1,Math.max(0,Math.floor(c/r.h)));
    capCut.geometry.dispose();capCut.geometry=new THREE.PlaneGeometry(2*r.R,2*r.R);capCut.position.set(0,0,c-0.03);setMap(capCut,sectionCanvas('z',iz));
    clipPlane.normal.set(0,-1,0);clipPlane.constant=c;$('cut-lbl').textContent=`z = ${fmt(c,1)} mm`;
  }else{clipPlane.normal.set(-1,0,0);clipPlane.constant=1e5;$('cut-lbl').textContent='sem corte';}
  applyModes();dirty=true;
}
function applyModes(){
  if(!result)return;
  // na animação só aparecem os agregados, sem corte; o mastique, os vazios e as tampas são do CP final
  const c=viewMode!=='a';
  if(!c){clipPlane.normal.set(-1,0,0);clipPlane.constant=1e5;}
  skin.visible=c&&mastMode;capBot.visible=c&&mastMode;capTop.visible=c&&mastMode&&cutMode!=='z';capCut.visible=c&&mastMode&&cutMode!=='n';
  voidE.visible=c&&showVoids;
  voidB.material.color.copy(lin(distBub?C_BUB:C_VOID));voidB.visible=c&&showVoids&&voidB.count>0;
  $('cut').disabled=cutMode==='n';dirty=true;
}
function recolor(){
  if(!result)return;
  for(const im of instMeshes){im.userData.ids.forEach((i,k)=>im.setColorAt(k,lin(particleRGB(i))));im.instanceColor.needsUpdate=true;}
  updateCaps(true);renderLegend();if(!$('tomo').hidden)drawSection();
}
function segGroup(id,cb){const el=$(id);el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;el.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));cb(b.dataset.v);});}
segGroup('seg-mast',v=>{mastMode=v==='1';applyModes();});
segGroup('seg-modo',v=>{if(v==='c'){setViewMode('c');updateCaps(false);}else setViewMode('a');});
segGroup('seg-speed',v=>{speed=+v;});
segGroup('seg-cor',v=>{colorMode=v;recolor();});
segGroup('seg-corte',v=>{cutMode=v;$('cut').value=500;updateCaps(false);});
$('cut').addEventListener('input',()=>updateCaps(false));
$('chk-void').addEventListener('change',e=>{showVoids=e.target.checked;applyModes();});
$('chk-bub').addEventListener('change',e=>{distBub=e.target.checked;applyModes();updateCaps(true);renderLegend();if(!$('tomo').hidden)drawSection();});
segGroup('seg-tab',v=>{const t=v==='tomo';$('tomo').hidden=!t;$('c3d').hidden=t;$('tb3d').hidden=t;$('tbtomo').hidden=!t;$('hint').hidden=t;$('tomo-card').hidden=!t;if(t)drawSection();else{resize();dirty=true;}});

/* ---------- tomografia ---------- */
let secKind='z';
function initSection(){if(!result)return;$('sec').max=secKind==='z'?result.nz-1:result.nx-1;$('sec').value=Math.floor(+$('sec').max/2);if(!$('tomo').hidden)drawSection();}
segGroup('seg-sec',v=>{secKind=v;initSection();drawSection();});
$('sec').addEventListener('input',drawSection);$('chk-tc').addEventListener('change',drawSection);
function drawSection(){
  if(!result)return;const r=result,idx=+$('sec').value,cv=$('csec');
  const src=sectionCanvas(secKind,idx,$('chk-tc').checked?'tc':null);
  const box=cv.parentElement,k=Math.max(1,Math.min((box.clientWidth-24)/src.width,(box.clientHeight-112)/src.height));
  cv.width=Math.round(src.width*k);cv.height=Math.round(src.height*k);const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(src,0,0,cv.width,cv.height);
  $('sec-lbl').textContent=secKind==='z'?`z = ${fmt((idx+0.5)*r.h,1)} mm`:`x = ${fmt((idx+0.5)*r.h-r.R,1)} mm`;
  sectionStats(idx);
}
function sectionStats(idx){
  const r=result,nx=r.nx,ny=r.ny,nz=r.nz,sxy=nx*ny,W=secKind==='z'?nx:ny,H=secKind==='z'?ny:nz,h=r.h;
  let tot=0,vo=0;const q=[0,0,0,0],qt=[0,0,0,0],parts=new Map();
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){
    const id=secKind==='z'?idx*sxy+j*nx+i:j*sxy+i*nx+idx,p=r.phase[id];if(!p)continue;tot++;const v=(p===2||p===3)?1:0;vo+=v;
    if(secKind==='z'){const qd=(i>=W/2?1:0)+(j>=H/2?2:0);q[qd]+=v;qt[qd]++;}
    if(p===4){const L=r.lab[id];let a=parts.get(L);if(!a){a=[];parts.set(L,a);}a.push(i,j);}
  }
  const mf=[],ar=[];
  for(const a of parts.values()){if(a.length<16)continue;let mn=1e9,mxv=0;
    for(let k=0;k<18;k++){const t=k*Math.PI/18,c=Math.cos(t),s=Math.sin(t);let lo=1e9,hi=-1e9;for(let m=0;m<a.length;m+=2){const pr=a[m]*c+a[m+1]*s;if(pr<lo)lo=pr;if(pr>hi)hi=pr;}const wv=hi-lo+1;if(wv<mn)mn=wv;if(wv>mxv)mxv=wv;}
    mf.push(mn*h);ar.push(mn/mxv);}
  const med=x=>{if(!x.length)return NaN;const s=[...x].sort((a,b)=>a-b);return s[s.length>>1];};
  const items=[['AVC da seção',fmt(tot?vo/tot*100:0,2)+'%'],['Agregados cortados',fmt(mf.length,0)],['Mediana do Min Feret',fmt(med(mf),2)+' mm'],['Mediana do AR',fmt(med(ar),2)]];
  if(secKind==='z')items.push(['AVC por quadrante',q.map((v,k)=>fmt(qt[k]?v/qt[k]*100:0,1)).join(' · ')+'%']);
  $('tstats').innerHTML=items.map(([a,b])=>`<div><span class="lbl">${a}</span><div class="num">${b}</div></div>`).join('');
}

