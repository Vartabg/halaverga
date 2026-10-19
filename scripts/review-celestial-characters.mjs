// Actual game assets and runtime wing builder, rendered in Chrome; no concept images or offline beauty renderer.
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('..',import.meta.url));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=metal']});
const modules={'three.module.js':'build/three.module.js','three.core.js':'build/three.core.js','SkeletonUtils.js':'examples/jsm/utils/SkeletonUtils.js','GLTFLoader.js':'examples/jsm/loaders/GLTFLoader.js','BufferGeometryUtils.js':'examples/jsm/utils/BufferGeometryUtils.js'};
const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#111820;color:#d6c8a8;font:12px Arial}header{height:72px;box-sizing:border-box;padding:26px 28px;letter-spacing:3px}main{display:grid;grid-template-columns:repeat(3,480px)}section{position:relative;height:560px}span{position:absolute;bottom:20px;left:24px;letter-spacing:2px}</style><script type="importmap">{"imports":{"three":"/study/three.module.js","three/addons/":"/study/"}}</script></head><body><header>HALAVERGA / CHARACTER STUDY · ACTUAL RUNTIME ASSETS</header><main></main><script type="module">
import * as T from 'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{buildSuitRig}from'/study/world/suitRig';import{createArchangelWings,stepArchangelWings}from'/study/world/archangelWings';import{angelRegalia}from'/study/world/angelRegalia';
const loader=new GLTFLoader(),hero=await loader.loadAsync('/models/angel.glb'),demon=await loader.loadAsync('/models/abyssal.glb');
for(const [title,kind,position,target]of[
 ['WARRIOR / FRONT','hero',[1.0,.55,-8.2],[0,.02,0]],['WARRIOR / BACK','hero',[-.9,.5,8.2],[0,.02,0]],['FACE & FITTED REGALIA','face',[.42,.74,-1.80],[0,.60,0]],
 ['ABYSSAL HOST / FRONT','demon',[.8,.6,-7.4],[0,.10,0]],['MEMBRANE & ANATOMY','demon',[-3.5,.9,1.5],[0,.1,0]],['CROWN & FACIAL PLANES','demonFace',[.36,.78,-1.7],[0,.72,0]]]){
 const el=document.createElement('section');el.innerHTML='<span>'+title+'</span>';document.querySelector('main').append(el);
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(1.5);renderer.setSize(480,560);renderer.setClearColor('#111820');renderer.toneMapping=T.ACESFilmicToneMapping;el.prepend(renderer.domElement);
 const scene=new T.Scene();scene.add(new T.HemisphereLight('#d2ddf5','#61564b',2));
 for(const[c,i,p]of[['#ffe3b4',3,[-3,4,-3]],['#bbcfff',4,[3,2,3]]]){const l=new T.DirectionalLight(c,i);l.position.set(...p);scene.add(l)}
 if(kind==='hero'||kind==='face'){
  const rig=buildSuitRig(hero.scene),w=createArchangelWings();rig.joints[11].add(w.root);angelRegalia(rig.root,rig.joints);
  w.unfold=1;stepArchangelWings(w,true,true,true,0,0,0,0);scene.add(rig.root);
 }else{const o=demon.scene.clone(true);o.traverse(m=>{if(m.isMesh){m.material=m.material.clone();m.material.side=T.DoubleSide;if(m.material.name==='Ember eyes'){m.material.emissive.set('#ff4b08');m.material.emissiveIntensity=2}}});scene.add(o)}
 const camera=new T.PerspectiveCamera(kind.includes('ace')?32:38,480/560,.05,30);camera.position.set(...position);camera.lookAt(...target);renderer.render(scene,camera);
}
window.rendered=true;
</script></body></html>`;
try{
 const page=await browser.newPage({viewport:{width:1440,height:1192}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('console',m=>{if(m.type()==='error')console.error(m.text())});
 await page.route('http://characters.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/')return route.fulfill({contentType:'text/html',body:html});
  if(path.startsWith('/models/'))return route.fulfill({contentType:'model/gltf-binary',body:await readFile(root+'/public'+path)});
  const name=path.split('/').at(-1);if(modules[name])return route.fulfill({contentType:'text/javascript',body:await readFile(root+'/node_modules/three/'+modules[name])});
  if(path.startsWith('/study/world/')){const relative=path.replace('/study/','');const source=await readFile(root+'/src/'+relative+'.ts','utf8');return route.fulfill({contentType:'text/javascript',body:ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText})}
  console.error('Unmapped resource',path);return route.abort();
 });
 await page.goto('http://characters.test/');await page.waitForFunction(()=>window.rendered);
 if(errors.length)throw new Error(errors.join('\n'));
 await mkdir(root+'/docs/art/war-in-heaven',{recursive:true});await page.screenshot({path:root+'/docs/art/war-in-heaven/characters.png'});
 console.log('Character study saved.');
}finally{await browser.close()}
