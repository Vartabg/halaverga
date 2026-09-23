// The landing page's first load must not reach three.js, the flight clips or the blaster UI/audio: they live in lazy chunks.
// Run after `next build`: reads the prerendered landing HTML, sums the scripts it loads, fails on any marker and on size creep.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const SCENE = ['WebGLRenderer', 'isVector3', '@react-three', 'BufferGeometry', 'powerHero', 'bankLeft'];
// Minification-safe blaster markers: CSS module class prefixes, data-testids, a DOM API name and settings copy, never
// component identifiers (the minifier renames those). runtime.shooter's plain state (combat.ts) is an accepted exception.
const SHOOTER = ['ShooterHud-module', 'FireControls-module', 'shooter-hud', 'fire-button', 'createDynamicsCompressor', 'drones and shooting'];
// Main measured 614.9 KB (PR #11); the blaster keeps only its input handlers and plain state on the landing page.
const BUDGET_KB = 636;
const html = await readFile(root + '.next/server/app/index.html', 'utf8').catch(() => {
  throw new Error('No landing build found: run `next build` first.');
});
// Scripts the page runs or preloads: <script src> and <link rel="preload" as="script">.
const sources = new Set([...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g), ...html.matchAll(/<link(?=[^>]*\sas="script")[^>]*\shref="([^"]+)"/g)]
  .map(match => match[1]).filter(src => src.startsWith('/_next/')));
if (!sources.size) throw new Error('The landing page loads no scripts; the check cannot see the first load.');
let bytes = 0; const found = [];
for (const src of sources) {
  const body = await readFile(root + '.next/' + src.slice('/_next/'.length).split('?')[0], 'utf8');
  bytes += Buffer.byteLength(body);
  for (const marker of [...SCENE, ...SHOOTER]) if (body.includes(marker)) found.push(`${marker} in ${src}`);
}
const kb = bytes / 1024;
console.log(`Landing first load: ${sources.size} scripts, ${kb.toFixed(1)} KB (budget ${BUDGET_KB} KB).`);
if (found.length) { console.error('Scene or blaster code reached the landing first load:\n  ' + found.join('\n  ')); process.exit(1); }
if (kb > BUDGET_KB) { console.error(`The landing first load grew past its ${BUDGET_KB} KB budget.`); process.exit(1); }
