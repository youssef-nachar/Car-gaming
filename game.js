/* STREET RACING 41000 — Graphics Edition
   Sunset / night city, textured facades with lit windows, PBR car paint + reflections,
   headlight beams, particles, obstacle collisions, minimap, nitro and engine audio.
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
 sunset:{top:0x2a4f8f,mid:0xe38b69,hor:0xffc48c,fog:0xe9a982,sunC:0xffb26b,sunI:2.6,sunPos:[-80,34,-60],hemiS:0xffd9bc,hemiG:0x4a5340,hemiI:.5,win:.5,glow:.3,beam:.05,expo:1.05,neon:.5,stars:0,cloud:0xffd2b0,cloudA:.38},
 night:{top:0x040916,mid:0x0e1e42,hor:0x2a3c68,fog:0x111a30,sunC:0x9db8ff,sunI:.8,sunPos:[40,80,-50],hemiS:0x5e7bc0,hemiG:0x182028,hemiI:.25,win:1.7,glow:1,beam:.22,expo:1,neon:2.6,stars:1,cloud:0x2b3d6e,cloudA:.28}
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
/* ---------- obstacles (replace the old buildings) ----------
   Every city block is now an open paved lot with scattered obstacles you can crash into.
   Tweak OBST below: fill = chance a slot gets an obstacle (0..1), gap = slot spacing, cols = slots per row. */
const OBST={cols:3,gap:4.8,fill:.62,reach:7};
const obM={
 barrier:mat(0xd9d6cc,.8),
 stripe:new THREE.MeshStandardMaterial({color:0xff7a1a,roughness:.5,emissive:0xff5a00,emissiveIntensity:.3}),
 crate:mat(0x9a6b3c,.85),crate2:mat(0x7a5530,.9),
 barrel:mat(0xc23b32,.5,.3),cone:new THREE.MeshStandardMaterial({color:0xff6a1f,roughness:.5,emissive:0xff4a00,emissiveIntensity:.2}),
 cont:[0x2f6fa8,0xb24a3a,0x3f8a5a,0xc99a2e].map(c=>mat(c,.55,.3)),
 pave:mat(0x8d9190,.95)
};
const OBST_TYPES=6;
/* movable obstacles: when a car hits one it is pushed, slides with friction, and bumps other obstacles */
const movers=new Set();
function syncOb(o){o.x0=o.x-o.hw;o.x1=o.x+o.hw;o.z0=o.z-o.hd;o.z1=o.z+o.hd;o.g.position.set(o.x,0,o.z)}
function stepObstacles(dt){
 const lim=CITY.limit-2,fr=Math.pow(.18,dt);
 for(const o of movers){
  o.x+=o.vx*dt;o.z+=o.vz*dt;o.vx*=fr;o.vz*=fr;
  const sp=Math.hypot(o.vx,o.vz);
  if(o.x>lim-o.hw){o.x=lim-o.hw;o.vx*=-.4}else if(o.x<-lim+o.hw){o.x=-lim+o.hw;o.vx*=-.4}
  if(o.z>lim-o.hd){o.z=lim-o.hd;o.vz*=-.4}else if(o.z<-lim+o.hd){o.z=-lim+o.hd;o.vz*=-.4}
  if(o.round)o.g.rotation.y+=sp*dt*.6*(o.vx>=0?1:-1);
  syncOb(o);
  for(const b of solids){
   if(b===o)continue;
   const ox=Math.min(o.x1,b.x1)-Math.max(o.x0,b.x0),oz=Math.min(o.z1,b.z1)-Math.max(o.z0,b.z0);
   if(ox<=0||oz<=0)continue;
   const tm=o.mass+b.mass;
   if(ox<oz){
    const s=o.x<b.x?-1:1;o.x+=s*ox*b.mass/tm;b.x-=s*ox*o.mass/tm;
    const rv=o.vx-b.vx;if(s<0?rv>0:rv<0){const j=rv*1.25*o.mass*b.mass/tm;o.vx-=j/o.mass;b.vx+=j/b.mass}
   }else{
    const s=o.z<b.z?-1:1;o.z+=s*oz*b.mass/tm;b.z-=s*oz*o.mass/tm;
    const rv=o.vz-b.vz;if(s<0?rv>0:rv<0){const j=rv*1.25*o.mass*b.mass/tm;o.vz-=j/o.mass;b.vz+=j/b.mass}
   }
   syncOb(o);syncOb(b);
   if(Math.hypot(b.vx,b.vz)>.3)movers.add(b);
  }
  if(sp<.35){o.vx=o.vz=0;movers.delete(o)}
 }
}
function obstacle(type,cx,cz,ox,oz){
 const g=new THREE.Group(),turn=rnd()<.5,rot=turn?Math.PI/2:0;let w=2,d=2;
 switch(type){
  case 0:{w=3.8;d=1.3;box(w,.4,d,obM.barrier,0,.2,0,g);box(w,.8,.8,obM.barrier,0,.8,0,g);box(w+.02,.2,.82,obM.stripe,0,.95,0,g);break}
  case 1:{w=d=2.2;box(2.2,2.2,2.2,obM.crate,0,1.1,0,g);if(rnd()<.5)box(1.6,1.6,1.6,obM.crate2,.2,3,0,g);break}
  case 2:{w=5.6;d=2.4;box(w,2.6,d,obM.cont[rnd()*4|0],0,1.3,0,g);for(let i=-2;i<=2;i++)box(.1,2.5,d+.1,M.dark,i*1.1,1.3,0,g);break}
  case 3:{w=d=2;for(let i=0;i<3;i++)cyl(.85,.85,.6,M.tire,0,.3+i*.6,0,g,16);break}
  case 4:{w=d=2.4;[[-.6,-.5],[.6,-.4],[0,.6]].forEach(p=>cyl(.55,.55,1.2,obM.barrel,p[0],.6,p[1],g,14));break}
  default:{w=d=1.8;[[-.5,-.4],[.5,-.3],[0,.5]].forEach(p=>mesh(new THREE.ConeGeometry(.45,1.2,12),obM.cone,p[0],.6,p[1],g))}
 }
 const bw=turn?d:w,bd=turn?w:d;
 const lim=OBST.reach;ox=clamp(ox,-(lim-bw/2),lim-bw/2);oz=clamp(oz,-(lim-bd/2),lim-bd/2);
 const x=cx+ox,z=cz+oz;g.position.set(x,0,z);g.rotation.y=rot;scene.add(g);
 solids.push({x0:x-bw/2,x1:x+bw/2,z0:z-bd/2,z1:z+bd/2,x,z,hw:bw/2,hd:bd/2,vx:0,vz:0,g,mass:[3,2,8,1.5,1,.5][type],round:type>=3});
}
function obstacleBlock(cx,cz){
 flat(14,.12,14,obM.pave,cx,-.04,cz);
 const c=OBST.cols,half=(c-1)/2;
 for(let i=0;i<c;i++)for(let j=0;j<c;j++){
  if(rnd()>OBST.fill)continue;
  obstacle(rnd()*OBST_TYPES|0,cx,cz,(i-half)*OBST.gap+(rnd()-.5)*1.2,(j-half)*OBST.gap+(rnd()-.5)*1.2);
 }
}
function makeCity(){
 const LW=12.4;
 for(let gx=-4;gx<4;gx++)for(let gz=-4;gz<4;gz++){
  const cx=(gx+.5)*S,cz=(gz+.5)*S;
  if((gx===-1&&gz===1)||(gx===2&&gz===-2)){flat(LW,.18,LW,M.grass2,cx,0,cz);for(let i=0;i<6;i++)makeTree(cx-5+i*2,cz+(i%2?3.5:-3.5),.9);continue}
  obstacleBlock(cx,cz);neonLot(cx,cz,gx+gz);
 }
 const L=[],pos=[];
 for(let k=-4;k<=4;k++)for(let q=-4;q<=4;q++)L.push([k*S-R-.55,q*S-R-.55]);
 inst(new THREE.CylinderGeometry(.07,.1,4.8,8),M.pole,L.map(l=>[l[0],2.4,l[1]])).castShadow=true;
 inst(new THREE.BoxGeometry(.9,.14,.5),M.lamp,L.map(l=>[l[0],4.85,l[1]]));
 const pg=new THREE.PlaneGeometry(14,14);pg.rotateX(-Math.PI/2);inst(pg,poolMat,L.map(l=>[l[0],.04,l[1]]));
 L.forEach(l=>pos.push(l[0],4.8,l[1]));const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));scene.add(new THREE.Points(gg,lampGlow));
}
/* ---------- neon lot borders, skyline, stars / moon / clouds, boost pads, skid marks ---------- */
const neonCM=new THREE.MeshStandardMaterial({color:0x103840,emissive:0x35e8ff,emissiveIntensity:.5,roughness:.4}),
 neonMM=new THREE.MeshStandardMaterial({color:0x401030,emissive:0xff3fc0,emissiveIntensity:.5,roughness:.4});
