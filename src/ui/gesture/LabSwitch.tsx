'use client';
import { useState } from 'react';
import { useGame } from '@/game/store';
import { switchLab } from '../labSwitch';
import LabPicker, { LabRating } from './LabPicker';
import type { LabId } from './labStats';
// The live control switch (pause card and flight settings): the picker saves the choice and remounts the controls; the scheme
// just left may be rated (optional, both questions skippable). A lazy chunk, so the landing first load carries none of it.
export default function LabSwitch({ name }: { name?: string }) {
  const value = useGame(s => s.controlLab);
  const [left, setLeft] = useState<LabId | null>(null);
  const change = (id: LabId) => { const prev = switchLab(id); if (prev !== id) setLeft(prev); };
  return <>
    <LabPicker value={value} onChange={change} name={name} />
    {left && <LabRating key={left} scheme={left} onDone={() => setLeft(null)} />}
  </>;
}
