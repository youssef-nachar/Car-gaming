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
const OBST={cols:3,gap:4.8,fill:.2,reach:7};
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
const CAR_MODELS={
 sport:{body:[[-2.1,.34],[-2.1,.8],[-1.3,.94],[1.25,.94],[2.1,.74],[2.1,.34]],cab:[[-1,.95],[-.62,1.34],[.45,1.36],[1,.95]],bw:1.72,cw:1.5,wr:.43,wx:.98,wz:1.35,front:2.14,hy:.78,wing:'high'},
 super:{body:[[-2.15,.3],[-2.15,.62],[-1.1,.76],[1,.74],[2.2,.46],[2.2,.3]],cab:[[-.75,.75],[-.25,1.12],[.55,1.1],[1.15,.74]],bw:1.85,cw:1.4,wr:.42,wx:1.02,wz:1.4,front:2.2,hy:.56,wing:'big'},
 muscle:{body:[[-2.2,.34],[-2.2,.84],[-1.3,.92],[1.5,.94],[2.2,.72],[2.2,.34]],cab:[[-.75,.94],[-.35,1.3],[.6,1.3],[1,.94]],bw:1.8,cw:1.55,wr:.45,wx:1,wz:1.4,front:2.2,hy:.8,wing:'duck',scoop:true},
 suv:{body:[[-2.1,.5],[-2.1,1.2],[-1.7,1.32],[1.6,1.32],[2.1,1.05],[2.1,.5]],cab:[[-1.8,1.32],[-1.6,1.9],[.9,1.9],[1.4,1.32]],bw:1.9,cw:1.75,wr:.55,wx:1.05,wz:1.35,front:2.1,hy:1,rack:true},
 pickup:{body:[[-2.2,.5],[-2.2,1],[.25,1.02],[1.1,1.02],[2.2,.85],[2.2,.5]],cab:[[.05,1.02],[.4,1.62],[1.05,1.62],[1.5,1.02]],bw:1.85,cw:1.7,wr:.54,wx:1.04,wz:1.45,front:2.2,hy:.9,bed:true},
 hatch:{body:[[-1.9,.36],[-1.9,.98],[-1.55,1.08],[1,1],[1.9,.74],[1.9,.36]],cab:[[-1.75,1],[-1.5,1.58],[.55,1.52],[1.15,1]],bw:1.6,cw:1.45,wr:.4,wx:.88,wz:1.2,front:1.94,hy:.8}
};
const CAR_IDS=Object.keys(CAR_MODELS);
function makeCar(color,model='sport'){
 const m=CAR_MODELS[model]||CAR_MODELS.sport;
 const root=new THREE.Group(),tilt=new THREE.Group();root.add(tilt);
 const paint=new THREE.MeshPhysicalMaterial({color,metalness:.6,roughness:.3,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:1.2});
 const ext=(pts,depth,mt,bev)=>{const sh=new THREE.Shape(pts.map(p=>new THREE.Vector2(p[0],p[1])));const g=new THREE.ExtrudeGeometry(sh,{depth,bevelEnabled:true,bevelThickness:bev,bevelSize:bev,bevelSegments:3,curveSegments:6});g.translate(0,0,-depth/2);g.rotateY(Math.PI/2);return mesh(g,mt,0,0,0,tilt)};
 ext(m.body,m.bw,paint,.07);
 ext(m.cab,m.cw,M.glass,.03);
 /* roof panel */
 const top=Math.max(...m.cab.map(p=>p[1])),tp=m.cab.filter(p=>p[1]>top-.05),x0=Math.min(...tp.map(p=>p[0])),x1=Math.max(...tp.map(p=>p[0]));
 box(m.cw-.04,.06,Math.max(.3,x1-x0),paint,0,top+.02,-(x0+x1)/2,tilt);
 box(m.bw-.02,.12,m.front*2-.3,M.dark,0,m.body[0][1]-.04,0,tilt);
 const rz=-m.body[0][0]-.2,ry=m.body[1][1];
 if(m.wing==='high'||m.wing==='big'){const big=m.wing==='big',wy=ry+(big?.5:.4);box(m.bw+.08,.06,big?.7:.55,paint,0,wy,rz,tilt);[-.6,.6].forEach(x=>box(.06,wy-ry+.1,.1,M.dark,x,ry+(wy-ry)/2,rz,tilt))}
 if(m.wing==='duck')box(m.bw-.2,.08,.35,paint,0,ry+.1,rz,tilt);
 if(m.scoop)box(.6,.12,.9,M.dark,0,.97,-1,tilt);
 if(m.rack){[-.7,.7].forEach(x=>box(.05,.08,1.5,M.dark,x,top+.1,.2,tilt));[-.3,.5].forEach(z=>box(1.5,.05,.06,M.dark,0,top+.1,z,tilt))}
 if(m.bed){const wy=m.body[2][1]+.2;[-1,1].forEach(sx=>box(.1,.4,2.1,paint,sx*(m.bw/2-.05),wy,1.1,tilt));box(m.bw-.1,.4,.1,paint,0,wy,2.15,tilt);box(m.bw-.3,.04,2,M.dark,0,m.body[2][1]+.02,1.1,tilt)}
 const head=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xfff2c8,emissiveIntensity:2.5}),tail=new THREE.MeshStandardMaterial({color:0x660808,emissive:0xff1f1f,emissiveIntensity:.9});
 const hx=m.bw*.36;
 [-hx,hx].forEach(x=>{box(.5,.13,.08,head,x,m.hy,-m.front,tilt);const c=new THREE.Mesh(new THREE.ConeGeometry(1.5,12,16,1,true),beamMat);c.rotation.x=Math.PI/2;c.position.set(x,m.hy+.02,-m.front-6.1);tilt.add(c)});
 box(m.bw*.93,.1,.08,tail,0,m.hy+.02,m.front,tilt);
 const wheels=[],ws=m.wr/.43;
 for(const x of [-m.wx,m.wx])for(const z of [-m.wz,m.wz]){const w=new THREE.Group();w.position.set(x,m.wr,z);w.rotation.order='YXZ';w.scale.setScalar(ws);tilt.add(w);
  const t=cyl(.43,.43,.3,M.tire,0,0,0,w,20);t.rotation.z=Math.PI/2;const r=cyl(.29,.29,.32,M.rim,0,0,0,w,16);r.rotation.z=Math.PI/2;
  for(let i=0;i<5;i++){const sp=box(.34,.5,.06,M.dark,0,0,0,w);sp.rotation.x=i*Math.PI/5}wheels.push(w)}
 const glow=new THREE.Mesh(new THREE.PlaneGeometry(2.6,5),new THREE.MeshBasicMaterial({map:glowTex,color,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.y=.05;root.add(glow);
 root.userData={wheels,tail,tilt};return root;
}
/* big blue arrow floating above every OTHER driver (hidden in the owner's own view, grows with distance) */
const arrowMat=new THREE.MeshBasicMaterial({color:0x2f9bff,depthTest:false,fog:false}),arrowOut=new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,fog:false,side:THREE.BackSide});
function attachArrow(p){
 if(p.arrow&&p.arrow.parent)p.arrow.parent.remove(p.arrow);
 const g=new THREE.Group();
 const mk=(geo,y)=>{const o=new THREE.Mesh(geo,arrowMat);o.position.y=y;o.renderOrder=1000;o.frustumCulled=false;g.add(o);const l=new THREE.Mesh(geo,arrowOut);l.position.y=y;l.scale.setScalar(1.16);l.renderOrder=999;l.frustumCulled=false;g.add(l);return o};
 mk(new THREE.ConeGeometry(1.25,1.7,4),.85).rotation.set(Math.PI,Math.PI/4,0);
 g.children[g.children.length-1].rotation.set(Math.PI,Math.PI/4,0);
 mk(new THREE.BoxGeometry(.8,1.5,.8),2.45);
 g.position.y=4.4;p.car.add(g);p.arrow=g;
}
function equipCar(p,model){
 if(!CAR_MODELS[model])model='sport';
 const old=p.car,car=makeCar(p.color,model);
 if(old){car.position.copy(old.position);car.rotation.copy(old.rotation);scene.remove(old)}
 scene.add(car);p.car=car;p.model=model;p.bub=null;
 attachHearts(p);attachArrow(p);
}
function spawnPlayer(id,name,color,index){
 const car=makeCar(color,'sport'),x=-3+(index%4)*2,z=-10-Math.floor(index/4)*5;
 car.position.set(x,0,z);scene.add(car);
 const p={id,name,color,car,x,z,angle:0,speed:0,input:{},distance:0,boost:100,boosting:false,roll:0,pitch:0,lives:MAX_LIVES,inv:0,wreck:0,item:null,firePrev:false,score:0,kills:0,hits:0,top:0};attachHearts(p);attachArrow(p);p.model='sport';players.set(id,p);refreshList();return p;
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function refreshList(){const board=$('#leaderboard');if(board)board.innerHTML=[...players.values()].sort((a,b)=>b.score-a.score||b.lives-a.lives).map((p,i)=>`<div class="leader-row"><span class="place">${i+1}</span><span class="dot" style="background:${p.color}"></span><span class="name">${esc(p.name)}</span><span class="score" style="color:#ff4d6d;letter-spacing:1px">${p.score} • ${p.wreck>0?'WRECKED':'♥'.repeat(p.lives)}</span></div>`).join('')}

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
 conn.on('data',data=>{if(!data||typeof data!=='object')return;if(data.type==='input'){p.input=data.input||{};p.lastIn=performance.now()}if(data.type==='pause')$('#pause-btn').click();if(data.type==='name'&&typeof data.name==='string')p.name=data.name.slice(0,14);if(data.type==='again')resetMatch();if(data.type==='car'&&typeof data.model==='string')equipCar(p,data.model);if(data.type==='view')toggleView(p);if(data.type==='camclose')p.camOff=true});
 conn.on('close',()=>{stopFeed(p);scene.remove(p.car);if(p.cam)scene.remove(p.cam);if(p.hud)p.hud.el.remove();players.delete(conn.peer);refreshList()});
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
function engine(sp,th){if(!audio)return;const t=audio.ac.currentTime,r=Math.min(Math.abs(sp)/48,1.4);audio.o.frequency.setTargetAtTime(48+r*140+th*20,t,.08);audio.o2.frequency.setTargetAtTime(24+r*70,t,.08);audio.f.frequency.setTargetAtTime(300+r*900,t,.1);audio.g.gain.setTargetAtTime(soundOn&&started&&!paused&&!match.over?.03+th*.025:0,t,.1)}

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
function roadSpot0(){const k=(Math.floor(Math.random()*9)-4)*S,t=(Math.random()*2-1)*100;return Math.random()<.5?{x:t,z:k,a:Math.PI/2}:{x:k,z:t,a:0}}
function roadSpot(){for(let i=0;i<40;i++){const s=roadSpot0();if(zoneSafe(s.x,s.z,10))return s}const cx=Z.next?Z.nx:Z.cx,cz=Z.next?Z.nz:Z.cz,kx=clamp(Math.round(cx/S),-4,4)*S,kz=clamp(Math.round(cz/S),-4,4)*S;return Math.abs(cx-kx)<Math.abs(cz-kz)?{x:kx,z:clamp(cz,-100,100),a:0}:{x:clamp(cx,-100,100),z:kz,a:Math.PI/2}}
function spawnPickup(){const s=roadSpot();pickup={x:s.x,z:s.z};lifeGroup.position.set(s.x,0,s.z);lifeGroup.visible=true;say('❤ LIFE PICKUP ON THE MAP — GO GET IT',2600)}
function attachHearts(p){const c=document.createElement('canvas');c.width=192;c.height=40;p.hc=c;p.ht=new THREE.CanvasTexture(c);p.ht.colorSpace=THREE.SRGBColorSpace;
 const s=new THREE.Sprite(new THREE.SpriteMaterial({map:p.ht,transparent:true,depthWrite:false}));s.scale.set(4.8,1,1);s.position.set(0,3.2,0);p.car.add(s);drawHearts(p)}
function drawHearts(p){const g=p.hc.getContext('2d');g.clearRect(0,0,192,40);g.font='bold 28px sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=3;g.strokeStyle='#0008';
 for(let i=0;i<MAX_LIVES;i++){const x=16+i*32;g.strokeText('♥',x,21);g.fillStyle=i<p.lives?'#ff3b5c':'#ffffff40';g.fillText('♥',x,21)}p.ht.needsUpdate=true}
const hf=document.createElement('div');hf.style.cssText='position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,#ff1f4400 35%,#ff1f44cc 100%);opacity:0;z-index:5';document.body.appendChild(hf);
function flash(){hf.style.transition='none';hf.style.opacity=1;requestAnimationFrame(()=>requestAnimationFrame(()=>{hf.style.transition='opacity .5s';hf.style.opacity=0}))}
const lh=document.createElement('div');lh.style.cssText='position:fixed;left:20px;bottom:20px;font:900 28px sans-serif;letter-spacing:3px;color:#ff3b5c;text-shadow:0 2px 10px #000a;pointer-events:none;display:none';document.body.appendChild(lh);
function hurt(v,a,iv=1.6){if(v.inv>0||v.wreck>0||v.shield>0)return;v.lives--;if(a&&a!==v){a.score+=25;a.hits++}v.inv=iv;v.shake=.7;sfx('hit');sparks(v.x,v.z,16);flashP(v);
 if(v.lives<=0){v.lives=0;v.item=null;v.wreck=WRECK_TIME;v.speed*=.3;if(a&&a!==v){a.score+=100;a.kills++}else v.score=Math.max(0,v.score-50);say(`💥 ${a.name} WRECKED ${v.name}!`,2600)}else say(`${a.name} HIT ${v.name} — ♥ ${v.lives} LEFT`,2000);drawHearts(v)}
function hitCheck(p,q,dx,dz,d){const nx=dx/d,nz=dz/d,vp=[Math.sin(p.angle)*p.speed,-Math.cos(p.angle)*p.speed],vq=[Math.sin(q.angle)*q.speed,-Math.cos(q.angle)*q.speed];
 const ip=Math.max(0,-(vp[0]*nx+vp[1]*nz)),iq=Math.max(0,vq[0]*nx+vq[1]*nz);
 if(ip+iq<7)return;if(ip>iq*1.5)hurt(q,p);else if(iq>ip*1.5)hurt(p,q);else{hurt(p,q);hurt(q,p)}}
function respawn(p){const s=roadSpot();p.x=s.x;p.z=s.z;p.angle=s.a;p.speed=0;p.delta=0;p.lives=RESPAWN_LIVES;p.wreck=0;p.inv=3;p.boost=100;drawHearts(p);say(`${p.name} IS BACK — ♥ ${p.lives}`,2000)}
/* ---------- MATCH: timer, scoring, shrinking red zone, end screen ---------- */
const MATCH_TIME=220; /* 3:40 — the zone finishes closing and the match ends */
/* ---------- ZONE: multi-phase moving circle ----------
   pre = second when the NEXT safe circle is revealed (white), go = second it starts closing,
   dur = closing time (s), r = final radius, dmg = seconds between damage ticks outside the circle.
   Surviving inside at the end of a phase gives ZONE_BONUS points. */
const ZONE_PH=[
 {pre:0,go:120,dur:15,r:50,dmg:2.0},   /* red zone starts small (ZONE_MAX) → at 2:00 it shrinks to r=50 */
 {pre:135,go:180,dur:12,r:28,dmg:1.4}, /* 1 minute later (3:00) it shrinks again to r=28 */
 {pre:192,go:210,dur:10,r:10,dmg:.9}   /* 30 s later (3:30) it shrinks more to r=10 … and 10 s later (3:40) it ends */
],ZONE_START=MATCH_TIME-ZONE_PH[0].go,ZONE_MAX=78,ZONE_BONUS=20; /* ZONE_MAX = starting radius (map half-size is 116, so it is NOT the whole map) */
const Z={cx:0,cz:0,r:ZONE_MAX,fx:0,fz:0,fr:ZONE_MAX,nx:0,nz:0,nr:ZONE_MAX,i:-1,st:'idle',dmg:2,next:false};
const match={t:0,over:false,warned:false,phase:0};
function zoneActive(){return started&&match.t>=ZONE_PH[0].pre}
function zoneR(){return Z.r}
function zoneSafe(x,z,m){if(Math.hypot(x-Z.cx,z-Z.cz)>Z.r-m)return false;return !Z.next||Math.hypot(x-Z.nx,z-Z.nz)<Z.nr-m}
function zoneWall(col,a){return new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,fog:false,blending:THREE.AdditiveBlending,
 uniforms:{t:{value:0},rad:{value:100},a:{value:a},col:{value:new THREE.Color(col)}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform float t,rad,a;uniform vec3 col;varying vec2 vUv;void main(){float u=vUv.x*max(1.,floor(rad*1.5708+.5));float v=vUv.y*11.5;float h=1.-vUv.y;float gu=smoothstep(.92,1.,fract(u)),gv=smoothstep(.92,1.,fract(v-t*.35));float g=max(gu,gv)*(.3+.7*h);float al=(.06+h*h*.5+g*.5)*a;gl_FragColor=vec4(col*(1.+g),al);}'})}
const zoneMat=zoneWall(0xff2040,1),zoneMat2=zoneWall(0x9ff4ff,.65);
const zoneMesh=new THREE.Mesh(new THREE.CylinderGeometry(1,1,46,96,1,true),zoneMat),zoneNext=new THREE.Mesh(zoneMesh.geometry,zoneMat2);
[zoneMesh,zoneNext].forEach(m=>{m.position.y=22;m.visible=false;m.frustumCulled=false;m.renderOrder=5;scene.add(m)});
function zoneReset(){Object.assign(Z,{cx:0,cz:0,r:ZONE_MAX,fx:0,fz:0,fr:ZONE_MAX,nx:0,nz:0,nr:ZONE_MAX,i:-1,st:'idle',dmg:2,next:false});zoneMesh.visible=zoneNext.visible=false}
/* next circle is always fully inside the current one, but its centre drifts to a random spot */
function zonePick(P){const room=Math.max(0,Z.r-P.r)*.85,an=Math.random()*6.2832,d=Math.sqrt(Math.random())*room,Lm=CITY.limit-P.r*.4;
 Z.nx=clamp(Z.cx+Math.cos(an)*d,-Lm,Lm);Z.nz=clamp(Z.cz+Math.sin(an)*d,-Lm,Lm);Z.nr=P.r}
function zoneBonus(){const n=Z.i+1;for(const p of players.values()){if(p.wreck>0)continue;if(Math.hypot(p.x-Z.cx,p.z-Z.cz)<=Z.r){p.score+=ZONE_BONUS;hudSay(p,`✅ ZONE ${n} SURVIVED +${ZONE_BONUS}`,1800)}}}
function zoneStep(){
 const t=match.t,Pn=ZONE_PH[Z.i+1];
 if(Z.st!=='pre'&&Z.st!=='shrink'&&Pn&&t>=Pn.pre){Z.i++;zonePick(Pn);Z.dmg=Pn.dmg;Z.st='pre';Z.next=true;sfx('zone');
  announce(Z.i===ZONE_PH.length-1?'☠ FINAL ZONE MARKED — LAST STAND!':`⚠ ZONE ${Z.i+1}/${ZONE_PH.length} — SAFE AREA MARKED, START MOVING!`,3200)}
 const C=ZONE_PH[Z.i];if(!C)return;
 if(Z.st==='pre'&&t>=C.go){Z.st='shrink';Z.fx=Z.cx;Z.fz=Z.cz;Z.fr=Z.r;sfx('zone');announce('🔴 THE ZONE IS CLOSING — GET INSIDE THE WHITE CIRCLE',3200)}
 if(Z.st==='shrink'){const k=clamp((t-C.go)/C.dur,0,1);Z.cx=Z.fx+(Z.nx-Z.fx)*k;Z.cz=Z.fz+(Z.nz-Z.fz)*k;Z.r=Z.fr+(Z.nr-Z.fr)*k;
  if(k>=1){Z.st='hold';Z.next=false;zoneBonus()}}
}
function zoneInfo(){const t=match.t,n=ZONE_PH.length,C=ZONE_PH[Z.i],Pn=ZONE_PH[Z.i+1];
 if(Z.st==='pre')return{txt:`ZONE ${Z.i+1}/${n} • CLOSING IN ${Math.max(0,Math.ceil(C.go-t))}s`,col:'#ffe08a'};
 if(Z.st==='shrink')return{txt:`ZONE ${Z.i+1}/${n} • CLOSING ${Math.max(0,Math.ceil(C.go+C.dur-t))}s`,col:'#ff647c'};
 if(Z.st==='hold')return{txt:Pn?`ZONE ${Z.i+1}/${n} HOLDS • NEXT IN ${Math.max(0,Math.ceil(Pn.pre-t))}s`:'FINAL ZONE HOLDS • SURVIVE',col:'#a7f36d'};
 return{txt:'',col:'#fff'}}
function announce(t,ms=2600){say(t,ms);for(const p of players.values())hudSay(p,t,ms)}
function zoneHurt(v){v.lives--;v.shake=.5;sfx('hit');sparks(v.x,v.z,10);flashP(v);
 if(v.lives<=0){v.lives=0;v.item=null;v.wreck=WRECK_TIME;v.speed*=.3;v.score=Math.max(0,v.score-50);say(`🔴 ${v.name} CLAIMED BY THE ZONE`,2400)}drawHearts(v)}
function matchStep(dt){
 if(!started||match.over)return;
 match.t+=dt;
 zoneStep();
 const act=zoneActive(),R2=Z.r,tm=performance.now()/1000;
 zoneMesh.visible=act;zoneNext.visible=act&&Z.next;
 if(act){zoneMesh.scale.set(R2,1,R2);zoneMesh.position.x=Z.cx;zoneMesh.position.z=Z.cz;zoneMat.uniforms.t.value=tm;zoneMat.uniforms.rad.value=R2;zoneMat.uniforms.a.value=.8+Math.sin(tm*6)*.2*(Z.st==='shrink'?1:.4)}
 if(zoneNext.visible){zoneNext.scale.set(Z.nr,1,Z.nr);zoneNext.position.x=Z.nx;zoneNext.position.z=Z.nz;zoneMat2.uniforms.t.value=tm;zoneMat2.uniforms.rad.value=Z.nr}
 for(const p of players.values()){
  p.top=Math.max(p.top,Math.abs(p.speed)*3.6);
  if(p.wreck>0||!act){p._zt=0;p.zout=0;continue}
  const out=Math.hypot(p.x-Z.cx,p.z-Z.cz)>R2;p.zout=out?1:0;
  if(out){hudSay(p,'⚠ OUTSIDE THE ZONE — GET BACK INSIDE!',400);if(p.inv>0){p._zt=0;continue}p._zt=(p._zt||0)+dt;if(p._zt>=Z.dmg){p._zt=0;zoneHurt(p)}}else p._zt=0}
 if(match.t>=MATCH_TIME)endMatch();
}
function ranking(){return [...players.values()].sort((a,b)=>b.score-a.score||b.kills-a.kills||b.lives-a.lives)}
const endEl=document.createElement('div');endEl.hidden=true;
endEl.style.cssText='position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:radial-gradient(ellipse at center,#0b121bd9,#05080dee);font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#fff;text-align:center;overflow:auto';
document.body.appendChild(endEl);
function endMatch(){
 if(match.over)return;match.over=true;zoneMesh.visible=false;zoneNext.visible=false;
 const rk=ranking(),W=rk[0],medals=['🥇','🥈','🥉'];
 const kingK=[...rk].sort((a,b)=>b.kills-a.kills)[0],fast=[...rk].sort((a,b)=>b.top-a.top)[0];
 const col=(p,h,i)=>p?`<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;width:130px"><div style="font-size:30px">${medals[i]}</div><div style="font-weight:900;letter-spacing:1px;margin:4px 0;color:${p.color}">${esc(p.name)}</div><div style="width:100%;height:${h}px;border-radius:12px 12px 0 0;background:linear-gradient(180deg,${p.color},#0b121b);display:grid;place-items:center;font:900 28px Inter,sans-serif">${p.score}</div></div>`:'';
 endEl.innerHTML=`<div style="width:min(760px,94vw);padding:24px 0"><div style="font:800 11px Inter,sans-serif;letter-spacing:4px;color:#91e9f5">MATCH OVER</div>
 <div style="font:900 clamp(34px,6vw,64px);letter-spacing:-2px;margin:8px 0 22px">🏆 <span style="color:${W?W.color:'#fff'}">${W?esc(W.name):'—'}</span> WINS</div>
 <div style="display:flex;justify-content:center;align-items:flex-end;gap:10px;margin-bottom:22px">${col(rk[1],120,1)}${col(rk[0],170,0)}${col(rk[2],85,2)}</div>
 <table style="margin:0 auto;border-collapse:collapse;font-size:13px;min-width:min(560px,92vw)"><tr style="color:#8fa3b2;font-size:10px;letter-spacing:2px"><td></td><td align="left">DRIVER</td><td>SCORE</td><td>WRECKS</td><td>HITS</td><td>TOP KM/H</td></tr>
 ${rk.map((p,i)=>`<tr style="border-top:1px solid #ffffff1a"><td style="padding:8px 6px">${i+1}</td><td align="left"><b style="color:${p.color}">● </b>${esc(p.name)}</td><td><b>${p.score}</b></td><td>${p.kills}</td><td>${p.hits}</td><td>${Math.round(p.top)}</td></tr>`).join('')}</table>
 <div style="margin:18px 0 6px;font-size:12px;color:#c4d2dc;letter-spacing:1px">${kingK&&kingK.kills>0?`💥 KING OF WRECKS: <b style="color:${kingK.color}">${esc(kingK.name)}</b> (${kingK.kills})&nbsp;&nbsp;&nbsp;`:''}${fast?`⚡ SPEED DEMON: <b style="color:${fast.color}">${esc(fast.name)}</b> (${Math.round(fast.top)} km/h)`:''}</div>
 <button id="again-btn" style="margin-top:14px;padding:15px 34px;border:0;border-radius:12px;font:900 14px Inter,sans-serif;letter-spacing:2px;background:linear-gradient(100deg,#b7f66e,#69e8c5);color:#10201d;cursor:pointer">PLAY AGAIN ▶</button></div>`;
 endEl.hidden=false;$('#again-btn').onclick=resetMatch;
 rk.forEach((p,i)=>{if(p.conn&&p.conn.open)p.conn.send({type:'end',rank:i+1,total:rk.length,score:p.score,kills:p.kills,winner:i===0,top:W?W.name:''})});
}
function resetMatch(){
 if(!match.over)return;
 match.t=0;match.over=false;match.phase=0;endEl.hidden=true;zoneReset();
 pickup=null;pickupTimer=PICKUP_EVERY;lifeGroup.visible=false; clearWeapons();
 for(const p of players.values()){const sp=roadSpot();p.x=sp.x;p.z=sp.z;p.angle=sp.a;p.speed=0;p.delta=0;p.lives=MAX_LIVES;p.wreck=0;p.inv=3;p.boost=100;p.item=null;p.ammo=0;p.stun=0;p.slip=0;p.chip=0;p.shield=0;p.score=0;p.kills=0;p.hits=0;p.top=0;p._zt=0;drawHearts(p);if(p.conn&&p.conn.open)p.conn.send({type:'again'})}
 announce('NEW MATCH — GO!',2200);
}
function pickupLogic(dt){
 if(!started)return;
 if(!pickup){pickupTimer-=dt;if(pickupTimer<=0)spawnPickup();return}
 for(const p of players.values()){
  if(p.lives<MAX_LIVES&&!(p.wreck>0)&&Math.hypot(p.x-pickup.x,p.z-pickup.z)<3){
   p.lives++;p.score+=10;drawHearts(p);for(let i=0;i<28;i++){const a=i/28*Math.PI*2;emit(pickup.x,1.5,pickup.z,Math.cos(a)*6,3+Math.random()*3,Math.sin(a)*6,1,.3,.45,.8)}
   pickup=null;pickupTimer=PICKUP_EVERY;lifeGroup.visible=false;say(`${p.name} +1 ❤ — ♥ ${p.lives}`,2200);break}}
}

/* ---------- road items: 🚀 homing missile and 💣 mine (pick up by driving over, fire with SPACE / FIRE button) ----------
   ITEM_EVERY = seconds between item spawns, ITEM_MAX = max items lying on the map. */
const ITEM_EVERY=5,ITEM_MAX=8,MINE_MAX=30;
const items=[],projs=[],mines=[],blasts=[];let itemTimer=2;
const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a)),itemTex={};
function emojiTex(e){if(itemTex[e])return itemTex[e];const c=document.createElement('canvas');c.width=c.height=96;const g=c.getContext('2d');g.font='64px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(e,48,52);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return itemTex[e]=t}
/* ---------- weapon pickup models: every weapon lies on the road as its OWN 3D object (spins + floats) ---------- */
const WM=(()=>{
 const P=Math.PI,H=P/2,gc={},mc={};
 const G=(k,f)=>gc[k]||(gc[k]=f());
 const cyl=(a,b,h,s=14)=>G('c'+a+'_'+b+'_'+h+'_'+s,()=>new THREE.CylinderGeometry(a,b,h,s));
 const box=(x,y,z)=>G('b'+x+'_'+y+'_'+z,()=>new THREE.BoxGeometry(x,y,z));
 const sph=(r,w=16,h=12)=>G('s'+r+'_'+w+'_'+h,()=>new THREE.SphereGeometry(r,w,h));
 const cone=(r,h,s=12)=>G('n'+r+'_'+h+'_'+s,()=>new THREE.ConeGeometry(r,h,s));
 const tor=(r,t,s=28)=>G('t'+r+'_'+t+'_'+s,()=>new THREE.TorusGeometry(r,t,10,s));
 const mat=(c,o={})=>{const k=c+'_'+JSON.stringify(o);return mc[k]||(mc[k]=new THREE.MeshStandardMaterial({color:c,metalness:o.m??.35,roughness:o.r??.45,emissive:o.e??c,emissiveIntensity:o.ei??.22,side:o.d?THREE.DoubleSide:THREE.FrontSide}))};
 const glow=(c,op=.8)=>{const k='g'+c+'_'+op;return mc[k]||(mc[k]=new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:op,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}))};
 const add=(g,geo,m,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);g.add(o);return o};
 const wrap=(g,s)=>{g.scale.setScalar(s);return g};
 const dark=mat(0x2a3037,{m:.5,r:.4}),steel=mat(0x8794a0,{m:.5,r:.3}),wood=mat(0x8a5a32,{m:.05,r:.7,ei:.12}),
  yel=mat(0xffd23a,{e:0xffb800,ei:.7,m:.2}),red=mat(0xe03a2f,{e:0x801008,ei:.6}),white=mat(0xe6ebef,{m:.4,r:.3}),
  cyan=mat(0x7ff4ff,{e:0x39e6ff,ei:1.5,m:.2}),purple=mat(0xc77dff,{e:0x9a3dff,ei:1.3,m:.2}),orange=mat(0xff7a2d,{e:0xff5a10,ei:1,m:.2}),
  black=mat(0x14101c,{m:.9,r:.08,e:0x221a33,ei:.5});
 /* a rocket lying along X, nose to +X (used by MISSILE and MISSILE SWARM) */
 const rocket=(g,x,y,z,s,fl)=>{
  add(g,cyl(.3*s,.3*s,2*s),white,x,y,z,0,0,H);
  add(g,cone(.3*s,.8*s),red,x+1.4*s,y,z,0,0,-H);
  add(g,cyl(.31*s,.31*s,.26*s),yel,x+.4*s,y,z,0,0,H);
  add(g,box(.5*s,.9*s,.05*s),red,x-.85*s,y,z);
  add(g,box(.5*s,.05*s,.9*s),red,x-.85*s,y,z);
  if(fl)add(g,cone(.22*s,.9*s),glow(0xff9a3a,.85),x-1.45*s,y,z,0,0,H)};
 const M={};
 M.missile=()=>{const g=new THREE.Group();rocket(g,0,0,0,1.15,true);return wrap(g,1)};
 M.swarm=()=>{const g=new THREE.Group();rocket(g,0,.3,0,.85,true);rocket(g,0,-.15,.28,.85,true);rocket(g,0,-.15,-.28,.85,true);
  add(g,tor(.56,.05,20),yel,-.3,0,0,0,H,0);add(g,tor(.56,.05,20),yel,.5,0,0,0,H,0);return wrap(g,1)};
 M.mine=()=>{const g=new THREE.Group(),m=new THREE.Group();g.add(m);
  add(m,cyl(1.15,1.25,.32,24),dark);
  add(m,cyl(.95,1.05,.16,24),mat(0x4a5a2c,{m:.3}),0,.24,0);
  add(m,cyl(.55,.6,.14,20),red,0,.38,0);
  add(m,cyl(.2,.2,.18,12),glow(0xff2a2a,1),0,.5,0);
  for(let i=0;i<8;i++){const a=i/8*P*2;add(m,cone(.1,.32,8),steel,Math.cos(a)*1.05,.3,Math.sin(a)*1.05)}
  add(m,tor(1.15,.07,28),yel,0,.12,0,H,0,0);
  m.rotation.x=.5;return wrap(g,1.1)};
 M.mg=()=>{const g=new THREE.Group();
  add(g,box(1.5,.42,.36),dark);
  add(g,box(1.52,.06,.38),yel,0,.2,0);
  add(g,cyl(.15,.15,.9,12),dark,1.15,.08,0,0,0,H);
  add(g,cyl(.07,.07,1.6,10),steel,1.6,.08,0,0,0,H);
  add(g,cyl(.11,.11,.26,10),steel,2.4,.08,0,0,0,H);
  add(g,cyl(.44,.44,.3,18),dark,.15,-.55,0,H,0,0);
  add(g,cyl(.3,.3,.32,18),yel,.15,-.55,0,H,0,0);
  add(g,box(.2,.55,.22),dark,-.5,-.45,0,0,0,.25);
  add(g,box(.95,.3,.26),dark,-1.2,-.04,0);
  add(g,box(.12,.5,.3),yel,-1.7,-.04,0);
  add(g,box(.55,.1,.14),steel,.4,.28,0);
  add(g,box(.1,.26,.1),steel,1.1,.3,0);
  return wrap(g,.78)};
 M.shotgun=()=>{const g=new THREE.Group();
  add(g,cyl(.11,.11,2.6,12),steel,.75,.14,0,0,0,H);
  add(g,cyl(.09,.09,2.0,12),steel,.5,-.08,0,0,0,H);
  add(g,box(.85,.28,.34),wood,.55,-.12,0);
  add(g,box(.95,.44,.3),dark,-.65,.02,0);
  add(g,box(1.3,.36,.26),wood,-1.75,-.14,0,0,0,.13);
  add(g,box(.1,.5,.3),dark,-2.4,-.2,0,0,0,.13);
  for(const x of [-.85,-.6]){add(g,cyl(.085,.085,.38,10),red,x,.5,0);add(g,cyl(.09,.09,.1,10),yel,x,.3,0)}
  add(g,sph(.09,8,6),orange,2.05,.28,0);
  return wrap(g,.78)};
 M.rail=()=>{const g=new THREE.Group();
  add(g,box(1.3,.46,.42),dark,-.75,0,0);
  add(g,box(2.8,.12,.12),steel,.85,.17,.2);add(g,box(2.8,.12,.12),steel,.85,.17,-.2);
  add(g,cyl(.06,.06,2.8,8),cyan,.85,.17,0,0,0,H);
  for(let i=0;i<4;i++)add(g,tor(.3,.06,20),cyan,.15+i*.5,.17,0,0,H,0);
  add(g,cyl(.24,.24,.8,14),dark,-.85,.5,0,0,0,H);
  add(g,tor(.25,.04,16),cyan,-.65,.5,0,0,H,0);add(g,tor(.25,.04,16),cyan,-1.05,.5,0,0,H,0);
  add(g,box(.2,.55,.22),dark,-1.0,-.45,0,0,0,.2);
  add(g,cone(.12,.4),cyan,2.45,.17,0,0,0,-H);
  return wrap(g,.85)};
 M.oil=()=>{const g=new THREE.Group();
  add(g,cyl(.7,.7,1.5,20),dark);
  add(g,cyl(.715,.715,.34,20),yel);
  for(const y of [-.62,.62])add(g,tor(.71,.05,24),steel,0,y,0,H,0,0);
  for(const y of [-.3,.3])add(g,tor(.71,.035,24),steel,0,y,0,H,0,0);
  add(g,cyl(.2,.2,.12,10),steel,.2,.78,.1);
  add(g,cyl(1.3,1.3,.05,28),black,0,-.78,0);
  add(g,sph(.13,10,8),black,.62,.25,0).scale.set(1,1.6,1);
  return wrap(g,1.05)};
 M.emp=()=>{const g=new THREE.Group();
  add(g,G('dish',()=>new THREE.SphereGeometry(1,24,12,0,P*2,0,H)),mat(0xaebdca,{m:.4,r:.35,d:true}),-.3,0,0,0,0,H);
  add(g,cyl(.04,.04,1.2,8),steel,.3,0,0,0,0,H);
  add(g,sph(.17,12,8),cyan,.95,0,0);
  add(g,cyl(.1,.1,.7,10),dark,-.5,-1.2,0);
  add(g,cyl(.5,.6,.12,16),dark,-.5,-1.6,0);
  add(g,tor(.75,.035,36),glow(0x59f4ff,.7),1.5,0,0,0,H,0);
  add(g,tor(1.1,.03,36),glow(0x59f4ff,.45),1.95,0,0,0,H,0);
  g.position.y=0;return wrap(g,.85)};
 M.grenade=()=>{const g=new THREE.Group(),ol=mat(0x3d5a2a,{m:.3,r:.5,e:0x16300a,ei:.5});
  add(g,sph(.55,18,14),ol).scale.set(1,1.2,1);
  for(const y of [-.28,.28])add(g,tor(.51,.03,24),steel,0,y,0,H,0,0);
  add(g,tor(.565,.03,24),steel,0,0,0,H,0,0);
  for(let i=0;i<2;i++)add(g,tor(.565,.028,28),ol,0,0,0,0,i*H,0).scale.y=1.2;
  add(g,cyl(.2,.2,.24,12),steel,0,.74,0);
  add(g,box(.1,.8,.06),steel,.3,.5,0,0,0,-.12);
  add(g,tor(.17,.03,14),yel,-.12,.98,0);
  return wrap(g,1.5)};
 M.flame=()=>{const g=new THREE.Group(),tk=mat(0xc0332a,{e:0x600e08,ei:.5});
  add(g,cyl(.42,.42,1.5,18),tk,-.95,0,0,0,0,H);
  add(g,sph(.42,14,10),tk,-1.7,0,0).scale.x=.35;add(g,sph(.42,14,10),tk,-.2,0,0).scale.x=.35;
  for(const x of [-1.5,-.4])add(g,tor(.43,.04,20),steel,x,0,0,0,H,0);
  add(g,cyl(.1,.1,.25,8),steel,-.95,.52,0);
  add(g,G('hose',()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-.95,.6,0),new THREE.Vector3(-.4,.95,0),new THREE.Vector3(.1,.55,0),new THREE.Vector3(.2,.2,0)]),20,.06,8)),dark);
  add(g,box(.9,.32,.32),dark,.35,0,0);
  add(g,cyl(.14,.09,1.1,10),steel,1.35,.04,0,0,0,H);
  add(g,box(.18,.5,.2),dark,.2,-.4,0);
  add(g,cone(.35,1.3),glow(0xff7a2d,.85),2.55,.04,0,0,0,-H);
  add(g,cone(.18,.9),glow(0xffe08a,.95),2.35,.04,0,0,0,-H);
  return wrap(g,.7)};
 M.shock=()=>{const g=new THREE.Group();
  add(g,sph(.38,16,12),purple);
  [[1.35,.5],[1.05,.2],[.75,-.1],[.45,-.4]].forEach(([r,y])=>add(g,tor(r,.07,32),purple,0,y,0,H,0,0));
  add(g,cone(.22,.55,12),purple,0,-.75,0,P,0,0);
  add(g,tor(1.7,.03,40),glow(0xc77dff,.5),0,-.2,0,H,0,0);
  return wrap(g,.95)};
 M.turret=()=>{const g=new THREE.Group(),t=makeTurret();t.position.y=-.9;g.add(t);return wrap(g,.95)};
 M.shield=()=>{const g=new THREE.Group();
  const geo=G('shield',()=>{const s=new THREE.Shape();s.moveTo(-.9,.95);s.lineTo(.9,.95);s.lineTo(.9,.05);s.quadraticCurveTo(.9,-.8,0,-1.3);s.quadraticCurveTo(-.9,-.8,-.9,.05);s.lineTo(-.9,.95);
   const e=new THREE.ExtrudeGeometry(s,{depth:.16,bevelEnabled:true,bevelSize:.08,bevelThickness:.06,bevelSegments:2,curveSegments:12});e.translate(0,0,-.08);return e});
  add(g,geo,mat(0x2fd9a0,{m:.45,r:.3,e:0x14ffb0,ei:.7}),0,.17,0);
  add(g,geo,white,0,.21,.1).scale.set(.62,.62,.6);
  add(g,geo,white,0,.21,-.1,0,P,0).scale.set(.62,.62,.6);
  return wrap(g,.95)};
 return M})();