const neonA=[[],[],[],[]];
function neonLot(cx,cz,k){const c=(((k%2)+2)%2)*2,e=7.1;neonA[c].push([cx,.07,cz-e],[cx,.07,cz+e]);neonA[c+1].push([cx-e,.07,cz],[cx+e,.07,cz])}
function buildNeon(){const ns=new THREE.BoxGeometry(14.4,.1,.2),ew=new THREE.BoxGeometry(.2,.1,14.4);inst(ns,neonCM,neonA[0]);inst(ew,neonCM,neonA[1]);inst(ns,neonMM,neonA[2]);inst(ew,neonMM,neonA[3])}

const skyMats=BC.map(c=>{const m=new THREE.MeshStandardMaterial({color:c,map:facadeMap,emissiveMap:facadeEm,emissive:0xffffff,emissiveIntensity:.5,roughness:.7,metalness:.1});bMats.push(m);return m});
const beaconMat=new THREE.SpriteMaterial({map:glowTex,color:0xff2a2a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
function makeSkyline(){
 const lim=CITY.limit;
 for(let row=0;row<2;row++){
  const dist=lim+14+row*34;
  for(let side=0;side<4;side++){
   let t=-dist;
   while(t<dist){
    const w=12+rnd()*12,d=12+rnd()*12,h=(row?55:28)+rnd()*(row?90:55),along=t+w/2;
    const x=side<2?along:(side===2?-dist:dist),z=side>=2?along:(side===0?-dist:dist);
    const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv;
    for(let i=0;i<24;i++){const f=i>>2;let su,sv;if(f<2){su=d;sv=h}else if(f<4){su=w;sv=d}else{su=w;sv=h}uv.setXY(i,uv.getX(i)*su/24,uv.getY(i)*sv/24)}
    const b=new THREE.Mesh(g,skyMats[rnd()*skyMats.length|0]);b.position.set(x,h/2-.2,z);scene.add(b);
    if(h>80&&rnd()<.6){const a=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,10,6),M.dark);a.position.set(x,h+4.8,z);scene.add(a);const l=new THREE.Sprite(beaconMat);l.scale.set(6,6,1);l.position.set(x,h+10,z);scene.add(l)}
    t+=w+3+rnd()*5;
   }
  }
 }
}
const stars=(()=>{const n=900,p=new Float32Array(n*3);for(let i=0;i<n;i++){const y=Math.random()*.9+.1,th=Math.random()*6.283,r=Math.sqrt(1-y*y);p[i*3]=Math.cos(th)*r*420;p[i*3+1]=y*420;p[i*3+2]=Math.sin(th)*r*420}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
 const s=new THREE.Points(g,new THREE.PointsMaterial({size:2.2,color:0xffffff,transparent:true,opacity:0,depthWrite:false,fog:false,sizeAttenuation:false}));s.frustumCulled=false;sky.add(s);return s})();
