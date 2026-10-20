// The angel GLB through the game's own rig, wings, regalia and clip sampler, rendered in Chrome: rest views plus library clip
// frames. Usage: node scripts/review-angel-asset.mjs [glb] [out.png]   (defaults: public/models/angel.glb, docs/art/angel-asset/review.png)
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('..', import.meta.url));
const glb = resolve(process.argv[2] ?? root + 'public/models/angel.glb'), out = resolve(process.argv[3] ?? root + 'docs/art/angel-asset/review.png');
const modules = { 'three.module.js': 'build/three.module.js', 'three.core.js': 'build/three.core.js', 'GLTFLoader.js': 'examples/jsm/loaders/GLTFLoader.js',
  'SkeletonUtils.js': 'examples/jsm/utils/SkeletonUtils.js', 'BufferGeometryUtils.js': 'examples/jsm/utils/BufferGeometryUtils.js' };
// [label, view, clip, seconds]; views: front, back (chase camera), face, side.
const panels = [['REST / FRONT', 'front'], ['REST / CHASE VIEW', 'back'], ['FACE', 'face'], ['IDLE 1.2 S', 'front', 'idle', 1.2],
  ['SWORD IDLE', 'side', 'swordIdle', .4], ['SLASH .35 S', 'side', 'slash', .35], ['SLASH .55 S', 'side', 'slash', .55], ['SLASH .75 S', 'side', 'slash', .75],
  ['REBUKE .3 S', 'side', 'rebuke', .3], ['CAST .6 S', 'side', 'cast', .6], ['CAST .9 S', 'side', 'cast', .9], ['SLASH FROM CHASE .55 S', 'back', 'slash', .55]];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#111820;color:#d6c8a8;font:12px Arial}
header{height:56px;box-sizing:border-box;padding:20px 24px;letter-spacing:3px}main{display:grid;grid-template-columns:repeat(4,360px)}
section{position:relative;height:420px}span{position:absolute;bottom:14px;left:18px;letter-spacing:2px}</style>
<script type="importmap">{"imports":{"three":"/study/three.module.js","three/addons/":"/study/"}}</script></head><body>
<header>HALAVERGA / ANGEL ASSET · RUNTIME RIG, WINGS AND CLIPS</header><main></main><script type="module">
import * as T from 'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{buildSuitRig}from'/study/world/suitRig';
import{createArchangelWings,stepArchangelWings,alignArchangelWings}from'/study/world/archangelWings';import{angelRegalia}from'/study/world/angelRegalia';
import{bindAngelClips,blendAngelClip,FULL}from'/study/world/angelClips';import{SWORD_GRIP,swordGripRotation}from'/study/world/swordGrip';
const asset=await new GLTFLoader().loadAsync('/models/angel.glb'),clips=bindAngelClips(asset.animations);
const views={front:[[.9,.4,-5.6],[0,-.05,0],38],back:[[-.5,1.3,5.6],[0,0,0],38],face:[[.3,.68,-1.5],[0,.66,0],30],side:[[-4.6,.5,-2.6],[0,0,0],40]};
for(const [title,view,clip,time] of ${JSON.stringify(panels)}){
 const el=document.createElement('section');el.innerHTML='<span>'+title+'</span>';document.querySelector('main').append(el);
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(1.5);renderer.setSize(360,420);renderer.setClearColor('#111820');
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.outputColorSpace=T.SRGBColorSpace;el.prepend(renderer.domElement);
 const scene=new T.Scene();scene.add(new T.HemisphereLight('#d2ddf5','#61564b',1.6));
 for(const[c,i,p]of[['#ffe3b4',2.6,[-3,4,-3]],['#bbcfff',2.2,[3,2,3]]]){const l=new T.DirectionalLight(c,i);l.position.set(...p);scene.add(l)}
 const rig=buildSuitRig(asset.scene),w=createArchangelWings();rig.joints[11].add(w.root);angelRegalia(rig.root,rig.joints);
 const sword=new T.Mesh(new T.BoxGeometry(.045,1.05,.014).translate(0,-.62,0),new T.MeshStandardMaterial({color:'#f3dca2',metalness:.7,roughness:.25,emissive:'#ffb347',emissiveIntensity:.6}));
 sword.position.set(SWORD_GRIP.x,SWORD_GRIP.y,SWORD_GRIP.z);swordGripRotation(sword.quaternion);rig.joints[16].add(sword);
 if(clip){const hip=new T.Vector3();blendAngelClip(rig.joints,clips[clip],time,1,FULL,hip);rig.joints[0].position.add(hip)}
 w.motion.unfold=clip?0:1;stepArchangelWings(w,!clip,false,true,0,0,0,0);rig.root.updateMatrixWorld(true);alignArchangelWings(w,rig.root,0);
 scene.add(rig.root);const[p,t,fov]=views[view];const camera=new T.PerspectiveCamera(fov,360/420,.05,30);camera.position.set(...p);camera.lookAt(...t);
 renderer.render(scene,camera);
}
window.rendered=true;</script></body></html>`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1316 } }), errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  page.on('console', m => { if (m.type() === 'error') console.error(m.text()); });
  await page.route('http://angel.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/models/angel.glb') return route.fulfill({ contentType: 'model/gltf-binary', body: await readFile(glb) });
    const name = path.split('/').at(-1);
    if (modules[name]) return route.fulfill({ contentType: 'text/javascript', body: await readFile(root + 'node_modules/three/' + modules[name]) });
    if (path.startsWith('/study/world/')) {
      const source = await readFile(root + 'src/' + path.replace('/study/', '') + '.ts', 'utf8');
      return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText });
    }
    console.error('Unmapped resource', path); return route.abort();
  });
  await page.goto('http://angel.test/'); await page.waitForFunction(() => window.rendered, null, { timeout: 60000 });
  if (errors.length) throw new Error(errors.join('\n'));
  await mkdir(dirname(out), { recursive: true }); await page.screenshot({ path: out });
  console.log('Angel review saved to', out);
} finally { await browser.close(); }
