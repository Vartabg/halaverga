import { describe, expect, it } from 'vitest';
import { ShaderLib, UniformsUtils, type MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { sanctuaryMaterials, stepStoneLight, stoneLight } from '../src/world/sanctuaryStone';

function compile(material: MeshStandardMaterial) {
  const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: UniformsUtils.clone(ShaderLib.standard.uniforms) } as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, undefined as never);
  return shader;
}

describe('sanctuary stone light', () => {
  it('injects masonry and breach light into the real standard shader chunks', () => {
    const [stone, gold, panel] = sanctuaryMaterials();
    try {
      const s = compile(stone), g = compile(gold);
      expect(s.vertexShader).toContain('vStone = position; vStoneN = normal;');
      expect(s.fragmentShader).toContain('float joint;');
      expect(s.fragmentShader).toContain('totalEmissiveRadiance += diffuseColor.rgb * gate');
      expect(g.fragmentShader).not.toContain('float joint;');
      expect(g.fragmentShader).toContain('totalEmissiveRadiance += diffuseColor.rgb * gate');
      expect(s.uniforms.uGateFire).toBe(stoneLight.uGateFire);
      expect(stone.customProgramCacheKey()).not.toBe(gold.customProgramCacheKey());
    } finally { [stone, gold, panel].forEach(m => m.dispose()); }
  });

  it('eases the breach light to gold on victory and back on regroup, bounded per frame', () => {
    stoneLight.uGateFire.value = 0;
    expect(stepStoneLight(false, 1 / 60)).toBe(false);
    expect(stepStoneLight(true, 1)).toBe(true);
    expect(stoneLight.uGateFire.value).toBeCloseTo(.024, 5);
    for (let i = 0; i < 200; i++) stepStoneLight(true, 1 / 30);
    expect(stoneLight.uGateFire.value).toBe(1);
    for (let i = 0; i < 200; i++) stepStoneLight(false, 1 / 30);
    expect(stoneLight.uGateFire.value).toBe(0);
  });
});
