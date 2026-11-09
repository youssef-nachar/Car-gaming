/* STREET RACING 41000 — Graphics Edition
   Sunset / night city, textured facades with lit windows, PBR car paint + reflections,
   headlight beams, particles, building collisions, minimap, nitro and engine audio.
   Keys (host): WASD/arrows drive, SHIFT nitro, N day/night. Add ?night to the URL to start at night. */
(() => {
'use strict';
if(!window.THREE){console.error('Three.js unavailable');return}
const THREE=window.THREE,canvas=document.querySelector('#gameCanvas'),clamp=THREE.MathUtils.clamp;
function $(s){return document.querySelector(s)}
const roomCode='RACE-'+Math.floor(1000+Math.random()*9000);
$('#room-code').textContent=roomCode;
const statusEl=$('#host-status'),pill=$('#connection-pill');
function setStatus(msg,online=false){statusEl.textContent=msg;pill.textContent=online?'● ONLINE':'● CONNECTING';pill.style.color=online?'#c8ff4d':'#ffcf65'}
const peer=new Peer(roomCode,{debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'}]}});
const players=new Map(),keys=Object.create(null),solids=[],bMats=[];
let paused=false,started=false,startedAt=0,lastFrame=performance.now(),tod=/night/.test(location.search)?'night':'sunset',camFov=62,view=/fp/.test(location.search)?1:0;
const MAX_PLAYERS=8,CITY={limit:116,spacing:28,road:11.5},S=CITY.spacing,R=CITY.road/2;
const MAX_LIVES=6,RESPAWN_LIVES=3,PICKUP_EVERY=20,WRECK_TIME=5;let pickup=null,pickupTimer=PICKUP_EVERY;

/* ---------- renderer, lights, sky ---------- */
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xe9a982,60,260);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,600);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
const hemi=new THREE.HemisphereLight(0xffffff,0x444444,.5);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,2);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
const sc=sun.shadow.camera;sc.left=sc.bottom=-75;sc.right=sc.top=75;sc.near=1;sc.far=320;sun.shadow.bias=-.0004;sun.shadow.normalBias=.05;scene.add(sun,sun.target);
const sunDir=new THREE.Vector3();
const sky=new THREE.Mesh(new THREE.SphereGeometry(450,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
 uniforms:{top:{value:new THREE.Color()},mid:{value:new THREE.Color()},hor:{value:new THREE.Color()},sunCol:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3()}},
 vertexShader:'varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform vec3 top,mid,hor,sunCol,sunDir;varying vec3 v;void main(){float h=clamp(v.y,0.,1.);vec3 c=mix(hor,mid,smoothstep(0.,.25,h));c=mix(c,top,smoothstep(.2,.9,h));float s=max(dot(normalize(v),sunDir),0.);c+=sunCol*(pow(s,500.)*3.+pow(s,7.)*.4);gl_FragColor=vec4(c,1.);}'}));
sky.frustumCulled=false;scene.add(sky);
const TODS={
 sunset:{top:0x2a4f8f,mid:0xe38b69,hor:0xffc48c,fog:0xe9a982,sunC:0xffb26b,sunI:2.6,sunPos:[-80,34,-60],hemiS:0xffd9bc,hemiG:0x4a5340,hemiI:.5,win:.5,glow:.3,beam:.05,expo:1.05},
 night:{top:0x040916,mid:0x0e1e42,hor:0x2a3c68,fog:0x111a30,sunC:0x9db8ff,sunI:.8,sunPos:[40,80,-50],hemiS:0x5e7bc0,hemiG:0x182028,hemiI:.25,win:1.7,glow:1,beam:.22,expo:1}
};
const pm=new THREE.PMREMGenerator(renderer);let envRT=null;
function genEnv(){const s=new THREE.Scene();sky.position.set(0,0,0);scene.remove(sky);s.add(sky);if(envRT)envRT.dispose();envRT=pm.fromScene(s,0,1,1000);s.remove(sky);scene.add(sky);scene.environment=envRT.texture}

