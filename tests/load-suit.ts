import { readFileSync } from 'node:fs';
import { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Node tests inspect geometry/material bindings; browser tests decode the PNGs. */
export async function loadSuit() {
  const b = readFileSync(new URL('../public/models/suit.glb', import.meta.url));
  const loader = new GLTFLoader();
  loader.register(parser => ({
    name: 'NodeImageMetadata',
    loadTexture: async (index: number) => {
      const texture = new Texture();
      texture.name = parser.json.textures[index].name ?? 'Embedded explorer atlas';
      return texture;
    },
  }));
  return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
}
