// The sword connects (banish.ts calls this at the end of a dive or a step-in). Each landed cut is one of the string's three
// (swordString.ts): its own hit-stop, shove, camera jolt and arc. Only the last one binds the demon and casts it down.
import type { ShooterState, Vec3 } from './combat';
import { addTrauma, kick, punchFov } from './cameraFx';
import { FX, MODE, type BanishState } from './banishState';
import { cue, emit, interrupt, jolt } from './banishHits';
import { bindDuration, isElite } from './encounter';
import { absorbEliteStrike } from './eliteCombat';
import { finishStrike, holdStrike, landStrike, strike as dive } from './strike';
import { CUTS, LAST, STRING, closeString, cutFor, launch, powerOf, woundDemon } from './swordString';

export function landBlow(b: BanishState, s: ShooterState, i: number, player: Vec3) {
  const f = s.drones, elite = isElite(i), armor = b.armor[i];
  const guarded = absorbEliteStrike(b, s, i);
  const repelled = guarded && elite && armor === b.armor[i];
  const n = cutFor(b, i, guarded, armor), cut = CUTS[n], last = !guarded && n === LAST;
  b.combo = b.clock <= b.comboUntil ? b.combo + 1 : 1; b.comboUntil = b.clock + 4;
  jolt(s, i, player, 9);
  f.knockV[i].x += dive.dir.x * 10; f.knockV[i].y += dive.dir.y * 10; f.knockV[i].z += dive.dir.z * 10;
  addTrauma(s.camFx, cut.trauma); punchFov(s.camFx, 'kill', cut.fov); kick(s.camFx, cut.kick, 0);
  emit(b, FX.sword, i, player, f.pos[i], n);
  interrupt(s, i);
  if (guarded) {
    // A warden's armour turns the blade: the angel is thrown back, and the duel decides the opening (eliteCombat.ts).
    landStrike(true, repelled ? .07 : .11);
    if (repelled) cue(b, 'guarded');
    dive.carrySpeed = 24; dive.dir.x *= -1; dive.dir.y *= -1; dive.dir.z *= -1;
    emit(b, FX.armor, i, player, f.pos[i]); return;
  }
  if (!last) {
    // Not the last cut: the blow throws the demon (thrown.ts) and the angel stays with it, ready for the next.
    woundDemon(b, i, dive.dir, cut, dive.speed);
    b.mode[i] = MODE.staggered; b.timer[i] = STRING.recover; f.held[i] = 1;
    holdStrike(cut.freeze, STRING.window, -dive.dir.x * cut.back, cut.rise - dive.dir.y * cut.back, -dive.dir.z * cut.back);
    return;
  }
  // The casting blow: bound and cast down as before. The angel hangs over the blow for a beat and is released there, at rest: it
  // is not launched onward (Garo 2026-11-11: the strike "flies the angel through the demon by itself"). The speed the opener
  // arrived with still decides how hard the demon is thrown.
  // A demon finished after the angel had gone to another keeps no stored speed: a dive in gives its own, a step-in the floor.
  const stored = b.string.target === i ? b.string.speed : dive.lunge ? 0 : dive.speed;
  b.resist[i] = 0; closeString(b, i);
  f.held[i] = 1; Object.assign(b.base[i], f.pos[i]); emit(b, FX.bind, i, player, f.pos[i]);
  // A warden keeps its rite: bound, then cast down. A lesser demon is driven down for real: forward along the way the angel is
  // looking (after the rising cut the angel is above it, so the blow itself points at the ground) and down, into the mountain ahead.
  if (elite) { b.mode[i] = MODE.bound; b.timer[i] = -bindDuration(i); }
  else { b.mode[i] = MODE.cast; b.timer[i] = 0; b.hit[i] = 0; launch(b, i, s.aim.valid ? s.aim.dir : dive.dir, cut, powerOf(stored)); emit(b, FX.cast, i, player, f.pos[i]); }
  if (elite) landStrike(false, .11); else finishStrike(cut.freeze, STRING.finish);
}