/* ---------- textures & materials ---------- */
function ctex(w,h,draw,rep=true){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;if(rep)t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t}
const glowTex=ctex(64,64,g=>{const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.35,'rgba(255,255,255,.35)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64)},false);
const asphalt=ctex(256,256,(g,w,h)=>{g.fillStyle='#49515a';g.fillRect(0,0,w,h);for(let i=0;i<5000;i++){const v=60+Math.random()*60|0;g.fillStyle=`rgba(${v},${v+4},${v+8},.5)`;g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5)}});
const grassTex=ctex(256,256,(g,w,h)=>{g.fillStyle='#557d4a';g.fillRect(0,0,w,h);for(let i=0;i<3500;i++){g.fillStyle=Math.random()<.5?'rgba(120,165,90,.35)':'rgba(40,80,40,.35)';g.fillRect(Math.random()*w,Math.random()*h,2,3)}});
grassTex.repeat.set(60,60);
const asphaltZ=asphalt.clone();asphaltZ.needsUpdate=true;asphalt.repeat.set(29,1.44);asphaltZ.repeat.set(1.44,29);
const facadeMap=ctex(256,256,(g,w,h)=>{g.fillStyle='#f4f1ea';g.fillRect(0,0,w,h);for(let r=0;r<8;r++)for(let c=0;c<8;c++){const x=c*32,y=r*32;g.fillStyle='rgba(0,0,0,.08)';g.fillRect(x,y+30,32,2);const gr=g.createLinearGradient(0,y+5,0,y+27);gr.addColorStop(0,'#5d7f96');gr.addColorStop(1,'#1f3140');g.fillStyle=gr;g.fillRect(x+6,y+5,20,22);g.fillStyle='rgba(255,255,255,.25)';g.fillRect(x+6,y+5,20,2);g.fillStyle='#e9e6dd';g.fillRect(x+15,y+5,2,22)}});
const facadeEm=ctex(256,256,(g,w,h)=>{g.fillStyle='#000';g.fillRect(0,0,w,h);for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(Math.random()<.42){g.fillStyle=['#ffd9a0','#ffe9c4','#ffc177','#bcd8ff'][Math.random()*4|0];g.fillRect(c*32+6,r*32+5,20,22)}});
const mat=(c,r=.88,m=0)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
const M={grass:new THREE.MeshStandardMaterial({map:grassTex,roughness:1}),grass2:mat(0x6a9157),roadX:new THREE.MeshStandardMaterial({map:asphalt,roughness:.6,envMapIntensity:.8}),roadZ:new THREE.MeshStandardMaterial({map:asphaltZ,roughness:.6,envMapIntensity:.8}),
 side:mat(0xb9b9ac),line:mat(0xe9dfb8),white:mat(0xf3eee2),trunk:mat(0x765139),leaf:mat(0x397b45,.9),concrete:mat(0x7b7f7c),
 glass:new THREE.MeshPhysicalMaterial({color:0x0a131b,metalness:.9,roughness:.08}),tire:mat(0x15171a,.95),rim:mat(0xc8d2d6,.2,.85),dark:mat(0x1c2126,.6,.3),
 lamp:new THREE.MeshStandardMaterial({color:0xffefbb,emissive:0xffd77a,emissiveIntensity:2}),pole:mat(0x38434a,.6,.4)};
const shopMat=new THREE.MeshStandardMaterial({color:0x1a2832,emissive:0xffcf8a,emissiveIntensity:.4,roughness:.3});
const awnings=[0xe0ad55,0x5e9b9b,0xd77963,0x83a7c5].map(c=>mat(c,.7));
const roofMats=[0x5b6268,0x76564c,0x8a6d57,0x414f59].map(c=>mat(c));
const BC=[0xe8d7bb,0xc9d8da,0xe2b8a0,0xc4d0d8,0xece4d2,0xd0bfae,0xa9bac4];

function mesh(g,m,x,y,z,parent=scene,cast=true){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=cast;o.receiveShadow=true;parent.add(o);return o}
function box(w,h,d,m,x,y,z,p=scene){return mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,p)}
function flat(w,h,d,m,x,y,z){return mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,scene,false)}
function cyl(rt,rb,h,m,x,y,z,p=scene,n=10){return mesh(new THREE.CylinderGeometry(rt,rb,h,n),m,x,y,z,p)}
function inst(geo,m,list){const o=new THREE.InstancedMesh(geo,m,list.length),d=new THREE.Object3D();list.forEach((a,i)=>{d.position.set(a[0],a[1],a[2]);d.updateMatrix();o.setMatrixAt(i,d.matrix)});o.receiveShadow=true;scene.add(o);return o}
const rnd=(()=>{let s=7;return()=>(s=(s*16807)%2147483647)/2147483647})();

/* ---------- city ---------- */
const poolMat=new THREE.MeshBasicMaterial({map:glowTex,color:0xffb560,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
const lampGlow=new THREE.PointsMaterial({size:7,map:glowTex,color:0xffc980,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
function makeGround(){flat(900,.3,900,M.grass,0,-.3,0)}
function makeRoads(){
 const half=CITY.limit,w=CITY.road,dx=[],dz=[],zx=[],zz=[];
 for(let k=-4;k<=4;k++){const p=k*S;
  flat(half*2,.12,w,M.roadX,0,-.06,p);flat(w,.12,half*2,M.roadZ,p,-.055,0);
  [1,-1].forEach(s=>{flat(half*2,.12,1.1,M.side,0,-.12,p+s*(R+.65));flat(1.1,.12,half*2,M.side,p+s*(R+.65),-.12,0)});
  for(let q=-half+5;q<half-3;q+=9){if(Math.abs(q-Math.round(q/S)*S)<R+3.5)continue;dx.push([q,.014,p]);dz.push([p,.014,q])}
  for(let j=-4;j<=4;j++){const c=j*S;for(let i=-4;i<=4;i++){zx.push([p+i*1.2,.016,c-(R+1.7)],[p+i*1.2,.016,c+(R+1.7)]);zz.push([c-(R+1.7),.016,p+i*1.2],[c+(R+1.7),.016,p+i*1.2])}}
 }
 inst(new THREE.BoxGeometry(3.2,.02,.16),M.line,dx);inst(new THREE.BoxGeometry(.16,.02,3.2),M.line,dz);
 inst(new THREE.BoxGeometry(.6,.02,2.4),M.white,zx);inst(new THREE.BoxGeometry(2.4,.02,.6),M.white,zz);
}
function makeTree(x,z,s=1){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);scene.add(g);cyl(.18,.25,1.8,M.trunk,0,.9,0,g,8);const c=mesh(new THREE.IcosahedronGeometry(1.3,1),M.leaf,0,2.4,0,g);c.scale.set(1,1.15,1);mesh(new THREE.IcosahedronGeometry(.9,1),M.leaf,.5,3.1,.2,g)}
function building(x,z,w,d,h){
 const ox=rnd(),oy=rnd(),g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv;
 for(let i=0;i<uv.count;i++){const wd=(i>>2)<2?d:w;uv.setXY(i,uv.getX(i)*wd/19.2+ox,uv.getY(i)*h/27+oy)}
 const m=new THREE.MeshStandardMaterial({color:BC[rnd()*BC.length|0],map:facadeMap,emissiveMap:facadeEm,emissive:0xffffff,emissiveIntensity:TODS[tod].win,roughness:.6,metalness:.1,envMapIntensity:.5});bMats.push(m);
 mesh(g,m,x,h/2+.5,z);
 box(w+.4,.5,d+.4,M.concrete,x,.25,z);
 box(w+.3,.4,d+.3,roofMats[rnd()*4|0],x,h+.7,z);
 if(rnd()<.7)box(1.8,1,1.8,M.concrete,x+(rnd()-.5)*w*.5,h+1.4,z+(rnd()-.5)*d*.5);
 if(rnd()<.35)cyl(.05,.07,5,M.pole,x+w*.3,h+3.2,z,scene,6);
 box(w*.8,2.3,.12,shopMat,x,1.8,z+d/2+.07);
 const a=box(w*.85,.16,1,awnings[rnd()*4|0],x,3.1,z+d/2+.5);a.rotation.x=.25;
 solids.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2});
}
function makeCity(){
 const LW=12.4,H=()=>10+rnd()*14+(rnd()<.18?rnd()*18:0);
 for(let gx=-4;gx<4;gx++)for(let gz=-4;gz<4;gz++){
  const cx=(gx+.5)*S,cz=(gz+.5)*S;
  if((gx===-1&&gz===1)||(gx===2&&gz===-2)){flat(LW,.18,LW,M.grass2,cx,0,cz);for(let i=0;i<6;i++)makeTree(cx-5+i*2,cz+(i%2?3.5:-3.5),.9);continue}
  const t=rnd()*3|0;
  if(t===0)building(cx,cz,LW,LW,H());
  else if(t===1){building(cx,cz-3.2,LW,6,H());building(cx,cz+3.2,LW,6,H())}
  else{building(cx-3.2,cz,6,LW,H());building(cx+3.2,cz,6,LW,H())}
 }
 const L=[],pos=[];
 for(let k=-4;k<=4;k++)for(let q=-4;q<=4;q++)L.push([k*S-R-.55,q*S-R-.55]);
 inst(new THREE.CylinderGeometry(.07,.1,4.8,8),M.pole,L.map(l=>[l[0],2.4,l[1]])).castShadow=true;
 inst(new THREE.BoxGeometry(.9,.14,.5),M.lamp,L.map(l=>[l[0],4.85,l[1]]));
 const pg=new THREE.PlaneGeometry(14,14);pg.rotateX(-Math.PI/2);inst(pg,poolMat,L.map(l=>[l[0],.04,l[1]]));
 L.forEach(l=>pos.push(l[0],4.8,l[1]));const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));scene.add(new THREE.Points(gg,lampGlow));
}
makeGround();makeRoads();makeCity();

