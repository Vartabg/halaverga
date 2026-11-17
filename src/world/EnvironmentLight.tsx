import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType, PMREMGenerator, RGBAFormat } from 'three';
import { SUN_DIRECTION, directionFromUv, skyBase } from './atmospherePalette';

/** Bake the visible sky and limestone bounce into the small reflection map once per renderer. */
export default function EnvironmentLight() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const width = 256, height = 128, data = new Uint16Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const dir = directionFromUv((x + .5) / width, (y + .5) / height);
      const c = skyBase(dir), ground = Math.min(1, Math.max(0, -dir[1] * 4));
      const dot = dir[0] * SUN_DIRECTION[0] + dir[1] * SUN_DIRECTION[1] + dir[2] * SUN_DIRECTION[2];
      const glow = 1.8 * Math.exp(-Math.max(0, 1 - dot) * 420), i = (y * width + x) * 4;
      data[i] = DataUtils.toHalfFloat(c[0] * (1 - ground) + .24 * ground + glow);
      data[i + 1] = DataUtils.toHalfFloat(c[1] * (1 - ground) + .21 * ground + glow * .82);
      data[i + 2] = DataUtils.toHalfFloat(c[2] * (1 - ground) + .17 * ground + glow * .58);
      data[i + 3] = DataUtils.toHalfFloat(1);
    }
    const source = new DataTexture(data, width, height, RGBAFormat, HalfFloatType);
    source.mapping = EquirectangularReflectionMapping; source.needsUpdate = true;
    const generator = new PMREMGenerator(gl), target = generator.fromEquirectangular(source);
    const before = { map: scene.environment, intensity: scene.environmentIntensity };
    scene.environment = target.texture; scene.environmentIntensity = .35;
    source.dispose(); generator.dispose(); invalidate();
    return () => { scene.environment = before.map; scene.environmentIntensity = before.intensity; target.dispose(); };
  }, [gl, scene, invalidate]);
  return null;
}
