'use client';
import { Suspense } from 'react';
import Semjaza from './Semjaza';
import SemjazaGLB from './SemjazaGLB';
import SpearCombat from './SpearCombat';
import SpearGLB from './SpearGLB';
import { bossRuntime } from '@/game/bossRuntime';
import Boundary from '@/ui/Boundary';

export default function BossEncounter() {
  return (
    <>
      <Boundary fallback={<Semjaza boss={bossRuntime.boss} />} onError={() => {}}>
        <Suspense fallback={<Semjaza boss={bossRuntime.boss} />}>
          <SemjazaGLB boss={bossRuntime.boss} />
        </Suspense>
      </Boundary>
      <Boundary
        fallback={
          <SpearCombat
            combat={bossRuntime.combat}
            spear={bossRuntime.spear}
            boss={bossRuntime.boss}
          />
        }
        onError={() => {}}
      >
        <Suspense
          fallback={
            <SpearCombat
              combat={bossRuntime.combat}
              spear={bossRuntime.spear}
              boss={bossRuntime.boss}
            />
          }
        >
          <SpearGLB
            combat={bossRuntime.combat}
            spear={bossRuntime.spear}
            boss={bossRuntime.boss}
          />
        </Suspense>
      </Boundary>
    </>
  );
}
