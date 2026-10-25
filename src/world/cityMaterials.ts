import { useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { paintInkMaterial } from './paintInk';

/** Procedural megalithic sanctuary materials: no modern concrete photographs or building texture grammar. */
export function useCityMaterials() {
  return useMemo(() => {
    const stone = new MeshStandardMaterial({ vertexColors: true, roughness: .88, metalness: .04, flatShading: true });
    const glass = new MeshStandardMaterial({ vertexColors: true, roughness: .58, metalness: .18 });
    const metal = new MeshStandardMaterial({ vertexColors: true, roughness: .34, metalness: .82,
      emissive: '#3a1c06', emissiveIntensity: .38 });
    const ground = new MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: .02, flatShading: true });
    const paint = new MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .35,
      emissive: '#d98a2b', emissiveIntensity: .65 });
    const calm = stone.clone(); calm.roughness = .96;
    return [stone, glass, metal, ground, paint, calm, paintInkMaterial()];
  }, []);
}
