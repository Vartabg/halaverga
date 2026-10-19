import { DataTexture, DoubleSide, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, RGBAFormat, Vector2 } from 'three';

/** Original microstructure: shallow diagonal barbs meeting at the rachis. Shared by both skinned wings. */
export function featherMaterial() {
  const width = 128, height = 256, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width * 2 - 1, v = y / height, wave = Math.sin((v - Math.abs(u) * .21) * Math.PI * 140), o = (y * width + x) * 4;
    data[o] = Math.round(128 + Math.sign(u) * wave * 28); data[o + 1] = Math.round(128 - wave * 15); data[o + 2] = 251; data[o + 3] = 255;
  }
  const texture = new DataTexture(data, width, height, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping; texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter; texture.needsUpdate = true;
  const material = new MeshStandardMaterial({ color: '#ddd7c9', vertexColors: true, roughness: .71, metalness: 0,
    normalMap: texture, normalScale: new Vector2(.22, .22), side: DoubleSide });
  return { material, dispose() { material.dispose(); texture.dispose(); } };
}
