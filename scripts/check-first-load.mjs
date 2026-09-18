// The landing page's first load must not reach three.js or the flight clips: they live in the lazy scene chunk.
// Run after `next build`: reads the prerendered landing HTML, sums the scripts it loads and fails on any scene marker.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const MARKERS = ['WebGLRenderer', 'isVector3', '@react-three', 'BufferGeometry', 'powerHero', 'bankLeft'];
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
  for (const marker of MARKERS) if (body.includes(marker)) found.push(`${marker} in ${src}`);
}
console.log(`Landing first load: ${sources.size} scripts, ${(bytes / 1024).toFixed(1)} KB.`);
if (found.length) { console.error('Scene code reached the landing first load:\n  ' + found.join('\n  ')); process.exit(1); }
