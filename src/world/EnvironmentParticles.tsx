import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, Vector3 } from 'three';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';

const COUNT_POLLEN = 130, COUNT_MIST = 60, COUNT_STREAK = 50;
const TOTAL_COUNT = COUNT_POLLEN + COUNT_MIST + COUNT_STREAK;

const particleVertex = `
  uniform float uTime; uniform vec3 uSun; uniform float uSpeed;
  attribute float aType; attribute float aScale; attribute float aPhase;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(aScale * (280.0 / -mvPosition.z), 1.5, 64.0);
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    float sDot = max(dot(normalize(worldPos - cameraPosition), uSun), 0.0);
    float forwardGlow = pow(sDot, 14.0) * 2.2 + pow(sDot, 4.0) * 0.45;
    float pulse = sin(uTime * 2.4 + aPhase) * 0.22 + 0.78;
    float heightFade = smoothstep(14.0, 3.0, position.y);
    if (aType < 0.5) {
      vec3 col = mix(vec3(1.0, 0.88, 0.54), vec3(0.85, 0.95, 0.68), sin(aPhase) * 0.5 + 0.5);
      vColor = col * (1.0 + forwardGlow * 1.6);
      vAlpha = (0.32 + 0.28 * forwardGlow) * pulse * heightFade;
    } else if (aType < 1.5) {
      vColor = vec3(0.68, 0.88, 0.84) * (1.0 + forwardGlow * 0.6);
      vAlpha = 0.20 * pulse * heightFade;
    } else {
      vColor = vec3(0.88, 0.94, 1.0);
      vAlpha = smoothstep(2.5, 12.0, uSpeed) * 0.45 * pulse;
    }
  }
`;

