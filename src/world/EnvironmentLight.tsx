import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType, PMREMGenerator, RGBAFormat } from 'three';

/** A small shared sky reflection, generated once. No second scene render per frame. */
export default function EnvironmentLight() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const width = 256, height = 128, data = new Uint16Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const h = y / height, upper = Math.max(0, (h - .5) * 2);
      const glow = Math.exp(-((x / width - .859) ** 2 + (h - .745) ** 2) * 500);
      const c = h < .5 ? [.14, .18, .12] : [.64 - upper * .43, .72 - upper * .28, .75 - upper * .1];
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
