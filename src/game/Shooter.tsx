import { useMemo, useRef, useEffect } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { audioBus, type PlayOptions } from '@/ui/audioBus';
import { resetShooterFeel } from './combat';
import { COMMAND, requestCommand } from './commands';
import { runtime } from './runtime';
import { useGame } from './store';
import { presentation, CHASE_HEAD } from './presentation';
import { guarded } from './shooterFault';
import { createShooterWorld } from './shotResolve';
import { createDroneSim } from './drones';
import { createAssistMemory } from './aimAssist';
import { createStepContext, stepShooter, type AudioSink } from './shooterStep';
import { autoFire, resetAutoFire } from './autoFire';
import { banish, resetBanish, stepBanish } from './banish';
import { commandKeyDown, commandKeyUp } from './commandKeys';
// The suit blaster's frame loop (scene chunk): priority -25, after the flight presentation (-30) and before the suit (-20) and
// the camera rig (-10), which publishes the camera ray this step reads one frame later. Mounted only while the setting is on.
const options: PlayOptions = { pan: 0, gain: 1, chain: 0 };
/** Last trigger press turned into a command: every Fire path (click, C, the tap pad, twin sticks) now means 'the next step'. */
let lastPress = -1;
/** One stable sink: reuses one options object, so voicing a shot allocates nothing here. */
const sink: AudioSink = (kind, pan, gain, chain) => {
  options.pan = pan; options.gain = gain; options.chain = chain; audioBus.play(kind, options);
};

export default function Shooter() {
  const { world, rapier } = useRapier();
  const parts = useMemo(() => ({ world: createShooterWorld(world, rapier), sim: createDroneSim(runtime.shooter), mem: createAssistMemory(), ctx: createStepContext() }), [world, rapier]);
  const compiled = useRef(false);
  const frame = useMemo(() => guarded('Shooter', (state: RootState, delta: number) => {
    const game = useGame.getState(), p = runtime.position, h = presentation.position, ctx = parts.ctx;
    ctx.firstPerson = game.camera !== 'third'; ctx.strength = game.aimAssist; ctx.speed = runtime.speed;
    ctx.autoFire = false;
    ctx.player.x = p.x; ctx.player.y = p.y; ctx.player.z = p.z;
    ctx.head.x = h.x; ctx.head.y = h.y + CHASE_HEAD; ctx.head.z = h.z;
    if (game.paused) resetAutoFire(runtime.shooter, autoFire);
    const input = runtime.shooter.input;
    if (lastPress < 0) lastPress = input.pressSerial;
    if (input.pressSerial !== lastPress) { lastPress = input.pressSerial; if (!game.paused) requestCommand(runtime.shooter, COMMAND.context); }
    input.fire = false; input.fireSource = 'none'; runtime.shooter.weapon.handledPress = input.pressSerial; runtime.shooter.weapon.pending = false;
    stepShooter(runtime.shooter, parts.sim, parts.mem, parts.world, ctx, sink);
    if (!game.paused) stepBanish(banish, runtime.shooter, p, delta);
    if (!compiled.current) {
      compiled.current = true; state.gl.compile(state.scene, state.camera);
    }
  }), [parts]);
  useFrame(frame, -25);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const g = useGame.getState(), tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (commandKeyDown({ code: e.code, repeat: e.repeat, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, targetTag: tag }, g.started && !g.paused, runtime.shooter)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => commandKeyUp(e.code, runtime.shooter);
    addEventListener('keydown', down); addEventListener('keyup', up);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); commandKeyUp('KeyV', runtime.shooter); };
  }, []);
  useEffect(() => { resetBanish(banish, runtime.shooter); return () => { resetAutoFire(runtime.shooter, autoFire); resetShooterFeel(runtime.shooter); resetBanish(banish, runtime.shooter); }; }, []);
  return null;
}