function makeItemMesh(type){
 const g=new THREE.Group(),col=ARMS[type]?ARMS[type].col:0x6dffb0;
 const orb=(WM[type]||WM.shield)();orb.position.y=2;g.add(orb);
 const ic=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:col,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.5}));ic.scale.set(6.5,6.5,1);ic.position.y=2;g.add(ic);
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
  if(k==='boom'||k==='hit'||k==='gun'){
   const len=k==='boom'?.9:k==='gun'?.07:.35,buf=ac.createBuffer(1,ac.sampleRate*len|0,ac.sampleRate),d=buf.getChannelData(0);
   for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2);
   const s=ac.createBufferSource();s.buffer=buf;const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(k==='boom'?1400:700,t);f.frequency.exponentialRampToValueAtTime(60,t+len);
   const g=ac.createGain();g.gain.value=k==='boom'?.55:k==='gun'?.14:.3;s.connect(f);f.connect(g);g.connect(ac.destination);s.start(t)
  }else{
   const o=ac.createOscillator(),g=ac.createGain();o.type=k==='fire'?'sawtooth':'sine';
   const f0=k==='pick'?520:k==='zoom'?300:900,f1=k==='pick'?1040:k==='zoom'?900:200;
   o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+.25);
   g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+.32)
  }}catch(e){}
}
function spawnItem(){
 const s=roadSpot(),type=pickType(),g=makeItemMesh(type);
 g.position.set(s.x,0,s.z);scene.add(g);items.push({type,x:s.x,z:s.z,g,ph:Math.random()*6})}