/* ---------- time of day ---------- */
const U=sky.material.uniforms,beamMat=new THREE.MeshBasicMaterial({color:0xffe9b0,transparent:true,opacity:.05,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
function applyTOD(){const T=TODS[tod];U.top.value.set(T.top);U.mid.value.set(T.mid);U.hor.value.set(T.hor);U.sunCol.value.set(T.sunC);
 sunDir.set(...T.sunPos).normalize();U.sunDir.value.copy(sunDir);scene.fog.color.set(T.fog);sun.color.set(T.sunC);sun.intensity=T.sunI;
 hemi.color.set(T.hemiS);hemi.groundColor.set(T.hemiG);hemi.intensity=T.hemiI;bMats.forEach(m=>m.emissiveIntensity=T.win);shopMat.emissiveIntensity=T.win*.8;
 lampGlow.opacity=T.glow;poolMat.opacity=T.glow*.55;beamMat.opacity=T.beam;renderer.toneMappingExposure=T.expo;genEnv();
 const b=$('#tod-btn');if(b)b.textContent=tod==='night'?'☀':'☾'}
function toggleTOD(){tod=tod==='sunset'?'night':'sunset';applyTOD()}

/* ---------- cars ---------- */
const colors=['#59f4ff','#ff4fc8','#c8ff4d','#ffb84d','#9b85ff','#ff647c','#4dffb8','#f3f4ff'];
function makeCar(color){
 const root=new THREE.Group(),tilt=new THREE.Group();root.add(tilt);
 const paint=new THREE.MeshPhysicalMaterial({color,metalness:.6,roughness:.3,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:1.2});
 const ext=(pts,depth,m,bev)=>{const s=new THREE.Shape(pts.map(p=>new THREE.Vector2(p[0],p[1])));const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:bev,bevelSize:bev,bevelSegments:3,curveSegments:6});g.translate(0,0,-depth/2);g.rotateY(Math.PI/2);return mesh(g,m,0,0,0,tilt)};
 ext([[-2.1,.34],[-2.1,.8],[-1.3,.94],[1.25,.94],[2.1,.74],[2.1,.34]],1.72,paint,.07);
 ext([[-1,.95],[-.62,1.34],[.45,1.36],[1,.95]],1.5,M.glass,.03);
 box(1.46,.06,1.08,paint,0,1.38,.085,tilt);box(1.7,.12,3.9,M.dark,0,.3,0,tilt);
 box(1.8,.06,.55,paint,0,1.2,1.9,tilt);[-.6,.6].forEach(x=>box(.06,.3,.1,M.dark,x,1.05,1.9,tilt));
 const head=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xfff2c8,emissiveIntensity:2.5}),tail=new THREE.MeshStandardMaterial({color:0x660808,emissive:0xff1f1f,emissiveIntensity:.9});
 [-.62,.62].forEach(x=>{box(.5,.13,.08,head,x,.78,-2.14,tilt);const c=new THREE.Mesh(new THREE.ConeGeometry(1.5,12,16,1,true),beamMat);c.rotation.x=Math.PI/2;c.position.set(x,.8,-8.2);tilt.add(c)});
 box(1.6,.1,.08,tail,0,.8,2.14,tilt);
 const wheels=[];
 for(const x of [-.98,.98])for(const z of [-1.35,1.35]){const w=new THREE.Group();w.position.set(x,.43,z);w.rotation.order='YXZ';tilt.add(w);
  const t=cyl(.43,.43,.3,M.tire,0,0,0,w,20);t.rotation.z=Math.PI/2;const r=cyl(.29,.29,.32,M.rim,0,0,0,w,16);r.rotation.z=Math.PI/2;
  for(let i=0;i<5;i++){const s=box(.34,.5,.06,M.dark,0,0,0,w);s.rotation.x=i*Math.PI/5}wheels.push(w)}
 const glow=new THREE.Mesh(new THREE.PlaneGeometry(2.6,5),new THREE.MeshBasicMaterial({map:glowTex,color,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.y=.05;root.add(glow);
 root.userData={wheels,tail,tilt};return root;
}
function spawnPlayer(id,name,color,index){
 const car=makeCar(color),x=-3+(index%4)*2,z=-10-Math.floor(index/4)*5;
 car.position.set(x,0,z);scene.add(car);
 const p={id,name,color,car,x,z,angle:0,speed:0,input:{},distance:0,boost:100,boosting:false,roll:0,pitch:0,lives:MAX_LIVES,inv:0,wreck:0};attachHearts(p);players.set(id,p);refreshList();return p;
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function refreshList(){const board=$('#leaderboard');if(board)board.innerHTML=[...players.values()].sort((a,b)=>b.lives-a.lives||b.distance-a.distance).map((p,i)=>`<div class="leader-row"><span class="place">${i+1}</span><span class="dot" style="background:${p.color}"></span><span class="name">${esc(p.name)}</span><span class="score" style="color:#ff4d6d;letter-spacing:1px">${p.wreck>0?'WRECKED':'♥'.repeat(p.lives)}</span></div>`).join('')}

/* ---------- network ---------- */
peer.on('open',id=>{
 setStatus('City is live — waiting for drivers',true);
 const url=new URL('./controller.html',location.href);url.searchParams.set('room',id);
 const qr=$('#qrcode');if(qr&&typeof QRCode!=='undefined')new QRCode(qr,{text:url.href,width:132,height:132});
 $('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(url.href);setStatus('Invite link copied!',true)}catch{prompt('Copy invite link:',url.href)}};
});
peer.on('error',e=>setStatus('Network error: '+e.type));
peer.on('connection',conn=>{
 if(players.size>=MAX_PLAYERS){conn.on('open',()=>conn.send({type:'full'}));setTimeout(()=>conn.close(),300);return}
 const p=spawnPlayer(conn.peer,'DRIVER '+(players.size+1),colors[players.size%colors.length],players.size);p.conn=conn;
 conn.on('open',()=>conn.send({type:'init',color:p.color,name:p.name}));
 conn.on('data',data=>{if(!data||typeof data!=='object')return;if(data.type==='input'){p.input=data.input||{};p.lastIn=performance.now()}if(data.type==='pause')$('#pause-btn').click();if(data.type==='name'&&typeof data.name==='string')p.name=data.name.slice(0,14);if(data.type==='view')toggleView(p)});
 conn.on('close',()=>{scene.remove(p.car);if(p.cam)scene.remove(p.cam);if(p.hud)p.hud.el.remove();players.delete(conn.peer);refreshList()});
});

/* ---------- particles ---------- */
const PN=600,pP=new Float32Array(PN*3).fill(0),pC=new Float32Array(PN*3),pB=new Float32Array(PN*3),pV=new Float32Array(PN*3),pL=new Float32Array(PN),pM=new Float32Array(PN);let pi=0;
for(let i=0;i<PN;i++)pP[i*3+1]=-999;
const pg2=new THREE.BufferGeometry();pg2.setAttribute('position',new THREE.BufferAttribute(pP,3));pg2.setAttribute('color',new THREE.BufferAttribute(pC,3));
const pts=new THREE.Points(pg2,new THREE.PointsMaterial({size:1.5,map:glowTex,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));pts.frustumCulled=false;scene.add(pts);
function emit(x,y,z,vx,vy,vz,r,g,b,life){const i=pi++%PN,a=i*3;pP[a]=x;pP[a+1]=y;pP[a+2]=z;pV[a]=vx;pV[a+1]=vy;pV[a+2]=vz;pB[a]=r;pB[a+1]=g;pB[a+2]=b;pL[i]=pM[i]=life}
function stepParticles(dt){for(let i=0;i<PN;i++){if(pL[i]<=0)continue;const a=i*3;pL[i]-=dt;const k=Math.max(pL[i]/pM[i],0);pP[a]+=pV[a]*dt;pP[a+1]+=pV[a+1]*dt;pP[a+2]+=pV[a+2]*dt;pC[a]=pB[a]*k;pC[a+1]=pB[a+1]*k;pC[a+2]=pB[a+2]*k;if(pL[i]<=0)pP[a+1]=-999}pg2.attributes.position.needsUpdate=pg2.attributes.color.needsUpdate=true}
function sparks(x,z,n){for(let i=0;i<n;i++)emit(x,.8,z,(Math.random()-.5)*14,Math.random()*6,(Math.random()-.5)*14,1,.7,.25,.5)}

/* ---------- audio ---------- */
let audio=null,soundOn=true;
function initAudio(){if(audio){audio.ac.resume();return}try{const ac=new (window.AudioContext||window.webkitAudioContext)(),o=ac.createOscillator(),o2=ac.createOscillator(),f=ac.createBiquadFilter(),g=ac.createGain();o.type='sawtooth';o2.type='square';f.type='lowpass';f.frequency.value=500;g.gain.value=0;o.connect(f);o2.connect(f);f.connect(g);g.connect(ac.destination);o.start();o2.start();audio={ac,o,o2,f,g}}catch(e){}}
function engine(sp,th){if(!audio)return;const t=audio.ac.currentTime,r=Math.min(Math.abs(sp)/48,1.4);audio.o.frequency.setTargetAtTime(48+r*140+th*20,t,.08);audio.o2.frequency.setTargetAtTime(24+r*70,t,.08);audio.f.frequency.setTargetAtTime(300+r*900,t,.1);audio.g.gain.setTargetAtTime(soundOn&&started&&!paused?.03+th*.025:0,t,.1)}

/* ---------- lives, hits and life pickups ---------- */
const pairDone=new Set();
function say(t,ms=1800){const m=$('#race-message');if(!m)return;m.textContent=t;clearTimeout(say.t);say.t=setTimeout(()=>{m.textContent=''},ms)}
const lifeGroup=new THREE.Group(),lifeMat=new THREE.MeshStandardMaterial({color:0xff2d55,emissive:0xff2d55,emissiveIntensity:1.6,roughness:.3,metalness:.2});
(()=>{const s=new THREE.Shape();s.moveTo(25,25);s.bezierCurveTo(25,25,20,0,0,0);s.bezierCurveTo(-30,0,-30,35,-30,35);s.bezierCurveTo(-30,55,-10,77,25,95);s.bezierCurveTo(60,77,80,55,80,35);s.bezierCurveTo(80,35,80,0,50,0);s.bezierCurveTo(35,0,25,25,25,25);
 const g=new THREE.ExtrudeGeometry(s,{depth:22,bevelEnabled:true,bevelSize:4,bevelThickness:4,bevelSegments:3});g.center();g.rotateZ(Math.PI);g.scale(.024,.024,.024);
 const h=new THREE.Mesh(g,lifeMat);h.position.y=2.2;h.castShadow=true;lifeGroup.add(h);lifeGroup.userData.heart=h;
 const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xff3366,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.9}));glow.scale.set(9,9,1);glow.position.y=2.2;lifeGroup.add(glow);
 const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,40,16,1,true),new THREE.MeshBasicMaterial({color:0xff4d6d,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));pillar.position.y=20;lifeGroup.add(pillar);
 const ring=new THREE.Mesh(new THREE.RingGeometry(1.8,2.3,40),new THREE.MeshBasicMaterial({color:0xff4d6d,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.06;lifeGroup.add(ring);lifeGroup.userData.ring=ring;
 lifeGroup.visible=false;scene.add(lifeGroup)})();
function roadSpot(){const k=(Math.floor(Math.random()*9)-4)*S,t=(Math.random()*2-1)*100;return Math.random()<.5?{x:t,z:k,a:Math.PI/2}:{x:k,z:t,a:0}}
function spawnPickup(){const s=roadSpot();pickup={x:s.x,z:s.z};lifeGroup.position.set(s.x,0,s.z);lifeGroup.visible=true;say('❤ LIFE PICKUP ON THE MAP — GO GET IT',2600)}
function attachHearts(p){const c=document.createElement('canvas');c.width=192;c.height=40;p.hc=c;p.ht=new THREE.CanvasTexture(c);p.ht.colorSpace=THREE.SRGBColorSpace;
 const s=new THREE.Sprite(new THREE.SpriteMaterial({map:p.ht,transparent:true,depthWrite:false}));s.scale.set(4.8,1,1);s.position.set(0,3.2,0);p.car.add(s);drawHearts(p)}
function drawHearts(p){const g=p.hc.getContext('2d');g.clearRect(0,0,192,40);g.font='bold 28px sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=3;g.strokeStyle='#0008';
 for(let i=0;i<MAX_LIVES;i++){const x=16+i*32;g.strokeText('♥',x,21);g.fillStyle=i<p.lives?'#ff3b5c':'#ffffff40';g.fillText('♥',x,21)}p.ht.needsUpdate=true}
const hf=document.createElement('div');hf.style.cssText='position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,#ff1f4400 35%,#ff1f44cc 100%);opacity:0;z-index:5';document.body.appendChild(hf);
function flash(){hf.style.transition='none';hf.style.opacity=1;requestAnimationFrame(()=>requestAnimationFrame(()=>{hf.style.transition='opacity .5s';hf.style.opacity=0}))}
const lh=document.createElement('div');lh.style.cssText='position:fixed;left:20px;bottom:20px;font:900 28px sans-serif;letter-spacing:3px;color:#ff3b5c;text-shadow:0 2px 10px #000a;pointer-events:none;display:none';document.body.appendChild(lh);
function hurt(v,a){if(v.inv>0||v.wreck>0)return;v.lives--;v.inv=1.6;sparks(v.x,v.z,16);flashP(v);
 if(v.lives<=0){v.lives=0;v.wreck=WRECK_TIME;v.speed*=.3;say(`💥 ${a.name} WRECKED ${v.name}!`,2600)}else say(`${a.name} HIT ${v.name} — ♥ ${v.lives} LEFT`,2000);drawHearts(v)}
function hitCheck(p,q,dx,dz,d){const nx=dx/d,nz=dz/d,vp=[Math.sin(p.angle)*p.speed,-Math.cos(p.angle)*p.speed],vq=[Math.sin(q.angle)*q.speed,-Math.cos(q.angle)*q.speed];
 const ip=Math.max(0,-(vp[0]*nx+vp[1]*nz)),iq=Math.max(0,vq[0]*nx+vq[1]*nz);
 if(ip+iq<7)return;if(ip>iq*1.5)hurt(q,p);else if(iq>ip*1.5)hurt(p,q);else{hurt(p,q);hurt(q,p)}}
function respawn(p){const s=roadSpot();p.x=s.x;p.z=s.z;p.angle=s.a;p.speed=0;p.delta=0;p.lives=RESPAWN_LIVES;p.wreck=0;p.inv=3;p.boost=100;drawHearts(p);say(`${p.name} IS BACK — ♥ ${p.lives}`,2000)}
function pickupLogic(dt){
 if(!started)return;
 if(!pickup){pickupTimer-=dt;if(pickupTimer<=0)spawnPickup();return}
 for(const p of players.values()){
  if(p.lives<MAX_LIVES&&!(p.wreck>0)&&Math.hypot(p.x-pickup.x,p.z-pickup.z)<3){
   p.lives++;drawHearts(p);for(let i=0;i<28;i++){const a=i/28*Math.PI*2;emit(pickup.x,1.5,pickup.z,Math.cos(a)*6,3+Math.random()*3,Math.sin(a)*6,1,.3,.45,.8)}
   pickup=null;pickupTimer=PICKUP_EVERY;lifeGroup.visible=false;say(`${p.name} +1 ❤ — ♥ ${p.lives}`,2200);break}}
}

/* ---------- first-person cockpit (camera child, shown only in first-person view) ---------- */
scene.add(camera);
const cockpit=new THREE.Group(),ckM=new THREE.MeshStandardMaterial({color:0x14181c,roughness:.55,metalness:.2,emissive:0x0b1217}),ckGlow=new THREE.MeshStandardMaterial({color:0x061a10,emissive:0x59f4a0,emissiveIntensity:1.6});
const wheelG=new THREE.Group(),wheelSpin=new THREE.Group();
function cpart(g,m,x,y,z,p=cockpit){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);p.add(o);return o}
cpart(new THREE.BoxGeometry(2.6,.3,.7),ckM,0,-.6,-.95);
cpart(new THREE.BoxGeometry(.7,.03,.03),ckGlow,0,-.43,-.78);
cpart(new THREE.BoxGeometry(2.6,.1,.7),ckM,0,.66,-.95);
cpart(new THREE.BoxGeometry(.34,.1,.04),ckM,0,.5,-.8);
[-1,1].forEach(s=>{const a=cpart(new THREE.BoxGeometry(.09,1.1,.09),ckM,s*1.0,.05,-1);a.rotation.z=s*.28});
wheelG.position.set(0,-.3,-.72);wheelG.rotation.x=-.5;cockpit.add(wheelG);wheelG.add(wheelSpin);
cpart(new THREE.TorusGeometry(.2,.024,10,28),ckM,0,0,0,wheelSpin);cpart(new THREE.BoxGeometry(.38,.035,.035),ckM,0,0,0,wheelSpin);cpart(new THREE.BoxGeometry(.035,.2,.035),ckM,0,-.1,0,wheelSpin);
camera.add(cockpit);cockpit.visible=view===1;
function toggleView(p){p=p||players.values().next().value;if(!p)return;p.view=p.view?0:1;hudSay(p,p.view?'FIRST PERSON VIEW':'CHASE VIEW',1400)}

/* ---------- UI ---------- */
const tb=document.createElement('button');tb.className='icon-btn';tb.id='tod-btn';tb.title='Day / Night (N)';tb.textContent='☾';tb.onclick=toggleTOD;$('.top-actions').insertBefore(tb,$('#pause-btn'));const vb=document.createElement('button');vb.className='icon-btn';vb.id='view-btn';vb.title='Camera view (C)';vb.textContent='📷';vb.onclick=()=>toggleView();$('.top-actions').insertBefore(vb,tb);
const MMS=168,K=MMS/(CITY.limit*2),mm=document.createElement('canvas');mm.width=mm.height=MMS;
mm.style.cssText='position:fixed;right:18px;bottom:18px;width:168px;height:168px;border-radius:18px;border:1px solid #ffffff30;display:none;pointer-events:none;box-shadow:0 10px 30px #0008';document.body.appendChild(mm);
const mmBase=document.createElement('canvas');mmBase.width=mmBase.height=MMS;
(()=>{const g=mmBase.getContext('2d');g.fillStyle='#16222d';g.fillRect(0,0,MMS,MMS);g.fillStyle='#4a5662';for(let i=-4;i<=4;i++){const c=MMS/2+i*S*K;g.fillRect(c-R*K,0,CITY.road*K,MMS);g.fillRect(0,c-R*K,MMS,CITY.road*K)}g.fillStyle='#2c3b48';solids.forEach(b=>g.fillRect(MMS/2+b.x0*K,MMS/2+b.z0*K,(b.x1-b.x0)*K,(b.z1-b.z0)*K))})();
const nitro=document.createElement('div');nitro.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);width:230px;display:none;pointer-events:none;font:900 9px Inter,sans-serif;letter-spacing:2px;color:#ffcf68;text-align:center';
nitro.innerHTML='NITRO<div style="margin-top:5px;height:8px;border-radius:6px;background:#101923b8;border:1px solid #ffffff30;overflow:hidden"><div id="nitro-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#ffcf68,#ff7a3d)"></div></div>';document.body.appendChild(nitro);
function drawMap(focus,cv){const g=(cv||mm).getContext('2d');g.drawImage(mmBase,0,0);if(pickup){const x=MMS/2+pickup.x*K,y=MMS/2+pickup.z*K;g.fillStyle='#ff4d6d';g.strokeStyle='#fff';g.lineWidth=1.5;g.beginPath();g.arc(x,y,4.5+Math.sin(performance.now()/180)*1.5,0,7);g.fill();g.stroke()}for(const p of players.values()){const x=MMS/2+p.x*K,y=MMS/2+p.z*K;g.fillStyle=p.color;g.beginPath();g.arc(x,y,p===focus?4:3,0,7);g.fill();if(p===focus){g.strokeStyle='#fff';g.lineWidth=1.5;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.sin(p.angle)*10,y-Math.cos(p.angle)*10);g.stroke()}}}
$('#start-game-btn').addEventListener('click',()=>{if(started)return;started=true;initAudio();if(!players.size)spawnPlayer('host','HOST',colors[0],0);$('#lobby').hidden=true;$('#race-hud').hidden=false;$('#bottom-hint').style.display='none';$('#race-message').textContent='FREE DRIVE — EXPLORE THE CITY';startedAt=performance.now();setTimeout(()=>$('#race-message').textContent='',2400)});
$('#pause-btn').onclick=()=>{paused=!paused;$('#pause-btn').textContent=paused?'▶':'Ⅱ';$('#race-message').textContent=paused?'PAUSED':''};
$('#sound-btn').onclick=()=>{soundOn=!soundOn;$('#sound-btn').style.color=soundOn?'':'#ff647c';initAudio()};
addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;if(k==='n'&&!e.repeat)toggleTOD();if((k==='c'||k==='v')&&!e.repeat)toggleView();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault()});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);

