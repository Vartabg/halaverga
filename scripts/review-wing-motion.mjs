// Actual runtime wing systems, same assets, six flight states. Renders a still and a six-second motion study in Chrome.
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('..',import.meta.url)), output=root+'/docs/art/war-in-heaven';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=metal']});
const modules={'three.module.js':'build/three.module.js','three.core.js':'build/three.core.js','SkeletonUtils.js':'examples/jsm/utils/SkeletonUtils.js','GLTFLoader.js':'examples/jsm/loaders/GLTFLoader.js','BufferGeometryUtils.js':'examples/jsm/utils/BufferGeometryUtils.js'};
const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#111923;color:#dbcda9;font:12px Arial}header{height:72px;padding:25px 28px;box-sizing:border-box;letter-spacing:2.5px}main{display:grid;grid-template-columns:repeat(3,480px)}section{height:520px;position:relative}span{position:absolute;bottom:18px;left:20px;letter-spacing:1.5px;background:#111923d9;padding:8px}</style><script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/"}}</script></head><body><header>HALAVERGA / WING MECHANICS · ACTUAL RUNTIME SYSTEMS</header><main></main><script type="module">
import * as T from 'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
import{buildSuitRig}from'/source/world/suitRig';import{applySuitPose,orientSuit}from'/source/world/suitPose';
import{createArchangelWings,stepArchangelWings,alignArchangelWings}from'/source/world/archangelWings';import{angelRegalia}from'/source/world/angelRegalia';
import{advanceFlightMix,createFlightMix}from'/source/world/flightMix';import{applyFlightClips}from'/source/world/flightPose';import{createSuitAnimation}from'/source/world/suitAnimation';
import{buildDroneGeometry,createDroneMaterials}from'/source/world/droneMesh';
const loader=new GLTFLoader(),hero=await loader.loadAsync('/models/angel.glb'),demon=await loader.loadAsync('/models/abyssal.glb');
const views=[];
for(const [title,patch,cameraAt]of[
 ['GROUNDED / FOLDED JOINTS',{flying:false},[2.9,1.3,4.3]],
 ['HOVER / POWER & RECOVERY',{speed:0},[1.2,3.2,6.3]],
 ['CLIMB / INCREASED EFFORT',{speed:12,vy:7,lean:-.65,pitch:.4},[2.5,3.1,6.4]],
 ['CRUISE / STEADY GLIDE',{speed:26,lean:-1.35},[1.2,2.9,6.3]],
 ['BRAKING / FLARE & FAN',{speed:12,brake:1,lean:-.35},[1.6,2.8,6.3]],
 ['MEMBRANE / ANCHORED SKIN',{demon:true},[2.2,2.2,5.9]]]){
 const el=document.createElement('section');el.innerHTML='<span>'+title+'</span>';document.querySelector('main').append(el);
 const r=new T.WebGLRenderer({antialias:true});r.setPixelRatio(1.5);r.setSize(480,520);r.setClearColor('#111923');r.toneMapping=T.ACESFilmicToneMapping;el.prepend(r.domElement);
 const scene=new T.Scene();scene.add(new T.HemisphereLight('#d6e4f6','#514b44',1.2));
 for(const[c,i,p]of[['#ffe9c1',2.4,[-3,5,2]],['#a8c7ed',1.4,[3,2,-3]]]){const l=new T.DirectionalLight(c,i);l.position.set(...p);scene.add(l)}
 const camera=new T.PerspectiveCamera(43,480/520,.05,30);camera.position.set(...cameraAt);camera.lookAt(0,.10,.12);
 const pose={viewYaw:0,viewPitch:0,yaw:0,pitch:0,bank:0,speed:0,flight:1,power:0,brake:0,lean:0,...patch};
 let tick;
 if(patch.demon){
  const geo=buildDroneGeometry(demon.scene),mat=createDroneMaterials();mat.eye.color.set('#ff671c');
  for(const name of ['body','plate','wingL','wingR','eye']){
   const g=geo[name];if(name!=='eye')for(const a of ['aFlash','aDamage','aPhase'])g.setAttribute(a,new T.InstancedBufferAttribute(new Float32Array([0]),1));
   const m=new T.InstancedMesh(g,name==='plate'?mat.plate:name==='eye'?mat.eye:mat.body,1);m.setMatrixAt(0,new T.Matrix4());if(name==='eye')m.position.set(0,.737,-.24);m.frustumCulled=false;scene.add(m);
  }
  tick=(t,dt)=>{mat.clock.value=t;mat.wings.step(0,t,2,false)};
 }else{
  const rig=buildSuitRig(hero.scene),w=createArchangelWings(),mix=createFlightMix(),life=createSuitAnimation();Object.assign(life,{epoch:0,flying:patch.flying!==false,ground:patch.flying===false?1:0,takeoff:Infinity});rig.joints[11].add(w.root);const cloth=angelRegalia(rig.root,rig.joints);scene.add(rig.root);
  if(patch.flying!==false)Object.assign(w.motion,{unfold:1,flying:true,launch:0,glide:patch.speed>18?1:0});
  else{pose.flight=0;pose.power=0}
  tick=(t,dt)=>{pose.power=Math.min(1,pose.speed/26);orientSuit(rig.root,pose,{hero:1,epoch:0});applySuitPose(rig.joints,pose,{hero:1,epoch:0},false);life.time=t;advanceFlightMix(mix,{...pose,epoch:0},{flying:patch.flying!==false,paused:false,reduced:false,velocity:{x:0,y:patch.vy||0,z:-pose.speed}},dt);applyFlightClips(rig.joints,mix,pose,life,1,false);rig.root.updateMatrixWorld(true);
   stepArchangelWings(w,patch.flying!==false,false,false,pose.speed,patch.vy||0,0,dt,pose.brake);alignArchangelWings(w,rig.root,pose.lean);cloth.step(dt,patch.flying===false)};
 }
 views.push({r,scene,camera,tick});
}
let t=0,last=0;
function frame(now){if(now-last<32){requestAnimationFrame(frame);return}last=now;t+=1/30;for(const v of views){v.tick(t,1/30);v.r.render(v.scene,v.camera)}window.framesDrawn=(window.framesDrawn||0)+1;requestAnimationFrame(frame)}requestAnimationFrame(frame);
</script></body></html>`;
try{
 await mkdir(output,{recursive:true});const context=await browser.newContext({viewport:{width:1440,height:1112},recordVideo:{dir:'/tmp/halaverga-wing-video',size:{width:1440,height:1112}}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text())}});
 await page.route('http://wing-study.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/')return route.fulfill({contentType:'text/html',body:html});
  if(path.startsWith('/models/'))return route.fulfill({contentType:'model/gltf-binary',body:await readFile(root+'/public'+path)});
  const name=path.split('/').at(-1);if(modules[name])return route.fulfill({contentType:'text/javascript',body:await readFile(root+'/node_modules/three/'+modules[name])});
  if(/^\/source\/(world|game)\/[a-zA-Z0-9_/-]+$/.test(path)){const source=await readFile(root+'/src/'+path.slice(8)+'.ts','utf8');return route.fulfill({contentType:'text/javascript',body:ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText.replaceAll("'@/","'/source/")})}
  console.error('Unmapped',path);return route.abort();
 });
 await page.goto('http://wing-study.test/');await page.waitForFunction(()=>window.framesDrawn>65);await page.screenshot({path:output+'/wing-states.png'});
 await page.waitForTimeout(6000);if(errors.length)throw new Error(errors.join('\n'));
 const video=page.video();await context.close();execFileSync('ffmpeg',['-y','-i',await video.path(),'-vf','fps=24','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',output+'/wing-motion.mp4'],{stdio:'ignore'});console.log('Wing motion evidence saved.');
}finally{await browser.close()}