const moonTex=ctex(128,128,g=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.38,'rgba(235,240,255,1)');r.addColorStop(.42,'rgba(190,205,255,.35)');r.addColorStop(1,'rgba(160,180,255,0)');g.fillStyle=r;g.fillRect(0,0,128,128)},false);
const moon=new THREE.Sprite(new THREE.SpriteMaterial({map:moonTex,transparent:true,depthWrite:false,fog:false}));moon.scale.set(70,70,1);moon.visible=false;sky.add(moon);
const cloudMat=new THREE.SpriteMaterial({map:glowTex,color:0xffd2b0,transparent:true,opacity:.35,depthWrite:false,fog:false});
const clouds=new THREE.Group();sky.add(clouds);
for(let i=0;i<46;i++){const a=Math.random()*6.283,el=.12+Math.random()*.4,r=Math.cos(el)*380,s=new THREE.Sprite(cloudMat),w=90+Math.random()*130;s.position.set(Math.cos(a)*r,Math.sin(el)*380,Math.sin(a)*r);s.scale.set(w,w*.32,1);clouds.add(s)}

/* boost pads: drive over them for a speed burst + nitro refill */
const pads=[],padTex=ctex(64,128,(g,w,h)=>{g.clearRect(0,0,w,h);g.strokeStyle='#59f4ff';g.lineWidth=9;g.lineCap='round';g.lineJoin='round';for(let i=0;i<3;i++){const y=10+i*38;g.beginPath();g.moveTo(10,y+26);g.lineTo(32,y);g.lineTo(54,y+26);g.stroke()}});
function makePads(){
 const geo=new THREE.PlaneGeometry(4.6,8);geo.rotateX(-Math.PI/2);
 const am=new THREE.MeshBasicMaterial({map:padTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,toneMapped:false});
 const bm=new THREE.MeshBasicMaterial({color:0x0b3a4a,transparent:true,opacity:.55,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
 for(let i=0;i<14;i++){
  const k=(Math.floor(rnd()*9)-4)*S,t=(Math.floor(rnd()*8)-4)*S+S/2,ax=i%2?'x':'z',x=ax==='x'?t:k,z=ax==='x'?k:t,dir=rnd()<.5?0:Math.PI;
  const g=new THREE.Group();g.position.set(x,.035,z);g.rotation.y=(ax==='x'?-Math.PI/2:0)+dir;
  const b=new THREE.Mesh(geo,bm),a=new THREE.Mesh(geo,am);b.position.y=-.005;g.add(b,a);scene.add(g);pads.push({x,z,ax})}
}
function padLogic(p){
 if(p.pad>1)return;
 for(const d of pads){const ex=d.ax==='x'?3.9:2.5,ez=d.ax==='x'?2.5:3.9;
  if(Math.abs(p.x-d.x)<ex&&Math.abs(p.z-d.z)<ez){p.pad=1.8;p.speed=Math.min(p.speed+16,80);p.boost=Math.min(100,p.boost+35);sfx('zoom');hudSay(p,'⚡ BOOST PAD',700);
   for(let i=0;i<24;i++){const a=Math.random()*6.283;emit(p.x,.4,p.z,Math.cos(a)*7,1+Math.random()*3,Math.sin(a)*7,.3,.9,1,.5)}break}}
}

/* skid marks: ring buffer of dark quads left by drifting / hard braking */
const SK=520,skidGeo=new THREE.PlaneGeometry(.42,1.2);skidGeo.rotateX(-Math.PI/2);
const skid=new THREE.InstancedMesh(skidGeo,new THREE.MeshBasicMaterial({color:0x050607,transparent:true,opacity:.5,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3}),SK),skD=new THREE.Object3D();let skI=0;
(()=>{skD.scale.set(0,0,0);skD.updateMatrix();for(let i=0;i<SK;i++)skid.setMatrixAt(i,skD.matrix);skD.scale.set(1,1,1)})();
skid.frustumCulled=false;scene.add(skid);
function addSkid(x,z,a){skD.position.set(x,.03,z);skD.rotation.y=-a;skD.updateMatrix();skid.setMatrixAt(skI,skD.matrix);skI=(skI+1)%SK;skid.instanceMatrix.needsUpdate=true}
function skidLogic(p,dt,brake,av,sn,cs){
 p.skT=(p.skT||0)-dt;if(p.skT>0)return;
 if((Math.abs(p.lat||0)>17&&av>8)||(brake>.5&&av>16)){p.skT=.03;for(const s of [-1,1])addSkid(p.x-sn*1.4+cs*.98*s,p.z+cs*1.4+sn*.98*s,p.angle)}
}

makeGround();makeRoads();makeCity();buildNeon();makePads();

/* ---------- time of day ---------- */
const U=sky.material.uniforms,beamMat=new THREE.MeshBasicMaterial({color:0xffe9b0,transparent:true,opacity:.05,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
function applyTOD(){const T=TODS[tod];U.top.value.set(T.top);U.mid.value.set(T.mid);U.hor.value.set(T.hor);U.sunCol.value.set(T.sunC);
 sunDir.set(...T.sunPos).normalize();U.sunDir.value.copy(sunDir);scene.fog.color.set(T.fog);sun.color.set(T.sunC);sun.intensity=T.sunI;
 hemi.color.set(T.hemiS);hemi.groundColor.set(T.hemiG);hemi.intensity=T.hemiI;bMats.forEach(m=>m.emissiveIntensity=T.win);shopMat.emissiveIntensity=T.win*.8;
 neonCM.emissiveIntensity=neonMM.emissiveIntensity=T.neon;stars.material.opacity=T.stars;moon.visible=tod==='night';moon.position.copy(sunDir).multiplyScalar(400);cloudMat.color.set(T.cloud);cloudMat.opacity=T.cloudA;
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
 const p={id,name,color,car,x,z,angle:0,speed:0,input:{},distance:0,boost:100,boosting:false,roll:0,pitch:0,lives:MAX_LIVES,inv:0,wreck:0,item:null,firePrev:false};attachHearts(p);players.set(id,p);refreshList();return p;
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
 conn.on('data',data=>{if(!data||typeof data!=='object')return;if(data.type==='input'){p.input=data.input||{};p.lastIn=performance.now()}if(data.type==='pause')$('#pause-btn').click();if(data.type==='name'&&typeof data.name==='string')p.name=data.name.slice(0,14);if(data.type==='view')toggleView(p);if(data.type==='camclose')p.camOff=true});
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
function hurt(v,a){if(v.inv>0||v.wreck>0||v.shield>0)return;v.lives--;v.inv=1.6;v.shake=.7;sfx('hit');sparks(v.x,v.z,16);flashP(v);
 if(v.lives<=0){v.lives=0;v.item=null;v.wreck=WRECK_TIME;v.speed*=.3;say(`💥 ${a.name} WRECKED ${v.name}!`,2600)}else say(`${a.name} HIT ${v.name} — ♥ ${v.lives} LEFT`,2000);drawHearts(v)}
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

/* ---------- road items: 🚀 homing missile and 💣 mine (pick up by driving over, fire with SPACE / FIRE button) ----------
   ITEM_EVERY = seconds between item spawns, ITEM_MAX = max items lying on the map. */
const ITEM_EVERY=7,ITEM_MAX=5,MINE_MAX=30;
const items=[],projs=[],mines=[],blasts=[];let itemTimer=2;
const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a)),itemTex={};
function emojiTex(e){if(itemTex[e])return itemTex[e];const c=document.createElement('canvas');c.width=c.height=96;const g=c.getContext('2d');g.font='64px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(e,48,52);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return itemTex[e]=t}
function makeItemMesh(type){
 const g=new THREE.Group(),col=type==='missile'?0xffc94d:type==='mine'?0x6fc8ff:0x6dffb0;
 const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(.9,1),new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:1.3,roughness:.3,transparent:true,opacity:.85}));orb.position.y=2;g.add(orb);
 const ic=new THREE.Sprite(new THREE.SpriteMaterial({map:emojiTex(type==='missile'?'🚀':type==='mine'?'💣':'🛡️'),transparent:true,depthWrite:false}));ic.scale.set(1.8,1.8,1);ic.position.y=2;g.add(ic);
 const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:col,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.9}));glow.scale.set(8,8,1);glow.position.y=2;g.add(glow);
 const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,30,14,1,true),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));pillar.position.y=15;g.add(pillar);
 const ring=new THREE.Mesh(new THREE.RingGeometry(1.6,2.1,32),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.06;g.add(ring);
 g.userData={orb,ic};return g}
