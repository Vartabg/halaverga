import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { SUN_UV, directionFromUv, skyBase } from './atmospherePalette';
import { DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType, PMREMGenerator, RGBAFormat } from 'three';

/** A small shared sky reflection, generated once from the same sky as the dome and the water. No second scene render per frame. */
export default function EnvironmentLight() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const width = 256, height = 128, data = new Uint16Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const u = (x + .5) / width, v = (y + .5) / height;
      const glow = Math.exp(-((u - SUN_UV[0]) ** 2 + (v - SUN_UV[1]) ** 2) * 500);
      const c = v < .5 ? [.14, .18, .12] : skyBase(directionFromUv(u, v));
      const i = (y * width + x) * 4;
      data[i] = DataUtils.toHalfFloat(c[0] + glow * 6);
      data[i + 1] = DataUtils.toHalfFloat(c[1] + glow * 4);
      data[i + 2] = DataUtils.toHalfFloat(c[2] + glow * 2);
      data[i + 3] = DataUtils.toHalfFloat(1);
    }
    const source = new DataTexture(data, width, height, RGBAFormat, HalfFloatType);
    source.mapping = EquirectangularReflectionMapping; source.needsUpdate = true;
    const generator = new PMREMGenerator(gl), target = generator.fromEquirectangular(source);
    const previous = scene.environment;
    const intensity = scene.environmentIntensity;
    scene.environment = target.texture; scene.environmentIntensity = .45;
    source.dispose(); generator.dispose(); invalidate();
    return () => { scene.environment = previous; scene.environmentIntensity = intensity; target.dispose(); };
  }, [gl, scene, invalidate]);
  return null;
}
