import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { audioBus, type PlayOptions } from '@/ui/audioBus';
import { resetShooterFeel } from './combat';
import { runtime } from './runtime';
import { useGame } from './store';
import { presentation, CHASE_HEAD } from './presentation';
import { guarded } from './shooterFault';
import { createShooterWorld } from './shotResolve';
import { createDroneSim } from './drones';
import { createAssistMemory } from './aimAssist';
import { createStepContext, stepShooter, type AudioSink } from './shooterStep';
import { autoFire, resetAutoFire } from './autoFire';
import { gesture } from './gesture/bus';
// The suit blaster's frame loop (scene chunk): priority -25, after the flight presentation (-30) and before the suit (-20) and
// the camera rig (-10), which publishes the camera ray this step reads one frame later. Mounted only while the setting is on.
const options: PlayOptions = { pan: 0, gain: 1, chain: 0 };
/** One stable sink: reuses one options object, so voicing a shot allocates nothing here. */
const sink: AudioSink = (kind, pan, gain, chain) => {
  options.pan = pan; options.gain = gain; options.chain = chain; audioBus.play(kind, options);
};
export default function Shooter() {
  const { world, rapier } = useRapier();
  const parts = useMemo(() => ({ world: createShooterWorld(world, rapier), sim: createDroneSim(runtime.shooter),
    mem: createAssistMemory(), ctx: createStepContext() }), [world, rapier]);
  const compiled = useRef(false);
  const frame = useMemo(() => guarded('Shooter', (state: RootState, delta: number) => {
    const game = useGame.getState(), ctx = parts.ctx, p = runtime.position, h = presentation.position;
    ctx.dt = delta; ctx.paused = game.paused; ctx.reduced = game.reduced; ctx.flying = game.flying;
    ctx.firstPerson = game.camera !== 'third'; ctx.strength = game.aimAssist; ctx.speed = runtime.speed;
    // Tap-to-blast replaces auto-fire in the lab schemes, so no tap on Lift/Land or another control can arm it there.
    ctx.autoFire = game.autoFire && gesture.scheme === 'off';
    ctx.player.x = p.x; ctx.player.y = p.y; ctx.player.z = p.z;
    ctx.head.x = h.x; ctx.head.y = h.y + CHASE_HEAD; ctx.head.z = h.z;
    // Paused: drop auto-fire's own hold and its dwell, so a resume needs a fresh 100 ms dwell.
    if (game.paused) resetAutoFire(runtime.shooter, autoFire);
    stepShooter(runtime.shooter, parts.sim, parts.mem, parts.world, ctx, sink);
    if (!compiled.current) {
      // Compile the pooled drone and effect programs now, so the first shot never stalls on a shader compile.
      compiled.current = true; state.gl.compileAsync(state.scene, state.camera).catch(() => {});
    }
  }), [parts]);
  useFrame(frame, -25);
  // Switching the setting off returns look, camera and pose to exact main behaviour.
  useEffect(() => () => { resetAutoFire(runtime.shooter, autoFire); resetShooterFeel(runtime.shooter); }, []);
  return null;
}
