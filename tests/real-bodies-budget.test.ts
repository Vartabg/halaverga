import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// docs/plans/2026-11-16-real-fight.md B8: both bodies together within the two models they replaced (angel.glb 1,990,440 B +
// abyssal.glb 2,024,328 B at 86482c2), at most 6 materials per body, every texture 1k or smaller.
const RETIRED_BYTES = 1_990_440 + 2_024_328;
const glb = (name: string) => readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
function parse(b: Buffer) {
  const jsonLength = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = b.subarray(20 + jsonLength + 8);
  return { json, view: (i: number) => { const v = json.bufferViews[i]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); } };
}
/** Width and height of a PNG (IHDR) or a JPEG (its first start-of-frame marker). */
function size(data: Buffer, mime: string) {
  if (mime === 'image/png') return [data.readUInt32BE(16), data.readUInt32BE(20)];
  for (let k = 2; k < data.length - 9;) {
    if (data[k] !== 0xff) { k++; continue; }
    const marker = data[k + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return [data.readUInt16BE(k + 7), data.readUInt16BE(k + 5)];
    k += 2 + data.readUInt16BE(k + 2);
  }
  throw new Error('no JPEG frame header');
}

describe('the realistic bodies\' budget', () => {
  it('keeps archangel.glb and watcher.glb together within the bytes of the two models they replaced', () => {
    const total = glb('archangel').length + glb('watcher').length;
    expect(total).toBeLessThanOrEqual(RETIRED_BYTES); // 2,797,708 B on 2026-11-17
    const record = JSON.parse(readFileSync('art/real-bodies/asset.json', 'utf8'));
    expect(record.archangel.bytes).toBe(glb('archangel').length); expect(record.watcher.bytes).toBe(glb('watcher').length);
  });
  it.each(['archangel', 'watcher'])('gives %s at most 6 materials and no texture over 1024 px', name => {
    const { json, view } = parse(glb(name));
    expect(json.materials.length).toBeLessThanOrEqual(6);
    expect(json.images.length).toBeGreaterThan(0);
    for (const image of json.images) {
      const [w, h] = size(view(image.bufferView), image.mimeType);
      expect(w, image.name).toBeGreaterThan(0); expect(Math.max(w, h), image.name).toBeLessThanOrEqual(1024);
    }
  });
});
