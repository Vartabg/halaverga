// The one registry of every way to fly: ten ids, each a fixed settings patch. Plain data and pure functions (no React, DOM, three or Next),
// so the picker, the vote server and the tests all read the same table. Draw, Conduct and Brush belong to both families; a vote key is `${family}:${id}`.
import type { ControlFields } from '@/game/store';

export type ControlFamily = 'touch' | 'desktop';
export const CONTROL_FAMILIES: readonly ControlFamily[] = ['touch', 'desktop'];
export type ControlId = 'one-finger' | 'twin-stick' | 'cursor' | 'one-finger-keys' | 'flow' | 'captured' | 'mouse-keys' | 'draw' | 'conduct' | 'brush';
export type ControlType = {
  id: ControlId; label: string;
  /** How it works, in plain words (70 characters at most). */
  line: string;
  /** What it needs (50 characters at most). */
  hint?: string;
  families: readonly ControlFamily[];
  /** The exact settings this control writes; a lab id writes only controlLab. */
  settings: Partial<ControlFields>;
};
const both: readonly ControlFamily[] = ['touch', 'desktop'];
const std = { controlLab: 'standard' } as const;
// Lines and hints were checked against useClassicThumbs, useTwinStick and TouchCluster (touch), useTrackpad, useSimpleTrackpad, useFlowTrackpad,
// trackpadPill and hoverPress (desktop), docs/flow-trackpad.md and docs/gesture-lab.md. The free cursor's click fires while the blaster is on,
// so its line names Space; the twin Fire button is hidden while auto-fire (the default) is on, so the line names only Rise, Descend and Aim.
export const CONTROL_TYPES: readonly ControlType[] = [
  { id: 'one-finger', label: 'One finger', families: ['touch'], settings: { ...std, touchScheme: 'classic' },
    line: 'Hold to fly, slide to steer, tap a drone to blast it.' },
  { id: 'twin-stick', label: 'Twin stick', families: ['touch'], settings: { ...std, touchScheme: 'twin' },
    line: 'Left thumb moves, right thumb looks; buttons rise, descend and aim.' },
  { id: 'cursor', label: 'Cursor', families: ['desktop'], settings: { ...std, desktopMode: 'trackpad', trackpadSteering: 'free' },
    line: 'Space to fly, then move to steer. Click fires, drag looks.', hint: 'Blaster off: a click starts flying instead.' },
  { id: 'one-finger-keys', label: 'One finger + keys', families: ['desktop'], settings: { ...std, desktopMode: 'trackpad', trackpadSteering: 'simple' },
    line: 'Trackpad or mouse looks, W A S D flies, click fires.', hint: 'Click the scene first to start looking.' },
  { id: 'flow', label: 'Flow', families: ['desktop'], settings: { ...std, desktopMode: 'trackpad', trackpadSteering: 'flow' },
    line: 'Slide to look, two-finger scroll to glide, press to brake.', hint: 'Built for a trackpad. First time: a short intro.' },
  { id: 'captured', label: 'Captured', families: ['desktop'], settings: { ...std, desktopMode: 'trackpad', trackpadSteering: 'captured' },
    line: 'Click to cruise with unlimited turning; the pointer hides.', hint: 'Esc gives the pointer back.' },
  { id: 'mouse-keys', label: 'Mouse + keys', families: ['desktop'], settings: { ...std, desktopMode: 'mouse' },
    line: 'Click to capture the mouse, W A S D to move, click to fire.', hint: 'Esc gives the mouse back.' },
  { id: 'draw', label: 'Draw', families: both, settings: { controlLab: 'draw' },
    line: 'Draw a line to fly it. Draw a circle to turn around.' },
  { id: 'conduct', label: 'Conduct', families: both, settings: { controlLab: 'conduct' },
    line: 'Rest a finger (or the pointer) to steer. Stir to speed up.' },
  { id: 'brush', label: 'Brush', families: both, settings: { controlLab: 'brush' },
    line: 'Swipe to turn, loop big to whirl around. Circle drones to lock on.' },
];
export const DEFAULT_CONTROL: Readonly<Record<ControlFamily, ControlId>> = { touch: 'one-finger', desktop: 'cursor' };

/** The controls a family lists, in sheet order (desktop digits 1-8 follow this order). */
export const controlsFor = (family: ControlFamily): readonly ControlType[] => CONTROL_TYPES.filter(c => c.families.includes(family));
export const isControlId = (v: unknown): v is ControlId => typeof v === 'string' && CONTROL_TYPES.some(c => c.id === v);
export const controlById = (id: ControlId): ControlType => CONTROL_TYPES.find(c => c.id === id)!;
export const isControlFor = (id: unknown, family: ControlFamily): id is ControlId => isControlId(id) && controlById(id).families.includes(family);
export const settingsFor = (id: ControlId): Partial<ControlFields> => ({ ...controlById(id).settings });

/** The control the fields describe: a lab other than standard wins; otherwise the family's own setting decides. Total over every combination. */
export function idFor(fields: ControlFields, family: ControlFamily): ControlId {
  if (fields.controlLab !== 'standard') return fields.controlLab;
  if (family === 'touch') return fields.touchScheme === 'twin' ? 'twin-stick' : 'one-finger';
  if (fields.desktopMode === 'mouse') return 'mouse-keys';
  const s = fields.trackpadSteering;
  return s === 'simple' ? 'one-finger-keys' : s === 'flow' ? 'flow' : s === 'captured' ? 'captured' : 'cursor';
}

/** ?controls=: the legacy 'standard' keeps its old meaning (only the lab is cleared), any registry id applies its patch, anything else is null. */
export function parseControlParam(raw: string | null | undefined): Partial<ControlFields> | null {
  if (raw === 'standard') return { controlLab: 'standard' };
  return isControlId(raw) ? settingsFor(raw) : null;
}
export const controlKey = (family: ControlFamily, id: ControlId) => `${family}:${id}` as const;
