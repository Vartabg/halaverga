import { advanceVelocity, moving, type Intent, type Vec } from './motion';
import { runtime } from './runtime';
import { momentumVelocity } from './momentumFlight';
import { flightFeel } from './flightFeel';
import { gesture } from './gesture/bus';
import { carve } from './carve';
import { cancelStrike, strike } from './strike';
import { strikeLook } from './strikeLook';
import { useGame } from './store';
let requests = -1, epoch = -1, brakes = -1, touch = -1, active = false, cruising = false;
/** Player's standard flight branch. Lab paths and precision aim retain their explicit movement owners. */
export function pilotVelocity(v: Vec, intent: Intent, yaw: number, pitch: number, flying: boolean, surge: boolean, dt: number) {
  if (epoch !== runtime.poseEpoch) { epoch = runtime.poseEpoch; requests = flightFeel.serial; flightFeel.brake = false; active = false; brakes = runtime.trackpad.brakeEpoch; touch = runtime.touchEpoch; cruising = runtime.trackpad.active; }
  const interrupted = requests !== flightFeel.serial || brakes !== runtime.trackpad.brakeEpoch || touch !== runtime.touchEpoch || cruising && !runtime.trackpad.active;
  if (interrupted) { flightFeel.brake = true; cancelStrike(); }
  else if (strike.phase === 1) flightFeel.brake = false; // a fresh attack leaves a deliberately parked hover
  requests = flightFeel.serial; brakes = runtime.trackpad.brakeEpoch; touch = runtime.touchEpoch; cruising = runtime.trackpad.active;
  const live = moving(intent);
  if (live && !active) flightFeel.brake = false;
  active = live;
  if (flightFeel.brake) cancelStrike();
  const looking = runtime.thumb.active || runtime.trackpad.held || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].some(k => runtime.keys.has(k));
  if (strike.phase === 1 && !looking && !useGame.getState().reduced) strikeLook(runtime, runtime.position, strike.aim, dt);
  if (gesture.scheme !== 'off') {
    carve(v, yaw, dt, flying && !runtime.landGoal && !runtime.thumb.active && (live || surge || gesture.live), runtime.poseEpoch);
    return advanceVelocity(v, intent, yaw, pitch, flying, surge, dt);
  }
  return momentumVelocity(v, intent, yaw, pitch, flying, surge, dt, flightFeel.brake);
}
