'use client';
import { Suspense } from 'react';
import Semjaza from './Semjaza';
import SpearCombat from './SpearCombat';
import { bossRuntime } from '@/game/bossRuntime';
import Boundary from '@/ui/Boundary';

export default function BossEncounter() {
  return (
    <Boundary fallback={null} onError={() => {}}>
      <Suspense fallback={null}>
        <Semjaza boss={bossRuntime.boss} />
        <SpearCombat
          combat={bossRuntime.combat}
          spear={bossRuntime.spear}
          boss={bossRuntime.boss}
        />
      </Suspense>
    </Boundary>
  );
}