/* ---------- simulation ---------- */
function roadDistance(x,z){return Math.min(Math.abs(x-Math.round(x/S)*S),Math.abs(z-Math.round(z/S)*S))}
function collide(p){
 for(const b of solids){const cx=clamp(p.x,b.x0,b.x1),cz=clamp(p.z,b.z0,b.z1),dx=p.x-cx,dz=p.z-cz,d=Math.hypot(dx,dz);
  if(d<1.6){if(d>.001){p.x+=dx/d*(1.6-d);p.z+=dz/d*(1.6-d)}else p.x+=1.6;if(Math.abs(p.speed)>9)sparks(cx,cz,10);p.speed*=.6}}
 for(const q of players.values()){if(q===p)continue;const dx=p.x-q.x,dz=p.z-q.z,d=Math.hypot(dx,dz);
  if(d<3.4&&d>.001){const key=p.id<q.id?p.id+'|'+q.id:q.id+'|'+p.id;if(!pairDone.has(key)){pairDone.add(key);hitCheck(p,q,dx,dz,d)}const o=(3.4-d)/2;p.x+=dx/d*o;p.z+=dz/d*o;q.x-=dx/d*o;q.z-=dz/d*o;p.speed*=.92;q.speed*=.92;if(Math.abs(p.speed)>9)sparks(p.x-dx/2,p.z-dz/2,5)}}
}
function update(dt){
 if(paused)return;pairDone.clear();
 const first=players.values().next().value;
 for(const p of players.values()){
  const dead=p.wreck>0,inp=(dead||(p.lastIn&&performance.now()-p.lastIn>800))?{}:(p.input||{}),host=p===first&&!dead;
  if(p.inv>0)p.inv-=dt;
  if(dead){p.wreck-=dt;const c=Math.random()<.5?[1,.45,.1]:[.7,.7,.75];emit(p.x,1.1,p.z,(Math.random()-.5)*2,2+Math.random()*2,(Math.random()-.5)*2,c[0],c[1],c[2],1);if(p.wreck<=0){respawn(p);continue}}
  const throttle=Math.max(Number(inp.throttle)||0,(inp.accel||(host&&(keys.w||keys.arrowup)))?1:0);
  const brake=Math.max(Number(inp.brake)||0,(host&&(keys.s||keys.arrowdown))?1:0);
  const steer=clamp(Number(inp.steer)||((inp.left||(host&&(keys.a||keys.arrowleft)))?-1:(inp.right||(host&&(keys.d||keys.arrowright)))?1:0),-1,1);
  const wantBoost=((Number(inp.boost)||0)>0||(host&&keys.shift))&&p.boost>1;
  p.boosting=wantBoost;p.steer=steer;p.boost=clamp(p.boost+(wantBoost?-32:10)*dt,0,100);
  const maxSpeed=wantBoost?66:48;
  p.speed+=((throttle+(wantBoost?1:0))*27*(wantBoost?1.5:1)-brake*(p.speed>.5?55:22))*dt;
  p.speed*=Math.pow(.989,dt*60);p.speed=clamp(p.speed,-13,maxSpeed);
  const av=Math.abs(p.speed),dmax=clamp(Math.atan(54/(av*av+1)),.035,.58),rate=Math.abs(steer)>.02?2.4:3.2,d0=p.delta||0;
  p.delta=d0+clamp(steer*dmax-d0,-rate*dt,rate*dt);
  p.lat=p.speed*p.speed*Math.tan(p.delta)/2.7;p.angle+=p.speed/2.7*Math.tan(p.delta)*dt;
  if(Math.abs(p.lat)>30)p.speed*=Math.pow(.985,dt*60);
  p.x+=Math.sin(p.angle)*p.speed*dt;p.z-=Math.cos(p.angle)*p.speed*dt;
  if(roadDistance(p.x,p.z)>R)p.speed*=Math.pow(.93,dt*60);
  if(Math.abs(p.x)>CITY.limit-3||Math.abs(p.z)>CITY.limit-3){p.speed*=.75;p.x=clamp(p.x,-CITY.limit+3,CITY.limit-3);p.z=clamp(p.z,-CITY.limit+3,CITY.limit-3)}
  collide(p);
  const sn=Math.sin(p.angle),cs=Math.cos(p.angle),car=p.car,ud=car.userData;
  car.position.set(p.x,0,p.z);car.rotation.y=-p.angle;
  const k=Math.min(1,dt*8);p.roll+=(clamp((p.lat||0)*.0025,-.08,.08)-p.roll)*k;p.pitch+=((throttle*.015-brake*.03)*Math.min(Math.abs(p.speed)/20,1)-p.pitch)*k;
  ud.tilt.rotation.z=p.roll+(p.wreck>0?.3:0);ud.tilt.visible=!(p.inv>0)||Math.floor(performance.now()/110)%2===0;ud.tilt.rotation.x=p.pitch;ud.tail.emissiveIntensity=brake>.05?3.5:.9;
  ud.wheels.forEach((w,i)=>{w.rotation.x-=p.speed*dt*2.3;if(i===0||i===2)w.rotation.y=-p.delta});p.distance+=Math.abs(p.speed)*dt;
  if(p.boosting&&Math.random()<.9){emit(p.x-sn*2.3,.5,p.z+cs*2.3,-sn*9+(Math.random()-.5)*2,Math.random()*1.5,cs*9+(Math.random()-.5)*2,1,.5+Math.random()*.3,.15,.35)}
  if(Math.abs(p.lat||0)>17&&av>8&&Math.random()<.8)for(const s of [-1,1])emit(p.x-sn*1.4+cs*.98*s,.2,p.z+cs*1.4+sn*.98*s,(Math.random()-.5)*2,.9,(Math.random()-.5)*2,.5,.5,.55,.9);
 }
 pickupLogic(dt);
}
/* ---------- split screen: one viewport + HUD per player ---------- */
function layout(n,W,H){
 const cols=n===2?(W>=H?2:1):n<=4?2:n<=6?3:4,rows=Math.ceil(n/cols),out=[];
 for(let i=0;i<n;i++){const r=Math.floor(i/cols),inRow=Math.min(cols,n-r*cols),c=i-r*cols;
  const x0=Math.round(c*W/inRow),x1=Math.round((c+1)*W/inRow),y0=Math.round(r*H/rows),y1=Math.round((r+1)*H/rows);
  out.push({x:x0,y:y0,w:x1-x0,h:y1-y0})}
 return out}
