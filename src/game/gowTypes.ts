export const GOW_URL = '/models/archangel-gow.glb';

export type GowAction =
  | 'idle' | 'light1' | 'light2' | 'light3' | 'light4' | 'heavy'
  | 'counter' | 'parry' | 'dodge' | 'runic' | 'rage_slam' | 'execute'
  | 'swoop' | 'sky_beam' | 'hurt';

export const GOW_CLIPS = [
  'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Roll',
  'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Sword_Idle', 'Sword_Attack',
  'Punch_Jab', 'Punch_Cross', 'Spell_Simple_Enter', 'Spell_Simple_Idle_Loop',
  'Spell_Simple_Shoot', 'Hit_Chest', 'Hit_Head', 'Death01',
] as const;

export type GowClipName = (typeof GOW_CLIPS)[number];

export type AttackSpec = {
  action: GowAction;
  clip: GowClipName;
  clipStart: number;
  duration: number;
  hitTime: number;
  damage: number;
  stun: number;
  reach: number;
  lungeSpeed: number;
  lungeDuration: number;
  timeScale: number;
  slashTilt: number;
  spinTurns: number;
  label: string;
};

export const ATTACK_SPECS: Record<Exclude<GowAction, 'idle' | 'parry' | 'dodge' | 'hurt'>, AttackSpec> = {
  light1: { action: 'light1', clip: 'Sword_Attack', clipStart: 0.58, duration: 0.44, hitTime: 0.16, damage: 24, stun: 12, reach: 3.9, lungeSpeed: 6.5, lungeDuration: 0.2, timeScale: 1.65, slashTilt: 0.35, spinTurns: 0, label: 'DAWN CLEAVE' },
  light2: { action: 'light2', clip: 'Punch_Jab', clipStart: 0.08, duration: 0.40, hitTime: 0.14, damage: 28, stun: 16, reach: 4.0, lungeSpeed: 7.2, lungeDuration: 0.2, timeScale: 1.75, slashTilt: -0.45, spinTurns: 0, label: 'AEGIS BACKHAND' },
  light3: { action: 'light3', clip: 'Punch_Cross', clipStart: 0.12, duration: 0.46, hitTime: 0.18, damage: 34, stun: 22, reach: 4.5, lungeSpeed: 8.0, lungeDuration: 0.22, timeScale: 1.65, slashTilt: 0.08, spinTurns: 0, label: 'WHIRLWIND SLASH' },
  light4: { action: 'light4', clip: 'Sword_Attack', clipStart: 0.42, duration: 0.54, hitTime: 0.24, damage: 52, stun: 34, reach: 4.8, lungeSpeed: 9.2, lungeDuration: 0.24, timeScale: 1.65, slashTilt: 1.42, spinTurns: 0, label: 'HEAVENS WRATH' },
  heavy: { action: 'heavy', clip: 'Sword_Attack', clipStart: 0.45, duration: 0.52, hitTime: 0.22, damage: 32, stun: 48, reach: 4.2, lungeSpeed: 7.8, lungeDuration: 0.22, timeScale: 1.65, slashTilt: 1.52, spinTurns: 0, label: 'LEVIATHAN SLAM' },
  counter: { action: 'counter', clip: 'Punch_Cross', clipStart: 0.12, duration: 0.46, hitTime: 0.15, damage: 36, stun: 55, reach: 4.6, lungeSpeed: 10.5, lungeDuration: 0.2, timeScale: 1.65, slashTilt: -0.25, spinTurns: 0, label: 'ARKHAM RIPOSTE' },
  runic: { action: 'runic', clip: 'Spell_Simple_Shoot', clipStart: 0.06, duration: 0.48, hitTime: 0.18, damage: 58, stun: 36, reach: 18.0, lungeSpeed: 0, lungeDuration: 0, timeScale: 1.35, slashTilt: 0, spinTurns: 0, label: 'URIEL FLAME' },
  rage_slam: { action: 'rage_slam', clip: 'Jump_Land', clipStart: 0.05, duration: 0.58, hitTime: 0.24, damage: 72, stun: 55, reach: 7.0, lungeSpeed: 9.5, lungeDuration: 0.26, timeScale: 1.45, slashTilt: 0, spinTurns: 0, label: 'ARCHANGEL SLAM' },
  execute: { action: 'execute', clip: 'Sword_Attack', clipStart: 0.42, duration: 0.62, hitTime: 0.26, damage: 140, stun: 0, reach: 4.5, lungeSpeed: 7.5, lungeDuration: 0.22, timeScale: 1.55, slashTilt: 1.35, spinTurns: 0, label: 'WATCHER EXECUTION' },
  swoop: { action: 'swoop', clip: 'Sword_Attack', clipStart: 0.45, duration: 0.50, hitTime: 0.34, damage: 56, stun: 42, reach: 6.5, lungeSpeed: 24.0, lungeDuration: 0.34, timeScale: 1.65, slashTilt: 1.35, spinTurns: 0, label: 'ARCHANGEL SWOOP' },
  sky_beam: { action: 'sky_beam', clip: 'Sword_Attack', clipStart: 0.58, duration: 0.38, hitTime: 0.12, damage: 38, stun: 24, reach: 28.0, lungeSpeed: 0, lungeDuration: 0, timeScale: 1.85, slashTilt: 0.25, spinTurns: 0, label: 'CELESTIAL SWORD BEAM' },
};

