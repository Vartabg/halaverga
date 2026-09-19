import { createRequire } from 'node:module';
import { mkdir, readdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const out = new URL('../../public/textures/environment/', import.meta.url);
await mkdir(out, { recursive: true });
for (const name of ['concrete_floor_02', 'concrete_moss']) {
  const folder = `/tmp/halaverga-environment-sources/${name}/textures/`;
  for (const file of await readdir(folder)) {
    if (file.includes('_arm_')) continue;
    await sharp(folder + file).resize(1024, 1024).jpeg({ quality: 82 }).toFile(new URL(file, out).pathname);
  }
}