function makeMissile(){
 const g=new THREE.Group(),body=new THREE.MeshStandardMaterial({color:0xdfe4e8,metalness:.6,roughness:.3}),red=new THREE.MeshStandardMaterial({color:0xe03a2f,emissive:0x601008,roughness:.4});
 const b=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,1.8,10),body);b.rotation.x=Math.PI/2;g.add(b);
 const n=new THREE.Mesh(new THREE.ConeGeometry(.22,.7,10),red);n.rotation.x=-Math.PI/2;n.position.z=-1.25;g.add(n);
 [0,Math.PI/2].forEach(r=>{const f=new THREE.Mesh(new THREE.BoxGeometry(.05,.6,.45),red);f.position.z=.75;f.rotation.z=r;g.add(f)});
 const fl=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xff9a3a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));fl.scale.set(3.4,3.4,1);fl.position.z=1.3;g.add(fl);return g}
function makeMine(){
 const g=new THREE.Group();
 const base=new THREE.Mesh(new THREE.CylinderGeometry(.95,1.05,.28,18),new THREE.MeshStandardMaterial({color:0x2a2f35,metalness:.5,roughness:.5}));base.position.y=.14;g.add(base);
 const top=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,.12,14),new THREE.MeshStandardMaterial({color:0xaa1f1f}));top.position.y=.34;g.add(top);
 const led=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xff2a2a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));led.scale.set(2.4,2.4,1);led.position.y=.55;g.add(led);g.userData.led=led;return g}