const particleFragment = `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    gl_FragColor = vec4(vColor, exp(-dist * dist * 10.0) * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function EnvironmentParticles() {
  const pointsRef = useRef<Points>(null);
  const data = useMemo(() => {
    const positions = new Float32Array(TOTAL_COUNT * 3);
    const velocities = new Float32Array(TOTAL_COUNT * 3);
    const types = new Float32Array(TOTAL_COUNT);
    const scales = new Float32Array(TOTAL_COUNT);
    const phases = new Float32Array(TOTAL_COUNT);

    // 1. Pollen & spores
    for (let i = 0; i < COUNT_POLLEN; i++) {
      positions[i * 3] = (Math.random() - .5) * 40;
      positions[i * 3 + 1] = 1 + Math.random() * 7;
      positions[i * 3 + 2] = 40 + (Math.random() - .5) * 40;
      velocities[i * 3] = (Math.random() - .5) * .5;
      velocities[i * 3 + 1] = -.06 + (Math.random() - .5) * .12;
      velocities[i * 3 + 2] = .2 + Math.random() * .4;
      types[i] = 0; scales[i] = .18 + Math.random() * .14; phases[i] = Math.random() * Math.PI * 2;
    }
    // 2. Canal mist
    for (let i = COUNT_POLLEN; i < COUNT_POLLEN + COUNT_MIST; i++) {
      positions[i * 3] = (Math.random() - .5) * 28;
      positions[i * 3 + 1] = .4 + Math.random() * 3.6;
      positions[i * 3 + 2] = 20 - Math.random() * 90;
      velocities[i * 3] = (Math.random() - .5) * .25;
      velocities[i * 3 + 1] = (Math.random() - .5) * .08;
      velocities[i * 3 + 2] = .15 + Math.random() * .35;
      types[i] = 1; scales[i] = .85 + Math.random() * .95; phases[i] = Math.random() * Math.PI * 2;
    }
    // 3. Slipstream flight streaks
    for (let i = COUNT_POLLEN + COUNT_MIST; i < TOTAL_COUNT; i++) {
      positions[i * 3] = (Math.random() - .5) * 16;
      positions[i * 3 + 1] = 20 + (Math.random() - .5) * 12;
      positions[i * 3 + 2] = 60 + (Math.random() - .5) * 20;
      velocities[i * 3] = (Math.random() - .5) * .4;
      velocities[i * 3 + 1] = (Math.random() - .5) * .4;
      velocities[i * 3 + 2] = -1.2 - Math.random() * 1.5;
      types[i] = 2; scales[i] = .16 + Math.random() * .12; phases[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aType', new Float32BufferAttribute(types, 1));
    geometry.setAttribute('aScale', new Float32BufferAttribute(scales, 1));
    geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1));

    const material = new ShaderMaterial({
      vertexShader: particleVertex, fragmentShader: particleFragment,
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: new Vector3(-65, 100, 80).normalize() },
        uSpeed: { value: 0 },
      },
      transparent: true, blending: AdditiveBlending, depthWrite: false,
    });
    return { geometry, material, velocities };
  }, []);

  useEffect(() => () => { data.geometry.dispose(); data.material.dispose(); }, [data]);

  useFrame((_, dt) => {
    if (!pointsRef.current || useGame.getState().paused) return;
    const elapsed = Math.min(dt, .05);
    data.material.uniforms.uTime.value += elapsed;
    data.material.uniforms.uSpeed.value = runtime.speed;
    const array = (data.geometry.attributes.position as Float32BufferAttribute).array as Float32Array;
    const { x: px, y: py, z: pz } = runtime.position;

    for (let i = 0; i < COUNT_POLLEN; i++) {
      const idx = i * 3;
      array[idx] += data.velocities[idx] * elapsed;
      array[idx + 1] += data.velocities[idx + 1] * elapsed;
      array[idx + 2] += data.velocities[idx + 2] * elapsed;
      if (array[idx] - px > 26) array[idx] -= 52; else if (array[idx] - px < -26) array[idx] += 52;
      if (array[idx + 1] > 12) array[idx + 1] = 1; else if (array[idx + 1] < 1) array[idx + 1] = 11;
      if (array[idx + 2] - pz > 26) array[idx + 2] -= 52; else if (array[idx + 2] - pz < -26) array[idx + 2] += 52;
    }
    for (let i = COUNT_POLLEN; i < COUNT_POLLEN + COUNT_MIST; i++) {
      const idx = i * 3;
      array[idx] += data.velocities[idx] * elapsed;
      array[idx + 1] += data.velocities[idx + 1] * elapsed;
      array[idx + 2] += data.velocities[idx + 2] * elapsed;
      if (array[idx] > 16) array[idx] = -16; else if (array[idx] < -16) array[idx] = 16;
      if (array[idx + 1] > 4.5) array[idx + 1] = .4; else if (array[idx + 1] < .2) array[idx + 1] = 4.2;
      if (array[idx + 2] - pz > 36) array[idx + 2] -= 72; else if (array[idx + 2] - pz < -36) array[idx + 2] += 72;
    }
    for (let i = COUNT_POLLEN + COUNT_MIST; i < TOTAL_COUNT; i++) {
      const idx = i * 3;
      const v = runtime.speed > 1 ? -.35 : 1;
      array[idx] += (runtime.speed > 1 ? runtime.velocity.x * v : data.velocities[idx]) * elapsed;
      array[idx + 1] += (runtime.speed > 1 ? runtime.velocity.y * v : data.velocities[idx + 1]) * elapsed;
      array[idx + 2] += (runtime.speed > 1 ? runtime.velocity.z * v : data.velocities[idx + 2]) * elapsed;
      if (array[idx] - px > 10) array[idx] -= 20; else if (array[idx] - px < -10) array[idx] += 20;
      if (array[idx + 1] - py > 8) array[idx + 1] -= 16; else if (array[idx + 1] - py < -8) array[idx + 1] += 16;
      if (array[idx + 2] - pz > 14) array[idx + 2] -= 28; else if (array[idx + 2] - pz < -14) array[idx + 2] += 28;
    }
    data.geometry.attributes.position.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={data.geometry} material={data.material} />;
}