function makeHud(p){
 const el=document.createElement('div');
 el.style.cssText='position:fixed;pointer-events:none;overflow:hidden;box-shadow:inset 0 0 0 2px #000d;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#fff;z-index:4';
 el.innerHTML='<div class="f" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,#ff1f4400 35%,#ff1f44cc 100%)"></div>'
 +'<div class="m" style="position:absolute;left:0;right:0;top:34%;text-align:center;font:900 16px Inter,sans-serif;letter-spacing:3px;text-shadow:0 2px 10px #000"></div>'
 +'<div style="position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column;gap:5px;align-items:flex-start;text-shadow:0 2px 8px #000a">'
 +'<div class="n" style="border:1px solid;border-radius:20px;padding:5px 11px;font:900 10px Inter,sans-serif;letter-spacing:1px;background:#101923b8"></div>'
 +'<div class="h" style="color:#ff3b5c;font-size:16px;letter-spacing:1px"></div>'
 +'<div><b class="s" style="font-size:30px">0</b> <span style="font-size:10px;color:#cfe">KM/H</span></div></div>'
 +'<div style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:34%;max-width:230px;text-align:center;font:900 9px Inter,sans-serif;letter-spacing:2px;color:#ffcf68">NITRO'
 +'<div style="margin-top:4px;height:8px;border-radius:6px;background:#101923b8;border:1px solid #ffffff30;overflow:hidden"><div class="b" style="height:100%;width:100%;background:linear-gradient(90deg,#ffcf68,#ff7a3d)"></div></div></div>'
 +'<canvas class="mp" width="168" height="168" style="position:absolute;right:12px;bottom:12px;border-radius:14px;border:1px solid #ffffff30;box-shadow:0 8px 24px #0008"></canvas>';
 document.body.appendChild(el);const q=s=>el.querySelector(s);
 p.hud={el,flash:q('.f'),msg:q('.m'),name:q('.n'),hearts:q('.h'),speed:q('.s'),nit:q('.b'),map:q('.mp'),msgUntil:0,key:'',_l:-1};
 p.hud.name.style.color=p.hud.name.style.borderColor=p.color}