/* simple synthesized sound effects (no audio files needed) */
function sfx(k){
 if(!audio||!soundOn||!started)return;
 try{const ac=audio.ac,t=ac.currentTime;
  if(k==='boom'||k==='hit'){
   const len=k==='boom'?.9:.35,buf=ac.createBuffer(1,ac.sampleRate*len|0,ac.sampleRate),d=buf.getChannelData(0);
   for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2);
   const s=ac.createBufferSource();s.buffer=buf;const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(k==='boom'?1400:700,t);f.frequency.exponentialRampToValueAtTime(60,t+len);
   const g=ac.createGain();g.gain.value=k==='boom'?.55:.3;s.connect(f);f.connect(g);g.connect(ac.destination);s.start(t)
  }else{
   const o=ac.createOscillator(),g=ac.createGain();o.type=k==='fire'?'sawtooth':'sine';
   const f0=k==='pick'?520:k==='zoom'?300:900,f1=k==='pick'?1040:k==='zoom'?900:200;
   o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+.25);
   g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+.32)
  }}catch(e){}
}
function spawnItem(){
 const s=roadSpot(),type=(r=>r<.4?'missile':r<.7?'mine':'shield')(Math.random()),g=makeItemMesh(type);
 g.position.set(s.x,0,s.z);scene.add(g);items.push({type,x:s.x,z:s.z,g,ph:Math.random()*6})}
