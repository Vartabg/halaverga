import { flightTarget, moving, SPEED, type Intent, type Vec } from './motion';
import { idleLimitSteer, limitSteer, type Contact } from './limitSteer';
import type { FlightSafety } from './FlightSafety';
/**
 * The one call site of the limit steering, shared by Player.tsx and the headless harness (tests/lim/harness.ts): builds what
 * limitSteer needs from the controls (the speed and direction they ask for, twin-touch level flight, the trigger) and runs it. When
 * `on` is false (landed, landing, hovering aimed, a drawn Lab stroke that flies by velocity) it drops the latches instead.
 */
export interface DriveIn {
  on: boolean; dt: number; p: Vec; v: Vec; speed: number; intent: Intent; surge: boolean;
  /** Twin-touch level flight: the view pitch is aim only. */ level: boolean;
  /** The blaster trigger is held. */ aiming: boolean; contact: Contact; scrape: Contact; safe: Pick<FlightSafety, 'freeRun'>;
}
export function driveLimits(rt: { yaw: number; pitch: number }, i: DriveIn): void {
  if (!i.on) { idleLimitSteer(); return; }
  const a = i.intent, commanded = moving(a) ? Math.min(1, Math.hypot(a.forward, a.strafe, a.vertical)) * (i.surge ? SPEED.surge : SPEED.flight) : 0;
  limitSteer(rt, { dt: i.dt, p: i.p, v: i.v, speed: i.speed, commanded, target: flightTarget(a, rt.yaw, i.level ? 0 : rt.pitch, true, i.surge), contact: i.contact,
    scrape: i.scrape, pitchFlies: !i.level, aiming: i.aiming, free: (x, z) => i.safe.freeRun(i.p, x, z) });
}