function hudSay(p,t,ms=1800){if(!p.hud)return;p.hud.msg.textContent=t;p.hud.msg.style.color='#fff';p.hud.msgUntil=performance.now()+ms}
function flashP(v){const f=v.hud&&v.hud.flash;if(!f)return;f.style.transition='none';f.style.opacity=1;requestAnimationFrame(()=>requestAnimationFrame(()=>{f.style.transition='opacity .5s';f.style.opacity=0}))}
let curPR=0;
function updateCam(p,r,dt){
 const cam=p.cam,sp=Math.abs(p.speed),fw=new THREE.Vector3(Math.sin(p.angle),0,-Math.cos(p.angle)),tg=new THREE.Vector3(p.x,0,p.z);
 if(p.view){
  p.look=(p.look||0)+((p.delta||0)*.3-(p.look||0))*Math.min(1,dt*5);
  const a=p.angle,sn=Math.sin(a),cs=Math.cos(a),la=a+p.look,ex=p.x-sn*.15,ez=p.z+cs*.15;
  cam.position.set(ex,1.14+(Math.random()-.5)*.0006*sp+(p.boosting?(Math.random()-.5)*.03:0),ez);
  cam.lookAt(ex+Math.sin(la)*30,1,ez-Math.cos(la)*30);cam.rotateZ(p.roll||0);
 }else{
  const desired=tg.clone().addScaledVector(fw,-(12+sp*.08)).add(new THREE.Vector3(0,7.5+sp*.02,0));
  if(p.camSnap){cam.position.copy(desired);p.camSnap=false}else cam.position.lerp(desired,1-Math.pow(.001,dt));
  if(p.boosting)cam.position.add(new THREE.Vector3((Math.random()-.5)*.16,(Math.random()-.5)*.16,0));
  cam.lookAt(tg.clone().addScaledVector(fw,8));
 }
 p.camFov+=((p.view?(r.w<700?82:76):(r.w<700?70:62))+sp*.3+(p.boosting?9:0)-p.camFov)*Math.min(1,dt*4);
 cam.fov=p.camFov;cam.aspect=r.w/r.h;cam.updateProjectionMatrix()}