function explode(x,z,owner,R){
 sfx('boom');for(let i=0;i<46;i++){const a=Math.random()*6.283,s=4+Math.random()*14;emit(x,.6+Math.random()*1.5,z,Math.cos(a)*s,2+Math.random()*7,Math.sin(a)*s,1,.45+Math.random()*.4,.1,.7+Math.random()*.5)}
 for(let i=0;i<20;i++){const a=Math.random()*6.283,s=2+Math.random()*5;emit(x,1+Math.random()*2,z,Math.cos(a)*s,1+Math.random()*3,Math.sin(a)*s,.6,.6,.6,1.2)}
 const bs=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xffa040,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));bs.position.set(x,1.2,z);scene.add(bs);blasts.push({s:bs,life:.45});
 for(const q of players.values()){const dd=Math.hypot(q.x-x,q.z-z);if(dd<35)q.shake=Math.max(q.shake||0,1-dd/35);if(q.wreck>0)continue;if(dd<R){hurt(q,owner);q.speed*=.45}}
 const rr=R*1.7;
 for(const b of solids){const dx=b.x-x,dz=b.z-z,d=Math.hypot(dx,dz)||.01;if(d<rr){const f=(1-d/rr)*46/(1+b.mass*.3);b.vx=clamp(b.vx+dx/d*f,-38,38);b.vz=clamp(b.vz+dz/d*f,-38,38);movers.add(b)}}
}
function useItem(p){
 const t=p.item;if(!t)return;p.item=null;const sn=Math.sin(p.angle),cs=Math.cos(p.angle);
 if(t==='missile'){const g=makeMissile();scene.add(g);projs.push({g,x:p.x+sn*3.2,z:p.z-cs*3.2,a:p.angle,v:85,life:3,owner:p});sfx('fire');hudSay(p,'🚀 MISSILE FIRED',900)}
 else{const g=makeMine(),x=p.x-sn*3.6,z=p.z+cs*3.6;g.position.set(x,0,z);scene.add(g);mines.push({g,x,z,owner:p,arm:1.5});if(mines.length>MINE_MAX){const o=mines.shift();scene.remove(o.g)}hudSay(p,'💣 MINE DROPPED',900)}
}
function stepWeapons(dt){
 if(started){
  itemTimer-=dt;if(itemTimer<=0){itemTimer=ITEM_EVERY;if(items.length<ITEM_MAX)spawnItem()}
  const t=performance.now()/1000;
  for(let i=items.length-1;i>=0;i--){const it=items[i],u=it.g.userData,y=2+Math.sin(t*3+it.ph)*.3;u.orb.position.y=y;u.ic.position.y=y;u.orb.rotation.y=t*2;
   for(const p of players.values()){if(p.wreck>0||(p.item&&it.type!=='shield'))continue;if(Math.hypot(p.x-it.x,p.z-it.z)<3){if(it.type==='shield')p.shield=8;else p.item=it.type;scene.remove(it.g);items.splice(i,1);sfx('pick');hudSay(p,it.type==='missile'?'🚀 GOT A MISSILE':it.type==='mine'?'💣 GOT A MINE':'🛡️ SHIELD ON — 8s',1400);break}}}
 }
 for(let i=projs.length-1;i>=0;i--){
  const m=projs[i];m.life-=dt;let tg=null,bd=70;
  for(const q of players.values()){if(q===m.owner||q.wreck>0)continue;const dx=q.x-m.x,dz=q.z-m.z,d=Math.hypot(dx,dz);if(d<bd){const an=Math.atan2(dx,-dz);if(Math.abs(wrapA(an-m.a))<.9){bd=d;tg=an}}}
  if(tg!==null)m.a+=clamp(wrapA(tg-m.a),-1.8*dt,1.8*dt);
  const sn=Math.sin(m.a),cs=Math.cos(m.a);m.x+=sn*m.v*dt;m.z-=cs*m.v*dt;
  m.g.position.set(m.x,.9,m.z);m.g.rotation.y=-m.a;
  emit(m.x+sn*1.4,.9,m.z-cs*1.4,(Math.random()-.5)*2,Math.random()*1.2,(Math.random()-.5)*2,1,.55,.15,.35);
  let hit=m.life<=0||Math.abs(m.x)>CITY.limit||Math.abs(m.z)>CITY.limit;
  if(!hit)for(const q of players.values()){if(q===m.owner||q.wreck>0)continue;if(Math.hypot(q.x-m.x,q.z-m.z)<2.4){hit=true;break}}
  if(!hit)for(const b of solids){if(m.x>b.x0-.4&&m.x<b.x1+.4&&m.z>b.z0-.4&&m.z<b.z1+.4){hit=true;break}}
  if(hit){explode(m.x,m.z,m.owner,7);scene.remove(m.g);projs.splice(i,1)}
 }
 const nowMs=performance.now();
 for(let i=mines.length-1;i>=0;i--){
  const m=mines[i];m.arm-=dt;m.g.userData.led.material.opacity=m.arm>0?.3:(Math.floor(nowMs/300)%2?1:.15);
  if(m.arm>0)continue;
  for(const q of players.values()){if(q.wreck>0)continue;if(Math.hypot(q.x-m.x,q.z-m.z)<2.6){explode(m.x,m.z,m.owner,8);scene.remove(m.g);mines.splice(i,1);break}}
 }
 for(const p of players.values()){
  if(p.shield>0){p.shield-=dt;
   if(!p.bub){p.bub=new THREE.Mesh(new THREE.SphereGeometry(2.7,24,16),new THREE.MeshBasicMaterial({color:0x6dffd0,transparent:true,opacity:.2,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));p.bub.position.y=1.1;p.car.add(p.bub)}
   p.bub.visible=true;p.bub.material.opacity=p.shield<2?(Math.floor(nowMs/120)%2?.28:.06):.2+Math.sin(nowMs/150)*.05
  }else if(p.bub)p.bub.visible=false}
 for(let i=blasts.length-1;i>=0;i--){const b=blasts[i];b.life-=dt;const k=Math.max(b.life/.45,0),sz=4+(1-k)*16;b.s.scale.set(sz,sz,1);b.s.material.opacity=k;if(b.life<=0){scene.remove(b.s);b.s.material.dispose();blasts.splice(i,1)}}
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
function toggleView(p){p=p||players.values().next().value;if(!p)return;p.view=p.view?0:1;p.camOff=false;hudSay(p,p.view?'FIRST PERSON VIEW':'CHASE VIEW',1400)}

/* ---------- UI ---------- */
const tb=document.createElement('button');tb.className='icon-btn';tb.id='tod-btn';tb.title='Day / Night (N)';tb.textContent='☾';tb.onclick=toggleTOD;$('.top-actions').insertBefore(tb,$('#pause-btn'));const vb=document.createElement('button');vb.className='icon-btn';vb.id='view-btn';vb.title='Camera view (C)';vb.textContent='📷';vb.onclick=()=>toggleView();$('.top-actions').insertBefore(vb,tb);
const MMS=168,K=MMS/(CITY.limit*2),mm=document.createElement('canvas');mm.width=mm.height=MMS;
mm.style.cssText='position:fixed;right:18px;bottom:18px;width:168px;height:168px;border-radius:18px;border:1px solid #ffffff30;display:none;pointer-events:none;box-shadow:0 10px 30px #0008';document.body.appendChild(mm);
const mmBase=document.createElement('canvas');mmBase.width=mmBase.height=MMS;
(()=>{const g=mmBase.getContext('2d');g.fillStyle='#16222d';g.fillRect(0,0,MMS,MMS);g.fillStyle='#4a5662';for(let i=-4;i<=4;i++){const c=MMS/2+i*S*K;g.fillRect(c-R*K,0,CITY.road*K,MMS);g.fillRect(0,c-R*K,MMS,CITY.road*K)}})();
const nitro=document.createElement('div');nitro.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);width:230px;display:none;pointer-events:none;font:900 9px Inter,sans-serif;letter-spacing:2px;color:#ffcf68;text-align:center';
nitro.innerHTML='NITRO<div style="margin-top:5px;height:8px;border-radius:6px;background:#101923b8;border:1px solid #ffffff30;overflow:hidden"><div id="nitro-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#ffcf68,#ff7a3d)"></div></div>';document.body.appendChild(nitro);
function drawMap(focus,cv){const g=(cv||mm).getContext('2d');g.drawImage(mmBase,0,0);g.fillStyle='#ff8a3d';for(const b of solids)g.fillRect(MMS/2+b.x0*K,MMS/2+b.z0*K,Math.max(3,(b.x1-b.x0)*K),Math.max(3,(b.z1-b.z0)*K));if(pickup){const x=MMS/2+pickup.x*K,y=MMS/2+pickup.z*K;g.fillStyle='#ff4d6d';g.strokeStyle='#fff';g.lineWidth=1.5;g.beginPath();g.arc(x,y,4.5+Math.sin(performance.now()/180)*1.5,0,7);g.fill();g.stroke()}for(const it of items){g.fillStyle=it.type==='missile'?'#ffd24d':it.type==='mine'?'#8fd4ff':'#6dffb0';g.fillRect(MMS/2+it.x*K-2.5,MMS/2+it.z*K-2.5,5,5)}for(const p of players.values()){const x=MMS/2+p.x*K,y=MMS/2+p.z*K;g.fillStyle=p.color;g.beginPath();g.arc(x,y,p===focus?4:3,0,7);g.fill();if(p===focus){g.strokeStyle='#fff';g.lineWidth=1.5;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.sin(p.angle)*10,y-Math.cos(p.angle)*10);g.stroke()}}}
$('#start-game-btn').addEventListener('click',()=>{if(started)return;started=true;initAudio();if(!players.size)spawnPlayer('host','HOST',colors[0],0);$('#lobby').hidden=true;$('#race-hud').hidden=false;$('#bottom-hint').style.display='none';$('#race-message').textContent='FREE DRIVE — EXPLORE THE CITY';startedAt=performance.now();setTimeout(()=>$('#race-message').textContent='',2400)});
$('#pause-btn').onclick=()=>{paused=!paused;$('#pause-btn').textContent=paused?'▶':'Ⅱ';$('#race-message').textContent=paused?'PAUSED':''};
$('#sound-btn').onclick=()=>{soundOn=!soundOn;$('#sound-btn').style.color=soundOn?'':'#ff647c';initAudio()};
addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;if(k==='n'&&!e.repeat)toggleTOD();if((k==='c'||k==='v')&&!e.repeat)toggleView();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault()});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);