export type EnemyId = 'nephilim-west' | 'nephilim-east' | 'semjaza-boss';
export type EnemyState = 'idle' | 'chase' | 'windup_yellow' | 'windup_red' | 'windup_spell' | 'strike' | 'stagger' | 'stunned' | 'dead';

export interface GowEnemy {
  id: EnemyId; name: string; title: string; isBoss: boolean; scale: number;
  x: number; y: number; z: number; vx: number; vz: number; spawnX: number; spawnZ: number; yaw: number;
  hp: number; maxHp: number; stun: number; maxStun: number;
  state: EnemyState; stateTimer: number; stateDuration: number; hitDealt: boolean;
  cooldown: number; attackIndex: number; respawnTimer: number; clip: GowClipName; clipSpeed: number; flashTimer: number;
}

export interface GowProjectile {
  active: boolean; fromPlayer: boolean; x: number; y: number; z: number;
  vx: number; vy: number; vz: number; life: number; damage: number; stun: number;
}

export interface GowSpark {
  active: boolean; x: number; y: number; z: number;
  vx: number; vy: number; vz: number; life: number; maxLife: number; color: string;
}

export interface GowPopup {
  id: number; text: string; tone: 'gold' | 'stun' | 'crimson' | 'parry';
  x: number; y: number; z: number; age: number;
}

export function createInitialEnemies(): GowEnemy[] {
  return [
    {
      id: 'nephilim-west', name: 'Azazel Vanguard', title: 'Fallen Guard', isBoss: false, scale: 1.18,
      x: -4.2, y: 20, z: 56.5, vx: 0, vz: 0, spawnX: -4.2, spawnZ: 56.5, yaw: 0,
      hp: 140, maxHp: 140, stun: 0, maxStun: 100, state: 'idle', stateTimer: 0, stateDuration: 1,
      hitDealt: false, cooldown: 0.9, attackIndex: 0, respawnTimer: 0, clip: 'Sword_Idle', clipSpeed: 1, flashTimer: 0,
    },
    {
      id: 'nephilim-east', name: 'Baraqel Vanguard', title: 'Fallen Guard', isBoss: false, scale: 1.18,
      x: 4.2, y: 20, z: 56.5, vx: 0, vz: 0, spawnX: 4.2, spawnZ: 56.5, yaw: 0,
      hp: 140, maxHp: 140, stun: 0, maxStun: 100, state: 'idle', stateTimer: 0, stateDuration: 1,
      hitDealt: false, cooldown: 1.4, attackIndex: 0, respawnTimer: 0, clip: 'Sword_Idle', clipSpeed: 1, flashTimer: 0,
    },
    {
      id: 'semjaza-boss', name: 'Semjaza', title: 'Chief of the Two Hundred Watchers', isBoss: true, scale: 2.15,
      x: 0, y: 20, z: 49.0, vx: 0, vz: 0, spawnX: 0, spawnZ: 49.0, yaw: 0,
      hp: 520, maxHp: 520, stun: 0, maxStun: 100, state: 'idle', stateTimer: 0, stateDuration: 1,
      hitDealt: false, cooldown: 1.8, attackIndex: 0, respawnTimer: 0, clip: 'Sword_Idle', clipSpeed: 1, flashTimer: 0,
    },
  ];
}

export const gowRuntime = {
  heroReady: false, hp: 100, maxHp: 100, rage: 40, maxRage: 100, rageActive: 0,
  action: 'idle' as GowAction, actionSeq: 0, actionTimer: 0, actionDuration: 0,
  hitDone: false, queuedLight: false, comboStep: 0, comboResetTimer: 0, comboHits: 0, comboBannerTimer: 0,
  lastMoveLabel: '', parryWindow: 0, dodgeInvuln: 0, runicCooldown: 0, hitstopTimer: 0, realmShiftTimer: 0,
  shockwaveTimer: 0, shockwaveX: 0, shockwaveY: 20, shockwaveZ: 55, shockwaveMaxR: 5, shockwaveColor: '#ffcf5c',
  slashTimer: 0, slashDuration: 0.28, slashTilt: 0, slashSpin: 0, slashColor: '#ffd166',
  lockedTargetId: null as EnemyId | null, executableId: null as EnemyId | null, threatPrompt: '',
  threatTone: 'gold' as 'gold' | 'crimson' | 'stun',
  cursorWorldX: 0, cursorWorldZ: 55, cursorActiveTimer: 0, facingLeft: false,
  enemies: createInitialEnemies(),
  projectiles: Array.from({ length: 8 }, (): GowProjectile => ({
    active: false, fromPlayer: true, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, damage: 0, stun: 0,
  })),
  sparks: Array.from({ length: 16 }, (): GowSpark => ({
    active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.35, color: '#ffd166',
  })),
  popups: [] as GowPopup[], nextPopupId: 1, hudTick: 0,
};