function explode(x,z,owner,R){
 sfx('boom');for(let i=0;i<46;i++){const a=Math.random()*6.283,s=4+Math.random()*14;emit(x,.6+Math.random()*1.5,z,Math.cos(a)*s,2+Math.random()*7,Math.sin(a)*s,1,.45+Math.random()*.4,.1,.7+Math.random()*.5)}
 for(let i=0;i<20;i++){const a=Math.random()*6.283,s=2+Math.random()*5;emit(x,1+Math.random()*2,z,Math.cos(a)*s,1+Math.random()*3,Math.sin(a)*s,.6,.6,.6,1.2)}
 const bs=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xffa040,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));bs.position.set(x,1.2,z);scene.add(bs);blasts.push({s:bs,life:.45});
 for(const q of players.values()){const dd=Math.hypot(q.x-x,q.z-z);if(dd<35)q.shake=Math.max(q.shake||0,1-dd/35);if(q.wreck>0)continue;if(dd<R){hurt(q,owner);q.speed*=.45}}
 const rr=R*1.7;
 for(const b of solids){const dx=b.x-x,dz=b.z-z,d=Math.hypot(dx,dz)||.01;if(d<rr){const f=(1-d/rr)*46/(1+b.mass*.3);b.vx=clamp(b.vx+dx/d*f,-38,38);b.vz=clamp(b.vz+dz/d*f,-38,38);movers.add(b)}}
}
/* ---------- ARSENAL: 12 weapons. ammo = uses (or shots for auto weapons), auto = seconds between shots while FIRE is held, w = spawn weight ---------- */
const ARMS={
 missile:{n:'MISSILE',ic:'🚀',col:0xffc94d,ammo:1,w:3},
 mine:{n:'MINE',ic:'💣',col:0x6fc8ff,ammo:1,w:2},
 mg:{n:'MACHINE GUN',ic:'🔫',col:0xffe14d,ammo:40,auto:.07,w:3},
 shotgun:{n:'SHOTGUN',ic:'🎯',col:0xff9a4d,ammo:4,w:2},
 rail:{n:'RAILGUN',ic:'⚡',col:0x7ff4ff,ammo:3,w:2},
 oil:{n:'OIL SLICK',ic:'🛢️',col:0x9a8f7a,ammo:2,w:2},
 emp:{n:'EMP',ic:'📡',col:0x59f4ff,ammo:1,w:1.5},
 grenade:{n:'GRENADE',ic:'🧨',col:0xff5a4d,ammo:3,w:2},
 swarm:{n:'MISSILE SWARM',ic:'🐝',col:0xffd24d,ammo:1,w:1.5},
 flame:{n:'FLAMETHROWER',ic:'🔥',col:0xff7a2d,ammo:90,auto:.05,w:2},
 shock:{n:'SHOCKWAVE',ic:'🌀',col:0xc77dff,ammo:1,w:1.5},
 turret:{n:'AUTO TURRET',ic:'🗼',col:0xff4d6d,ammo:1,w:1.5}
};
function pickType(){const ks=Object.keys(ARMS);let tot=3;for(const k of ks)tot+=ARMS[k].w;let r=Math.random()*tot;for(const k of ks){r-=ARMS[k].w;if(r<0)return k}return 'shield'}
const bullets=[],oils=[],turrets=[],beams=[],bulMat={};
function bulletSprite(col){if(!bulMat[col])bulMat[col]=new THREE.SpriteMaterial({map:glowTex,color:col,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});return new THREE.Sprite(bulMat[col])}
function spawnBullet(o,x,z,ang,spd,life,dmg,col){const g=bulletSprite(col);g.scale.set(1.7,1.7,1);g.position.set(x,1,z);scene.add(g);bullets.push({g,x,z,vx:Math.sin(ang)*spd,vz:-Math.cos(ang)*spd,life,owner:o,dmg});if(bullets.length>180){const b=bullets.shift();scene.remove(b.g)}}
/* bullets and flames do fractional damage: every 1.0 accumulated = 1 heart (shields absorb everything) */
function chipHit(v,a,amt){if(v.inv>0||v.wreck>0||v.shield>0)return;v.chip=(v.chip||0)+amt;if(a&&a!==v)a.score+=1;if(v.chip>=1){v.chip-=1;hurt(v,a,.3)}}
function ring(x,z,col,big){const bs=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:col,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));bs.position.set(x,1.2,z);scene.add(bs);blasts.push({s:bs,life:.45,big})}
function makeGrenade(){const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.SphereGeometry(.5,12,10),new THREE.MeshStandardMaterial({color:0x2f4a2a,roughness:.5,metalness:.3})));
 const f=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xff7a2d,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));f.scale.set(2.2,2.2,1);g.add(f);return g}
