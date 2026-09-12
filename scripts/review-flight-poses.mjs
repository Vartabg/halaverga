import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const root = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const files = { 'three.module.js': 'build/three.module.js', 'three.core.js': 'build/three.core.js', 'GLTFLoader.js': 'examples/jsm/loaders/GLTFLoader.js', 'BufferGeometryUtils.js': 'examples/jsm/utils/BufferGeometryUtils.js', 'SkeletonUtils.js': 'examples/jsm/utils/SkeletonUtils.js' };
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#12262c;color:#d7e9e3;font-family:Arial}header{height:70px;padding:26px 30px 0;box-sizing:border-box;letter-spacing:3px}main{display:grid;grid-template-columns:repeat(3,1fr)}section{height:460px;position:relative}canvas{display:block}span{position:absolute;bottom:14px;left:30px;font-size:12px;letter-spacing:2px}</style><script type="importmap">{"imports":{"three":"/pose-study/three.module.js","three/addons/":"/pose-study/"}}</script></head><body><header>HALAVERGA / HERO MOTION · ACTUAL PLAYABLE RIG</header><main></main><script type="module">
import * as T from 'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{buildSuitRig}from'/pose-study/world/suitRig';import{applySuitPose}from'/pose-study/world/suitPose';
const asset=await new GLTFLoader().loadAsync('/models/suit.glb');
const cases=[['FRONT / HUMAN ANATOMY',0,0,0,0,0,[1,1,-5]],['PROFILE',0,0,0,0,0,[5,.5,0]],['BACK',0,0,0,0,0,[0,.6,5]],['CHASE / HOVER',0,0,0,0,0,[.85,1.4,5.3]],['CHASE / POWER FLIGHT',34,-1.35,0,0,0,[.85,1.4,5.3]],['CHASE / BANK',24,-1.15,-.3,0,0,[.85,1.4,5.3]]];
for(const [name,speed,lean,bank,climb,brake,view]of cases){
 const element=document.createElement('section');element.innerHTML='<span>'+name+'</span>';document.querySelector('main').append(element);
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(440,460);renderer.setPixelRatio(1.5);renderer.setClearColor('#12262c');renderer.toneMapping=T.ACESFilmicToneMapping;element.prepend(renderer.domElement);
 const scene=new T.Scene(),rig=buildSuitRig(asset.scene);scene.add(rig.root);applySuitPose(rig.joints,{viewYaw:0,viewPitch:0,yaw:0,lean,bank,speed,flight:1,brake},{hero:1,climb,epoch:0},false);rig.root.rotation.set(lean+climb*.65,0,bank*1.7,'YXZ');
 scene.add(new T.HemisphereLight('#c0d7eb','#475b5e',2.2));for(const [color,intensity,pos]of[['#fff0d0',3,[-3,5,-3]],['#92d5dd',2,[4,2,3]]]){const light=new T.DirectionalLight(color,intensity);light.position.set(...pos);scene.add(light)}
 const camera=new T.PerspectiveCamera(35,440/460,.1,20);camera.position.set(...view);camera.lookAt(0,0,-.1);renderer.render(scene,camera);
}window.rendered=true;
</script></body></html>`;
try {
 const page=await browser.newPage({viewport:{width:1320,height:990}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/pose-study/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/pose-study/index.html')return route.fulfill({contentType:'text/html',body:html});
  const name=path.split('/').at(-1), file=files[name];
  if(file)return route.fulfill({contentType:'text/javascript',body:await readFile(root+'/node_modules/three/'+file)});
  const relative=path.replace('/pose-study/','');
  if(!['world/suitRig','world/skinnedSuit','world/suitGeometry','world/suitPose','game/presentation'].includes(relative))return route.abort();
  const source=await readFile(root+'/src/'+relative+'.ts','utf8');
  return route.fulfill({contentType:'text/javascript',body:ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText});
 });
 await page.goto('http://127.0.0.1:3366/pose-study/index.html');await page.waitForFunction(()=>window.rendered);
 if(errors.length)throw new Error(errors.join('\n'));
 await page.screenshot({path:process.env.SUIT_REVIEW_OUTPUT||'/tmp/halaverga-flight-poses.png'});
} finally { await browser.close(); }
