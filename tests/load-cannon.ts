import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const CANNON_FILE = new URL('../public/models/arm-cannon.glb', import.meta.url);
export const cannonBytes = () => readFileSync(CANNON_FILE);

/** The GLB's JSON chunk, as written by scripts/arm_cannon/build.py. */
export function cannonJson(): any {
  const b = cannonBytes(), n = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + n).toString('utf8'));
}

/** Decodes one embedded 8-bit RGB palette PNG (filter 0 rows, as the build writes them) into rows of [r, g, b]. */
export function cannonImage(name: string): number[][][] {
  const b = cannonBytes(), n = b.readUInt32LE(12), json = cannonJson(), bin = b.subarray(20 + n + 8);
  const image = json.images.find((i: any) => i.name === name), view = json.bufferViews[image.bufferView];
  const png = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), idat: Buffer[] = [];
  for (let o = 8; o < png.length;) {
    const len = png.readUInt32BE(o), kind = png.subarray(o + 4, o + 8).toString('ascii');
    if (kind === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len));
    o += len + 12;
  }
  const raw = inflateSync(Buffer.concat(idat)), rows: number[][][] = [];
  for (let y = 0; y < h; y++) {
    const at = y * (w * 3 + 1);
    if (raw[at] !== 0) throw new Error('unexpected PNG filter');
    rows.push(Array.from({ length: w }, (_, x) => [raw[at + 1 + x * 3], raw[at + 2 + x * 3], raw[at + 3 + x * 3]]));
  }
  return rows;
}

/** Node tests inspect geometry and material bindings; images are stubbed like tests/load-suit.ts. */
export async function loadCannon() {
  const b = cannonBytes();
  const loader = new GLTFLoader();
  loader.register(parser => ({
    name: 'NodeImageMetadata',
    loadTexture: async (index: number) => {
      const texture = new Texture();
      texture.name = parser.json.textures[index].name ?? parser.json.images[parser.json.textures[index].source].name;
      return texture;
    },
  }));
  return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
}