function makeTurret(){const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0x39424a,metalness:.6,roughness:.4});
 const base=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.4,.7,14),m);base.position.y=.35;g.add(base);
 const head=new THREE.Group();head.position.y=1.1;g.add(head);
 head.add(new THREE.Mesh(new THREE.SphereGeometry(.8,14,10),new THREE.MeshStandardMaterial({color:0xb02f2f,metalness:.4,roughness:.4})));
 const gun=new THREE.Mesh(new THREE.BoxGeometry(.25,.25,1.8),m);gun.position.set(0,0,-1.1);head.add(gun);
 const led=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xff3030,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));led.scale.set(2,2,1);led.position.y=1.9;g.add(led);
 g.userData.head=head;return g}
function railBeam(p,sn,cs){
 let len=130;for(let d=2.5;d<130;d+=1.5){const x=p.x+sn*d,z=p.z-cs*d;if(solids.some(b=>x>b.x0-.3&&x<b.x1+.3&&z>b.z0-.3&&z<b.z1+.3)){len=d;break}}
 for(const q of players.values()){if(q===p||q.wreck>0)continue;const dx=q.x-p.x,dz=q.z-p.z,f=dx*sn-dz*cs,lat=Math.abs(dx*cs+dz*sn);if(f>0&&f<len&&lat<2.6){hurt(q,p);q.speed*=.5;sparks(q.x,q.z,14)}}
 const g=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,len),new THREE.MeshBasicMaterial({color:0x7ff4ff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
 g.position.set(p.x+sn*(len/2+2.4),1,p.z-cs*(len/2+2.4));g.rotation.y=-p.angle;scene.add(g);beams.push({g,life:.3})}
function useItem(p){
 const t=p.item,w=ARMS[t];if(!w)return;
 const sn=Math.sin(p.angle),cs=Math.cos(p.angle),fx=p.x+sn*2.6,fz=p.z-cs*2.6;
 p.ammo=(p.ammo||1)-1;const last=p.ammo<=0;if(last){p.item=null;p.ammo=0}
 switch(t){
  case 'missile':{const g=makeMissile();scene.add(g);projs.push({g,x:p.x+sn*3.2,z:p.z-cs*3.2,a:p.angle,v:85,life:3,owner:p});sfx('fire');hudSay(p,'🚀 MISSILE FIRED',900);break}
  case 'mine':{const g=makeMine(),x=p.x-sn*3.6,z=p.z+cs*3.6;g.position.set(x,0,z);scene.add(g);mines.push({g,x,z,owner:p,arm:1.5});if(mines.length>MINE_MAX){const o=mines.shift();scene.remove(o.g)}hudSay(p,'💣 MINE DROPPED',900);break}
  case 'mg':{spawnBullet(p,fx,fz,p.angle+(Math.random()-.5)*.05,115,.75,.12,0xffe14d);sfx('gun');emit(fx,1,fz,sn*4,.5,-cs*4,1,.9,.4,.1);break}
  case 'shotgun':{for(let i=0;i<7;i++)spawnBullet(p,fx,fz,p.angle+(Math.random()-.5)*.4,95,.4,.22,0xffb060);sfx('hit');sparks(fx,fz,6);hudSay(p,'🎯 BOOM',500);break}
  case 'rail':{railBeam(p,sn,cs);sfx('fire');hudSay(p,'⚡ RAILGUN',700);break}
  case 'oil':{const g=new THREE.Mesh(new THREE.CircleGeometry(4.5,28),new THREE.MeshBasicMaterial({color:0x07080a,transparent:true,opacity:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})),x=p.x-sn*4.5,z=p.z+cs*4.5;
   g.rotation.x=-Math.PI/2;g.position.set(x,.045,z);scene.add(g);oils.push({g,x,z,owner:p,life:14,age:0});hudSay(p,'🛢️ OIL SLICK DROPPED',900);break}
  case 'emp':{ring(p.x,p.z,0x6fe8ff,70);sfx('boom');let n=0;for(const q of players.values()){if(q===p||q.wreck>0||q.shield>0)continue;if(Math.hypot(q.x-p.x,q.z-p.z)<32){q.stun=2.5;n++;hudSay(q,'⚡ EMP — ENGINE DEAD',1500);flashP(q)}}hudSay(p,'📡 EMP — '+n+' HIT',1000);break}
  case 'grenade':{const g=makeGrenade();scene.add(g);projs.push({g,x:fx,z:fz,a:p.angle,v:34+Math.max(p.speed,0)*.6,life:.95,owner:p,gren:true,R:9});sfx('fire');hudSay(p,'🧨 GRENADE',700);break}
  case 'swarm':{for(const off of [-.3,0,.3]){const g=makeMissile();g.scale.setScalar(.65);scene.add(g);projs.push({g,x:fx,z:fz,a:p.angle+off,v:75,life:2.4,owner:p,R:4.5,turn:2.8})}sfx('fire');hudSay(p,'🐝 SWARM LAUNCHED',900);break}
  case 'flame':{for(let i=0;i<4;i++){const sp=16+Math.random()*10,a=p.angle+(Math.random()-.5)*.3;emit(fx,.9,fz,Math.sin(a)*sp,Math.random()*1.5,-Math.cos(a)*sp,1,.35+Math.random()*.45,.05,.4)}
   for(const q of players.values()){if(q===p||q.wreck>0)continue;const dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz);if(d<15&&d>.5&&Math.abs(wrapA(Math.atan2(dx,-dz)-p.angle))<.33){chipHit(q,p,.035);q.shake=Math.max(q.shake||0,.25)}}break}
  case 'shock':{ring(p.x,p.z,0xd9a0ff,60);sfx('boom');
   for(const q of players.values()){if(q===p||q.wreck>0)continue;const dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz)||.01;if(d<26){const k=1-d/26;q.x+=dx/d*8*k;q.z+=dz/d*8*k;q.speed*=.55;q.shake=Math.max(q.shake||0,.6)}}
   for(const b of solids){const dx=b.x-p.x,dz=b.z-p.z,d=Math.hypot(dx,dz)||.01;if(d<32){const f=(1-d/32)*60/(1+b.mass*.3);b.vx=clamp(b.vx+dx/d*f,-38,38);b.vz=clamp(b.vz+dz/d*f,-38,38);movers.add(b)}}
   hudSay(p,'🌀 SHOCKWAVE',800);break}
  case 'turret':{if(turrets.length>=8){const o=turrets.shift();scene.remove(o.g)}const g=makeTurret(),x=p.x-sn*3.2,z=p.z+cs*3.2;g.position.set(x,0,z);scene.add(g);turrets.push({g,x,z,owner:p,life:12,cd:.5});hudSay(p,'🗼 TURRET DEPLOYED — 12s',1200);break}
 }
 if(last&&w.auto)hudSay(p,'OUT OF AMMO',900);
}
/* bullets, oil slicks, turrets and railgun beams */
function stepArms(dt){
 for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.life-=dt;let dead=b.life<=0;
  for(let s=0;s<2&&!dead;s++){b.x+=b.vx*dt/2;b.z+=b.vz*dt/2;
   if(Math.abs(b.x)>CITY.limit||Math.abs(b.z)>CITY.limit){dead=true;break}
   for(const q of players.values()){if(q===b.owner||q.wreck>0)continue;if(Math.hypot(q.x-b.x,q.z-b.z)<2.1){chipHit(q,b.owner,b.dmg);sparks(b.x,b.z,3);dead=true;break}}
   if(!dead)for(const o of solids){if(b.x>o.x0&&b.x<o.x1&&b.z>o.z0&&b.z<o.z1){sparks(b.x,b.z,2);dead=true;break}}}
  b.g.position.set(b.x,1,b.z);if(dead){scene.remove(b.g);bullets.splice(i,1)}}
 for(let i=oils.length-1;i>=0;i--){const o=oils[i];o.life-=dt;o.age+=dt;if(o.life<2)o.g.material.opacity=.85*Math.max(0,o.life/2);
  for(const q of players.values()){if(q.wreck>0||(q===o.owner&&o.age<2))continue;if(Math.hypot(q.x-o.x,q.z-o.z)<4.5){if(!(q.slip>0))hudSay(q,'🛢️ OIL!',700);q.slip=Math.max(q.slip||0,.7);q.speed*=Math.pow(.996,dt*60)}}
  if(o.life<=0){scene.remove(o.g);o.g.geometry.dispose();o.g.material.dispose();oils.splice(i,1)}}
 for(let i=turrets.length-1;i>=0;i--){const t=turrets[i];t.life-=dt;t.cd-=dt;let tg=null,bd=38;
  for(const q of players.values()){if(q===t.owner||q.wreck>0)continue;const d=Math.hypot(q.x-t.x,q.z-t.z);if(d<bd){bd=d;tg=q}}
  if(tg){const an=Math.atan2(tg.x-t.x,-(tg.z-t.z));t.g.userData.head.rotation.y=-an;if(t.cd<=0){t.cd=.28;spawnBullet(t.owner,t.x+Math.sin(an)*1.8,t.z-Math.cos(an)*1.8,an+(Math.random()-.5)*.06,100,.6,.25,0xff6a6a);sfx('gun')}}
  if(t.life<=0){explode(t.x,t.z,t.owner,0);scene.remove(t.g);turrets.splice(i,1)}}
 for(let i=beams.length-1;i>=0;i--){const b=beams[i];b.life-=dt;b.g.material.opacity=Math.max(0,b.life/.3);if(b.life<=0){scene.remove(b.g);b.g.geometry.dispose();b.g.material.dispose();beams.splice(i,1)}}
}
function clearWeapons(){for(const b of bullets)scene.remove(b.g);bullets.length=0;for(const o of oils){scene.remove(o.g)}oils.length=0;for(const t of turrets)scene.remove(t.g);turrets.length=0;for(const b of beams)scene.remove(b.g);beams.length=0}
function stepWeapons(dt){
 if(started){
  itemTimer-=dt;if(itemTimer<=0){itemTimer=ITEM_EVERY;if(items.length<ITEM_MAX)spawnItem()}
  const t=performance.now()/1000;
  for(let i=items.length-1;i>=0;i--){const it=items[i],u=it.g.userData,y=2+Math.sin(t*3+it.ph)*.3;u.orb.position.y=y;u.ic.position.y=y;u.orb.rotation.y=t*2;
   for(const p of players.values()){if(p.wreck>0||(p.item&&it.type!=='shield'))continue;if(Math.hypot(p.x-it.x,p.z-it.z)<3){if(it.type==='shield')p.shield=8;else{p.item=it.type;p.ammo=ARMS[it.type].ammo}scene.remove(it.g);items.splice(i,1);sfx('pick');hudSay(p,ARMS[it.type]?ARMS[it.type].ic+' GOT '+ARMS[it.type].n+(ARMS[it.type].ammo>1?' ×'+ARMS[it.type].ammo:''):'🛡️ SHIELD ON — 8s',1400);break}}}
 }
 for(let i=projs.length-1;i>=0;i--){
  const m=projs[i];m.life-=dt;let tg=null,bd=70;
  for(const q of players.values()){if(q===m.owner||q.wreck>0)continue;const dx=q.x-m.x,dz=q.z-m.z,d=Math.hypot(dx,dz);if(d<bd){const an=Math.atan2(dx,-dz);if(Math.abs(wrapA(an-m.a))<.9){bd=d;tg=an}}}
  if(tg!==null&&!m.gren)m.a+=clamp(wrapA(tg-m.a),-(m.turn||1.8)*dt,(m.turn||1.8)*dt);
  const sn=Math.sin(m.a),cs=Math.cos(m.a);m.x+=sn*m.v*dt;m.z-=cs*m.v*dt;
  m.g.position.set(m.x,m.gren?1+Math.sin(Math.PI*clamp(1-m.life/.95,0,1))*5:.9,m.z);m.g.rotation.y=-m.a;
  emit(m.x+sn*1.4,.9,m.z-cs*1.4,(Math.random()-.5)*2,Math.random()*1.2,(Math.random()-.5)*2,1,.55,.15,.35);
  let hit=m.life<=0||Math.abs(m.x)>CITY.limit||Math.abs(m.z)>CITY.limit;
  if(!hit)for(const q of players.values()){if(q===m.owner||q.wreck>0)continue;if(Math.hypot(q.x-m.x,q.z-m.z)<2.4){hit=true;break}}
  if(!hit&&!m.gren)for(const b of solids){if(m.x>b.x0-.4&&m.x<b.x1+.4&&m.z>b.z0-.4&&m.z<b.z1+.4){hit=true;break}}
  if(hit){explode(m.x,m.z,m.owner,m.R||7);scene.remove(m.g);projs.splice(i,1)}
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
 for(let i=blasts.length-1;i>=0;i--){const b=blasts[i];b.life-=dt;const k=Math.max(b.life/.45,0),sz=4+(1-k)*(b.big||16);b.s.scale.set(sz,sz,1);b.s.material.opacity=k;if(b.life<=0){scene.remove(b.s);b.s.material.dispose();blasts.splice(i,1)}}
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
const MMS=240,K=MMS/(CITY.limit*2),mm=document.createElement('canvas');mm.width=mm.height=MMS;
mm.style.cssText='position:fixed;right:18px;bottom:18px;width:168px;height:168px;border-radius:18px;border:1px solid #ffffff30;display:none;pointer-events:none;box-shadow:0 10px 30px #0008';document.body.appendChild(mm);
const mmBase=document.createElement('canvas');mmBase.width=mmBase.height=MMS;
(()=>{const g=mmBase.getContext('2d'),X=v=>MMS/2+v*K,rr=(x,y,w,h,r)=>{g.beginPath();g.roundRect?g.roundRect(x,y,w,h,r):g.rect(x,y,w,h)};
 const bg=g.createLinearGradient(0,0,0,MMS);bg.addColorStop(0,'#1d3140');bg.addColorStop(1,'#12202c');g.fillStyle=bg;g.fillRect(0,0,MMS,MMS);
 const bs=(S-CITY.road)*K;
 for(let gx=-4;gx<4;gx++)for(let gz=-4;gz<4;gz++){const park=(gx===-1&&gz===1)||(gx===2&&gz===-2);rr(X((gx+.5)*S)-bs/2,X((gz+.5)*S)-bs/2,bs,bs,4);g.fillStyle=park?'#2f6b44':'#26394a';g.fill();g.strokeStyle=park?'#4f9a68':'#35506a';g.lineWidth=1;g.stroke()}
 g.fillStyle='#5a6775';for(let i=-4;i<=4;i++){const c=X(i*S);g.fillRect(c-R*K,0,CITY.road*K,MMS);g.fillRect(0,c-R*K,MMS,CITY.road*K)}
 g.strokeStyle='#e9dfb8aa';g.lineWidth=1;g.setLineDash([5,5]);for(let i=-4;i<=4;i++){const c=X(i*S);g.beginPath();g.moveTo(c,0);g.lineTo(c,MMS);g.moveTo(0,c);g.lineTo(MMS,c);g.stroke()}g.setLineDash([]);
 g.strokeStyle='#59f4ff66';g.lineWidth=2;g.strokeRect(1,1,MMS-2,MMS-2)})();
const nitro=document.createElement('div');nitro.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);width:230px;display:none;pointer-events:none;font:900 9px Inter,sans-serif;letter-spacing:2px;color:#ffcf68;text-align:center';
nitro.innerHTML='NITRO<div style="margin-top:5px;height:8px;border-radius:6px;background:#101923b8;border:1px solid #ffffff30;overflow:hidden"><div id="nitro-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#ffcf68,#ff7a3d)"></div></div>';document.body.appendChild(nitro);
function mmTri(g,x,y,a,sz,fill,stroke){g.save();g.translate(x,y);g.rotate(a);g.beginPath();g.moveTo(0,-sz);g.lineTo(sz*.8,sz*.75);g.lineTo(0,sz*.35);g.lineTo(-sz*.8,sz*.75);g.closePath();g.fillStyle=fill;g.fill();g.lineWidth=2;g.strokeStyle=stroke;g.stroke();g.restore()}
function drawMap(focus,cv){const g=(cv||mm).getContext('2d'),t=performance.now();g.drawImage(mmBase,0,0);
 g.fillStyle='#c08a55aa';for(const b of solids)g.fillRect(MMS/2+b.x0*K,MMS/2+b.z0*K,Math.max(2,(b.x1-b.x0)*K),Math.max(2,(b.z1-b.z0)*K));
 if(pickup){const x=MMS/2+pickup.x*K,y=MMS/2+pickup.z*K;g.fillStyle='#ff4d6d';g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.arc(x,y,6+Math.sin(t/180)*2,0,7);g.fill();g.stroke()}
 for(const it of items){const x=MMS/2+it.x*K,y=MMS/2+it.z*K;g.fillStyle=ARMS[it.type]?'#'+ARMS[it.type].col.toString(16).padStart(6,'0'):'#6dffb0';g.strokeStyle='#0008';g.lineWidth=1.5;g.beginPath();g.arc(x,y,4.2,0,7);g.fill();g.stroke()}
 if(zoneActive()&&!match.over){const c=MMS/2,zx=c+Z.cx*K,zy=c+Z.cz*K,zr=Z.r*K;g.save();g.beginPath();g.rect(0,0,MMS,MMS);g.arc(zx,zy,Math.max(2,zr),0,Math.PI*2);g.fillStyle='rgba(255,40,70,'+(.28+Math.sin(t/200)*.08)+')';g.fill('evenodd');g.restore();g.strokeStyle='#ff3d5c';g.lineWidth=3;g.beginPath();g.arc(zx,zy,Math.max(2,zr),0,Math.PI*2);g.stroke();
  if(Z.next){g.strokeStyle='#ffffff';g.lineWidth=2;g.setLineDash([6,4]);g.beginPath();g.arc(c+Z.nx*K,c+Z.nz*K,Math.max(2,Z.nr*K),0,Math.PI*2);g.stroke();g.setLineDash([])}}
 for(const p of players.values()){if(p===focus||p.wreck>0)continue;mmTri(g,MMS/2+p.x*K,MMS/2+p.z*K,p.angle,8,'#2f9bff','#fff')}
 if(focus){const x=MMS/2+focus.x*K,y=MMS/2+focus.z*K;g.strokeStyle=focus.color;g.lineWidth=2;g.globalAlpha=.55+Math.sin(t/220)*.3;g.beginPath();g.arc(x,y,13,0,7);g.stroke();g.globalAlpha=1;mmTri(g,x,y,focus.angle,10,focus.color,'#fff')}}
$('#start-game-btn').addEventListener('click',()=>{if(started)return;started=true;initAudio();if(!players.size)spawnPlayer('host','HOST',colors[0],0);$('#lobby').hidden=true;$('#race-hud').hidden=false;$('#bottom-hint').style.display='none';$('#race-message').textContent='SURVIVE — MOST POINTS WINS';startedAt=performance.now();setTimeout(()=>$('#race-message').textContent='',2400)});
$('#pause-btn').onclick=()=>{paused=!paused;$('#pause-btn').textContent=paused?'▶':'Ⅱ';$('#race-message').textContent=paused?'PAUSED':''};
$('#sound-btn').onclick=()=>{soundOn=!soundOn;$('#sound-btn').style.color=soundOn?'':'#ff647c';initAudio()};
addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;if(k==='n'&&!e.repeat)toggleTOD();if((k==='c'||k==='v')&&!e.repeat)toggleView();if(k==='b'&&!e.repeat){const hp=players.get('host')||players.values().next().value;if(hp)equipCar(hp,CAR_IDS[(CAR_IDS.indexOf(hp.model)+1)%CAR_IDS.length])}if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault()});
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
 if(paused||match.over)return;pairDone.clear();matchStep(dt);stepObstacles(dt);stepWeapons(dt);stepArms(dt);
 const first=players.values().next().value;
 for(const p of players.values()){
  const dead=p.wreck>0,inp=(dead||p.stun>0||(p.lastIn&&performance.now()-p.lastIn>800))?{}:(p.input||{}),host=p===first&&!dead&&!(p.stun>0);
  if(p.inv>0)p.inv-=dt;
  if(p.stun>0){p.stun-=dt;if(Math.random()<.5)emit(p.x,1.4,p.z,(Math.random()-.5)*5,2+Math.random()*3,(Math.random()-.5)*5,.3,.9,1,.5)}
  if(dead){p.wreck-=dt;const c=Math.random()<.5?[1,.45,.1]:[.7,.7,.75];emit(p.x,1.1,p.z,(Math.random()-.5)*2,2+Math.random()*2,(Math.random()-.5)*2,c[0],c[1],c[2],1);if(p.wreck<=0){respawn(p);continue}}
  const throttle=Math.max(Number(inp.throttle)||0,(inp.accel||(host&&(keys.w||keys.arrowup)))?1:0);
  const brake=Math.max(Number(inp.brake)||0,(host&&(keys.s||keys.arrowdown))?1:0);
  let steer=clamp(Number(inp.steer)||((inp.left||(host&&(keys.a||keys.arrowleft)))?-1:(inp.right||(host&&(keys.d||keys.arrowright)))?1:0),-1,1);
  const wantBoost=((Number(inp.boost)||0)>0||(host&&keys.shift))&&p.boost>1;
  if(p.slip>0){p.slip-=dt;steer=clamp(steer+Math.sin(performance.now()/85+p.x*.3)*.95,-1,1);if(Math.random()<.4)emit(p.x,.2,p.z,(Math.random()-.5)*2,.5,(Math.random()-.5)*2,.1,.1,.1,.6)}
  p.boosting=wantBoost;p.steer=steer;p.boost=clamp(p.boost+(wantBoost?-32:10)*dt,0,100);
  const fire=!!(Number(inp.fire)||(host&&keys[' ']));{const wd=p.item&&ARMS[p.item];p.cd=Math.max(0,(p.cd||0)-dt);if(wd&&!dead){if(wd.auto){if(fire&&p.cd<=0){p.cd=wd.auto;useItem(p)}}else if(fire&&!p.firePrev)useItem(p)}}p.firePrev=fire;
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
 +'<div class="tm" style="position:absolute;left:0;right:0;top:10px;text-align:center;font:900 22px Inter,sans-serif;letter-spacing:2px;text-shadow:0 2px 10px #000"></div>'
 +'<div class="zs" style="position:absolute;left:0;right:0;top:38px;text-align:center;font:900 11px Inter,sans-serif;letter-spacing:2px;text-shadow:0 2px 8px #000"></div>'
 +'<div class="zv" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,#ff204000 28%,#ff2040b0 100%)"></div>'
 +'<div class="za" style="position:absolute;left:50%;top:58%;transform:translateX(-50%);text-align:center;opacity:0;font:900 12px Inter,sans-serif;letter-spacing:2px;color:#ff9aa8;text-shadow:0 2px 8px #000"><div class="zar" style="font-size:38px;line-height:1">▲</div><div class="zd"></div></div>'
 +'<div class="m" style="position:absolute;left:0;right:0;top:34%;text-align:center;font:900 16px Inter,sans-serif;letter-spacing:3px;text-shadow:0 2px 10px #000"></div>'
 +'<div style="position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column;gap:5px;align-items:flex-start;text-shadow:0 2px 8px #000a">'
 +'<div class="n" style="border:1px solid;border-radius:20px;padding:5px 11px;font:900 10px Inter,sans-serif;letter-spacing:1px;background:#101923b8"></div>'
 +'<div class="h" style="color:#ff3b5c;font-size:16px;letter-spacing:1px"></div>'
 +'<div class="it" style="font:900 11px Inter,sans-serif;letter-spacing:1.5px;color:#ffe08a;min-height:14px"></div>'
 +'<div><b class="s" style="font-size:30px">0</b> <span style="font-size:10px;color:#cfe">KM/H</span></div></div>'
 +'<div style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:34%;max-width:230px;text-align:center;font:900 9px Inter,sans-serif;letter-spacing:2px;color:#ffcf68">NITRO'
 +'<div style="margin-top:4px;height:8px;border-radius:6px;background:#101923b8;border:1px solid #ffffff30;overflow:hidden"><div class="b" style="height:100%;width:100%;background:linear-gradient(90deg,#ffcf68,#ff7a3d)"></div></div></div>'
 +'<canvas class="mp" width="240" height="240" style="position:absolute;right:12px;bottom:12px;border-radius:14px;border:1px solid #ffffff30;box-shadow:0 8px 24px #0008"></canvas>';
 document.body.appendChild(el);const q=s=>el.querySelector(s);
 p.hud={el,flash:q('.f'),msg:q('.m'),name:q('.n'),hearts:q('.h'),it:q('.it'),sl:q('.sl'),speed:q('.s'),nit:q('.b'),map:q('.mp'),tm:q('.tm'),zs:q('.zs'),zv:q('.zv'),za:q('.za'),zar:q('.zar'),zd:q('.zd'),msgUntil:0,key:'',_l:-1};
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
/* live first-person video: a real WebRTC video stream (hardware encoded, congestion controlled) instead of JPEG frames */
function stopFeed(p){if(p._call){try{p._call.close()}catch(e){}p._call=null}if(p._fs){try{p._fs.getTracks().forEach(t=>t.stop())}catch(e){}p._fs=null}}
function startFeed(p){
 if(p._call)return;
 if(!p._fc){p._fc=document.createElement('canvas');p._fc.width=480;p._fc.height=270;p._fx=p._fc.getContext('2d',{alpha:false})}
 try{
  const st=p._fs=p._fc.captureStream(30);
  const vt=st.getVideoTracks()[0];if(vt&&'contentHint' in vt)vt.contentHint='motion';
  const call=p._call=peer.call(p.conn.peer,st);if(!call)return;
  call.on('close',()=>{if(p._call===call)p._call=null});call.on('error',()=>{if(p._call===call)p._call=null});
  /* low latency: cap bitrate, prefer fps over resolution */
  const tune=()=>{try{const pc=call.peerConnection;pc.getSenders().forEach(sn=>{if(!sn.track||sn.track.kind!=='video')return;const pa=sn.getParameters();if(!pa.encodings||!pa.encodings.length)pa.encodings=[{}];pa.encodings[0].maxBitrate=1500000;pa.encodings[0].maxFramerate=30;pa.degradationPreference='maintain-framerate';sn.setParameters(pa).catch(()=>{})})}catch(e){}};
  setTimeout(tune,500);setTimeout(tune,2000);
 }catch(e){console.warn('feed failed',e)}
}
function camStream(p,r,now){
 const c=p.conn;if(!c||!c.open)return;
 const want=p.view===1&&!p.camOff;
 if(p._cs!==want){p._cs=want;c.send({type:'cam',on:want});if(want)startFeed(p);else stopFeed(p)}
 if(!want||!p._fx||now-(p._ft||0)<30)return;
 p._ft=now;
 const pr=renderer.getPixelRatio(),sw=r.w*pr,sh=r.h*pr;let cw=sw,ch=sh;
 if(sw/sh>16/9)cw=sh*16/9;else ch=sw*9/16;
 try{p._fx.drawImage(renderer.domElement,r.x*pr+(sw-cw)/2,r.y*pr+(sh-ch)/2,cw,ch,0,0,480,270)}catch(e){}
}
function render(now){
 const dt=Math.min((now-lastFrame)/1000,.04);lastFrame=now;update(dt);stepParticles(dt);clouds.rotation.y=now*4e-6;padTex.offset.y=-(now*.0012)%1;beaconMat.opacity=Math.floor(now/700)%2?1:.25;
 if(now-(render.tl||0)>120){render.tl=now;for(const p of players.values())if(p.conn&&p.conn.open)p.conn.send({type:'tel',speed:Math.round(Math.abs(p.speed)*3.6),boost:Math.round(p.boost),lives:p.lives,item:p.item||'',ic:p.item&&ARMS[p.item]?ARMS[p.item].ic:'',am:p.ammo|0,zo:p.zout?1:0})}
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
   {const lab=p.name+' • '+p.score+' PTS';if(h.name.textContent!==lab)h.name.textContent=lab;const rem=Math.max(0,MATCH_TIME-match.t),tt=Math.floor(rem/60)+':'+String(Math.floor(rem%60)).padStart(2,'0');if(h.tm.textContent!==tt)h.tm.textContent=tt;h.tm.style.color=rem<=ZONE_START?'#ff647c':'#fff'}
   h.speed.textContent=Math.round(Math.abs(p.speed)*3.6);h.nit.style.width=p.boost+'%';
   {const zl=zoneInfo(),zon=zoneActive()&&!match.over;h.zs.textContent=zon?zl.txt:'';h.zs.style.color=zl.col;
    const out=zon&&p.wreck<=0&&Math.hypot(p.x-Z.cx,p.z-Z.cz)>Z.r,nout=zon&&p.wreck<=0&&Z.next&&Math.hypot(p.x-Z.nx,p.z-Z.nz)>Z.nr;
    h.zv.style.opacity=out?(.55+Math.sin(now/110)*.35):0;
    if(out||nout){const tx=Z.next?Z.nx:Z.cx,tz=Z.next?Z.nz:Z.cz,an=wrapA(Math.atan2(tx-p.x,-(tz-p.z))-p.angle),ed=Math.max(0,Math.round(Math.hypot(p.x-tx,p.z-tz)-(Z.next?Z.nr:Z.r)));
     h.za.style.opacity=1;h.zar.style.transform='rotate('+an+'rad)';h.zd.textContent=(out?'OUTSIDE • ':'')+ed+' m TO SAFE ZONE'}else h.za.style.opacity=0}
   h.it.textContent=(p.shield>0?'🛡️ SHIELD '+Math.ceil(p.shield)+'s  ':'')+(p.item&&ARMS[p.item]?ARMS[p.item].ic+' '+ARMS[p.item].n+(ARMS[p.item].ammo>1?' • AMMO '+p.ammo:'')+' — SPACE / FIRE':'');h.sl.style.opacity=clamp((Math.abs(p.speed)-34)/30,0,.9)*(p.boosting?1:.7);
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
   for(const q of list){const ar=q.arrow;if(!ar)continue;const dd=Math.hypot(q.x-p.x,q.z-p.z);ar.visible=q!==p&&!(q.wreck>0);ar.scale.setScalar(clamp(dd/20,1,3.2));ar.position.y=4.4+Math.sin(now/260+q.x)*.3}
   cam.add(cockpit);cockpit.visible=p.view===1;wheelSpin.rotation.z=-((p.delta||0)/.58)*2.4;
   renderer.render(scene,cam);camStream(p,r,now)});
 }else{
  renderer.setScissorTest(false);renderer.setViewport(0,0,W,H);
  camera.aspect=W/H;camera.updateProjectionMatrix();
  {const oa=now*.00008;camera.position.lerp(new THREE.Vector3(Math.sin(oa)*150,85,Math.cos(oa)*150),.03)}camera.lookAt(0,10,0);
  sky.position.copy(camera.position);cockpit.visible=false;renderer.render(scene,camera)}
 if(started){const sec=Math.max(0,MATCH_TIME-match.t);$('#timer').style.color=sec<=ZONE_START?'#ff647c':'';$('#timer').textContent=Math.floor(sec/60).toString().padStart(2,'0')+':'+Math.floor(sec%60).toString().padStart(2,'0');refreshList()}
 requestAnimationFrame(render);
}
function resize(){curPR=0}
addEventListener('resize',resize);
applyTOD();requestAnimationFrame(render);
})();