/* ---------- simulation ---------- */
function roadDistance(x,z){return Math.min(Math.abs(x-Math.round(x/S)*S),Math.abs(z-Math.round(z/S)*S))}
function collide(p){
 for(const b of solids){const cx=clamp(p.x,b.x0,b.x1),cz=clamp(p.z,b.z0,b.z1),dx=p.x-cx,dz=p.z-cz,d=Math.hypot(dx,dz);
  if(d<1.6){let nx=1,nz=0;if(d>.001){nx=dx/d;nz=dz/d;p.x+=nx*(1.6-d);p.z+=nz*(1.6-d)}else p.x+=1.6;
   const cvx=Math.sin(p.angle)*p.speed,cvz=-Math.cos(p.angle)*p.speed,closing=Math.max(0,-(cvx*nx+cvz*nz));
   if(closing>.5){const k=10/(10+b.mass)*1.35;b.vx=clamp(b.vx-nx*closing*k,-38,38);b.vz=clamp(b.vz-nz*closing*k,-38,38);movers.add(b)}
   if(Math.abs(p.speed)>9)sparks(cx,cz,10);p.speed*=1-.1-b.mass/(10+b.mass)*.55}}
 for(const q of players.values()){if(q===p)continue;const dx=p.x-q.x,dz=p.z-q.z,d=Math.hypot(dx,dz);
  if(d<3.4&&d>.001){const key=p.id<q.id?p.id+'|'+q.id:q.id+'|'+p.id;if(!pairDone.has(key)){pairDone.add(key);hitCheck(p,q,dx,dz,d)}const o=(3.4-d)/2;p.x+=dx/d*o;p.z+=dz/d*o;q.x-=dx/d*o;q.z-=dz/d*o;p.speed*=.92;q.speed*=.92;if(Math.abs(p.speed)>9)sparks(p.x-dx/2,p.z-dz/2,5)}}
}
function update(dt){
 if(paused)return;pairDone.clear();stepObstacles(dt);stepWeapons(dt);
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
  const fire=!!(Number(inp.fire)||(host&&keys[' ']));if(fire&&!p.firePrev&&p.item&&!dead)useItem(p);p.firePrev=fire;
  if(p.pad>0)p.pad-=dt;padLogic(p);
  const maxSpeed=(wantBoost?66:48)+(p.pad>0?18:0);
  p.speed+=((throttle+(wantBoost?1:0))*27*(wantBoost?1.5:1)-brake*(p.speed>.5?55:22))*dt;
  p.speed*=Math.pow(.989,dt*60);p.speed=clamp(p.speed,-13,maxSpeed);
  const av=Math.abs(p.speed),dmax=clamp(Math.atan(54/(av*av+1)),.035,.58),rate=Math.abs(steer)>.02?2.4:3.2,d0=p.delta||0;
  p.delta=d0+clamp(steer*dmax-d0,-rate*dt,rate*dt);
  p.lat=p.speed*p.speed*Math.tan(p.delta)/2.7;p.angle+=p.speed/2.7*Math.tan(p.delta)*dt;
  if(Math.abs(p.lat)>30)p.speed*=Math.pow(.985,dt*60);
  p.x+=Math.sin(p.angle)*p.speed*dt;p.z-=Math.cos(p.angle)*p.speed*dt;
  if(roadDistance(p.x,p.z)>R)p.speed*=Math.pow(.985,dt*60);
  if(Math.abs(p.x)>CITY.limit-3||Math.abs(p.z)>CITY.limit-3){p.speed*=.75;p.x=clamp(p.x,-CITY.limit+3,CITY.limit-3);p.z=clamp(p.z,-CITY.limit+3,CITY.limit-3)}
  collide(p);
  const sn=Math.sin(p.angle),cs=Math.cos(p.angle),car=p.car,ud=car.userData;
  car.position.set(p.x,0,p.z);car.rotation.y=-p.angle;
  const k=Math.min(1,dt*8);p.roll+=(clamp((p.lat||0)*.0025,-.08,.08)-p.roll)*k;p.pitch+=((throttle*.015-brake*.03)*Math.min(Math.abs(p.speed)/20,1)-p.pitch)*k;
  ud.tilt.rotation.z=p.roll+(p.wreck>0?.3:0);ud.tilt.visible=!(p.inv>0)||Math.floor(performance.now()/110)%2===0;ud.tilt.rotation.x=p.pitch;ud.tail.emissiveIntensity=brake>.05?3.5:.9;
  ud.wheels.forEach((w,i)=>{w.rotation.x-=p.speed*dt*2.3;if(i===0||i===2)w.rotation.y=-p.delta});p.distance+=Math.abs(p.speed)*dt;skidLogic(p,dt,brake,av,sn,cs);
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
 el.innerHTML='<div class="sl" style="position:absolute;inset:0;opacity:0;background:repeating-conic-gradient(from 0deg at 50% 50%,#ffffff00 0 5deg,#ffffff30 5deg 5.6deg);-webkit-mask-image:radial-gradient(ellipse at center,transparent 38%,#000 85%);mask-image:radial-gradient(ellipse at center,transparent 38%,#000 85%)"></div>'
 +'<div class="f" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,#ff1f4400 35%,#ff1f44cc 100%)"></div>'
 +'<div class="m" style="position:absolute;left:0;right:0;top:34%;text-align:center;font:900 16px Inter,sans-serif;letter-spacing:3px;text-shadow:0 2px 10px #000"></div>'
 +'<div style="position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column;gap:5px;align-items:flex-start;text-shadow:0 2px 8px #000a">'
 +'<div class="n" style="border:1px solid;border-radius:20px;padding:5px 11px;font:900 10px Inter,sans-serif;letter-spacing:1px;background:#101923b8"></div>'
 +'<div class="h" style="color:#ff3b5c;font-size:16px;letter-spacing:1px"></div>'
 +'<div class="it" style="font:900 11px Inter,sans-serif;letter-spacing:1.5px;color:#ffe08a;min-height:14px"></div>'
 +'<div><b class="s" style="font-size:30px">0</b> <span style="font-size:10px;color:#cfe">KM/H</span></div></div>'
 +'<div style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:34%;max-width:230px;text-align:center;font:900 9px Inter,sans-serif;letter-spacing:2px;color:#ffcf68">NITRO'
 +'<div style="margin-top:4px;height:8px;border-radius:6px;background:#101923b8;border:1px solid #ffffff30;overflow:hidden"><div class="b" style="height:100%;width:100%;background:linear-gradient(90deg,#ffcf68,#ff7a3d)"></div></div></div>'
 +'<canvas class="mp" width="168" height="168" style="position:absolute;right:12px;bottom:12px;border-radius:14px;border:1px solid #ffffff30;box-shadow:0 8px 24px #0008"></canvas>';
 document.body.appendChild(el);const q=s=>el.querySelector(s);
 p.hud={el,flash:q('.f'),msg:q('.m'),name:q('.n'),hearts:q('.h'),it:q('.it'),sl:q('.sl'),speed:q('.s'),nit:q('.b'),map:q('.mp'),msgUntil:0,key:'',_l:-1};
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
 if(p.shake>0){cam.position.x+=(Math.random()-.5)*p.shake*1.1;cam.position.y+=(Math.random()-.5)*p.shake*.9;cam.position.z+=(Math.random()-.5)*p.shake*1.1;p.shake=Math.max(0,p.shake-dt*2.2)}
 p.camFov+=((p.view?(r.w<700?82:76):(r.w<700?70:62))+sp*.3+(p.boosting?9:0)-p.camFov)*Math.min(1,dt*4);
 cam.fov=p.camFov;cam.aspect=r.w/r.h;cam.updateProjectionMatrix()}