function render(now){
 const dt=Math.min((now-lastFrame)/1000,.04);lastFrame=now;update(dt);stepParticles(dt);
 if(now-(render.tl||0)>120){render.tl=now;for(const p of players.values())if(p.conn&&p.conn.open)p.conn.send({type:'tel',speed:Math.round(Math.abs(p.speed)*3.6),boost:Math.round(p.boost),lives:p.lives})}
 const list=[...players.values()],n=list.length,W=innerWidth,H=innerHeight,first=list[0];
 const pr=n>4?1:Math.min(devicePixelRatio||1,1.7);if(pr!==curPR){curPR=pr;renderer.setPixelRatio(pr);renderer.setSize(W,H)}
 const sph=$('.speed-panel'),lb=$('#leaderboard');if(sph)sph.style.display='none';if(lb)lb.style.display=n>1?'none':'';
 if(pickup){const t=now/1000,u=lifeGroup.userData,ph=t%1.2,k=1+ph*.8;u.heart.rotation.y=t*2;u.heart.position.y=2.2+Math.sin(t*3)*.35;u.ring.scale.set(k,k,1);u.ring.material.opacity=.8*(1-ph/1.2)}
 if(first){
  engine(first.speed,first.input&&(first.input.throttle>.05||first.input.accel||keys.w||keys.arrowup)?1:0);
  renderer.setScissorTest(true);
  const rects=layout(n,W,H);
  list.forEach((p,i)=>{
   if(!p.cam){p.cam=new THREE.PerspectiveCamera(62,1,.1,600);scene.add(p.cam);p.camFov=62;p.view=view;p.camSnap=true}
   if(!p.hud)makeHud(p);
   const r=rects[i],h=p.hud,cam=p.cam;
   /* HUD box */
   const key=r.x+','+r.y+','+r.w+','+r.h;
   if(h.key!==key){h.key=key;const s=h.el.style;s.left=r.x+'px';s.top=r.y+'px';s.width=r.w+'px';s.height=r.h+'px';const m=Math.round(Math.max(70,Math.min(150,Math.min(r.w,r.h)*.28)));h.map.style.width=h.map.style.height=m+'px';const small=r.h<300;h.msg.style.fontSize=(small?11:16)+'px'}
   if(h.name.textContent!==p.name)h.name.textContent=p.name;
   h.speed.textContent=Math.round(Math.abs(p.speed)*3.6);h.nit.style.width=p.boost+'%';
   if(h._l!==p.lives){h._l=p.lives;h.hearts.innerHTML='♥'.repeat(p.lives)+'<span style="opacity:.3">'+'♥'.repeat(Math.max(0,MAX_LIVES-p.lives))+'</span>'}
   if(p.wreck>0){h.msg.textContent='💥 WRECKED — BACK IN '+Math.ceil(p.wreck);h.msg.style.color='#ff647c';h.msgUntil=0}
   else if(h.msgUntil&&now>h.msgUntil){h.msg.textContent='';h.msgUntil=0}
   else if(!h.msgUntil&&h.msg.textContent.startsWith('💥'))h.msg.textContent='';
   if(started)drawMap(p,h.map);
   /* camera + draw */
   updateCam(p,r,dt);
   const vy=H-r.y-r.h;renderer.setViewport(r.x,vy,r.w,r.h);renderer.setScissor(r.x,vy,r.w,r.h);
   sun.target.position.set(p.x,0,p.z);sun.position.set(p.x+sunDir.x*130,sunDir.y*130,p.z+sunDir.z*130);
   sky.position.copy(cam.position);
   cam.add(cockpit);cockpit.visible=p.view===1;wheelSpin.rotation.z=-((p.delta||0)/.58)*2.4;
   renderer.render(scene,cam)});
 }else{
  renderer.setScissorTest(false);renderer.setViewport(0,0,W,H);
  camera.aspect=W/H;camera.updateProjectionMatrix();
  camera.position.lerp(new THREE.Vector3(0,105,105),.015);camera.lookAt(0,0,0);
  sky.position.copy(camera.position);cockpit.visible=false;renderer.render(scene,camera)}
 if(started){const sec=(now-startedAt)/1000;$('#timer').textContent=Math.floor(sec/60).toString().padStart(2,'0')+':'+Math.floor(sec%60).toString().padStart(2,'0');refreshList()}
 requestAnimationFrame(render);
}
function resize(){curPR=0}
addEventListener('resize',resize);
applyTOD();requestAnimationFrame(render);
})();
