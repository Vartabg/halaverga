import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { SUN_UV, directionFromUv, skyBase } from './atmospherePalette';
import { DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType, PMREMGenerator, RGBAFormat } from 'three';

/** A small shared sky reflection, generated once from the same dawn as the dome and the water (dawn light bouncing off the
 * valley waters below the horizon, a warm brightening where the sun has risen). No second scene render per frame. */
export default function EnvironmentLight() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const width = 256, height = 128, data = new Uint16Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const u = (x + .5) / width, v = (y + .5) / height;
      const glow = Math.exp(-((u - SUN_UV[0]) ** 2 + (v - SUN_UV[1]) ** 2) * 60) * .08;
      // The valley waters throw dawn light up from below: warm current streaks are strongest just under the horizon, so metal
      // and any surface that faces down register the lit water at first light. Branchless, generated once.
      const curl = Math.max(0, Math.sin((Math.sin(u * 41.3) * 7.7 + u) * 11.9)) ** 8 * Math.max(0, 1 - Math.abs(v - .46) * 14) ** 2;
      const c = v < .5
        ? [.06 + .22 * curl, .045 + .12 * curl, .03 + .05 * curl]
        : skyBase(directionFromUv(u, v));
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