/* ---------- first-person feed -> phone controller (small JPEG frames over the PeerJS data channel) ---------- */
const feedCv=document.createElement('canvas');feedCv.width=320;feedCv.height=180;const feedCx=feedCv.getContext('2d');
function camStream(p,r,now){
 const c=p.conn;if(!c||!c.open)return;
 const want=p.view===1&&!p.camOff;
 if(p._cs!==want){p._cs=want;c.send({type:'cam',on:want})}
 /* live feed: ~20fps, never queue behind old frames (drop instead of delay) */
 if(!want||p._enc||now-(p._ft||0)<50)return;
 const dc=c.dataChannel;if(dc&&dc.bufferedAmount>24000)return;
 p._ft=now;
 const pr=renderer.getPixelRatio(),sw=r.w*pr,sh=r.h*pr;let cw=sw,ch=sh;
 if(sw/sh>16/9)cw=sh*16/9;else ch=sw*9/16;
 try{feedCx.drawImage(renderer.domElement,r.x*pr+(sw-cw)/2,r.y*pr+(sh-ch)/2,cw,ch,0,0,320,180)}catch(e){return}
 p._enc=true;
 feedCv.toBlob(b=>{
  if(!b||!c.open){p._enc=false;return}
  b.arrayBuffer().then(buf=>{p._enc=false;const d=c.dataChannel;if(c.open&&!(d&&d.bufferedAmount>24000))c.send({type:'frame',buf})}).catch(()=>{p._enc=false})
 },'image/jpeg',.5)
}
function render(now){
 const dt=Math.min((now-lastFrame)/1000,.04);lastFrame=now;update(dt);stepParticles(dt);clouds.rotation.y=now*4e-6;padTex.offset.y=-(now*.0012)%1;beaconMat.opacity=Math.floor(now/700)%2?1:.25;
 if(now-(render.tl||0)>120){render.tl=now;for(const p of players.values())if(p.conn&&p.conn.open)p.conn.send({type:'tel',speed:Math.round(Math.abs(p.speed)*3.6),boost:Math.round(p.boost),lives:p.lives,item:p.item||''})}
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
   h.it.textContent=(p.shield>0?'🛡️ SHIELD '+Math.ceil(p.shield)+'s  ':'')+(p.item==='missile'?'🚀 MISSILE — SPACE / FIRE':p.item==='mine'?'💣 MINE — SPACE / FIRE':'');h.sl.style.opacity=clamp((Math.abs(p.speed)-34)/30,0,.9)*(p.boosting?1:.7);
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
   renderer.render(scene,cam);camStream(p,r,now)});
 }else{
  renderer.setScissorTest(false);renderer.setViewport(0,0,W,H);
  camera.aspect=W/H;camera.updateProjectionMatrix();
  {const oa=now*.00008;camera.position.lerp(new THREE.Vector3(Math.sin(oa)*150,85,Math.cos(oa)*150),.03)}camera.lookAt(0,10,0);
  sky.position.copy(camera.position);cockpit.visible=false;renderer.render(scene,camera)}
 if(started){const sec=(now-startedAt)/1000;$('#timer').textContent=Math.floor(sec/60).toString().padStart(2,'0')+':'+Math.floor(sec%60).toString().padStart(2,'0');refreshList()}
 requestAnimationFrame(render);
}
function resize(){curPR=0}
addEventListener('resize',resize);
applyTOD();requestAnimationFrame(render);
})();
