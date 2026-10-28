export const GOW_URL = '/models/archangel-gow.glb';

export type GowAction =
  | 'idle'
  | 'light1'
  | 'light2'
  | 'light3'
  | 'heavy'
  | 'parry'
  | 'dodge'
  | 'runic'
  | 'rage_slam'
  | 'execute'
  | 'hurt';

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
  duration: number;
  hitTime: number;
  damage: number;
  stun: number;
  reach: number;
  lungeSpeed: number;
  lungeDuration: number;
  timeScale: number;
  label: string;
};

export const ATTACK_SPECS: Record<Exclude<GowAction, 'idle' | 'parry' | 'dodge' | 'hurt'>, AttackSpec> = {
  light1: { action: 'light1', clip: 'Sword_Attack', duration: 0.46, hitTime: 0.18, damage: 24, stun: 12, reach: 3.8, lungeSpeed: 5.2, lungeDuration: 0.18, timeScale: 1.45, label: 'DAWN CLEAVE' },
  light2: { action: 'light2', clip: 'Sword_Attack', duration: 0.44, hitTime: 0.16, damage: 28, stun: 15, reach: 3.9, lungeSpeed: 5.8, lungeDuration: 0.18, timeScale: 1.6, label: 'CROSS SLASH' },
  light3: { action: 'light3', clip: 'Sword_Attack', duration: 0.58, hitTime: 0.24, damage: 46, stun: 28, reach: 4.5, lungeSpeed: 7.2, lungeDuration: 0.24, timeScale: 1.25, label: 'JUDGMENT FINISHER' },
  heavy: { action: 'heavy', clip: 'Punch_Cross', duration: 0.52, hitTime: 0.2, damage: 22, stun: 44, reach: 3.4, lungeSpeed: 6.4, lungeDuration: 0.2, timeScale: 1.3, label: 'AEGIS BASH' },
  runic: { action: 'runic', clip: 'Spell_Simple_Shoot', duration: 0.62, hitTime: 0.24, damage: 58, stun: 36, reach: 18.0, lungeSpeed: 0, lungeDuration: 0, timeScale: 1.35, label: 'URIEL FLAME' },
  rage_slam: { action: 'rage_slam', clip: 'Jump_Land', duration: 0.68, hitTime: 0.28, damage: 72, stun: 55, reach: 6.8, lungeSpeed: 8.5, lungeDuration: 0.26, timeScale: 1.15, label: 'ARCHANGEL SLAM' },
  execute: { action: 'execute', clip: 'Sword_Attack', duration: 0.72, hitTime: 0.3, damage: 135, stun: 0, reach: 4.2, lungeSpeed: 6.0, lungeDuration: 0.22, timeScale: 1.1, label: 'WATCHER EXECUTION' },
};

export type EnemyId = 'nephilim-west' | 'nephilim-east' | 'semjaza-boss';
export type EnemyState = 'idle' | 'chase' | 'windup_yellow' | 'windup_red' | 'windup_spell' | 'strike' | 'stagger' | 'stunned' | 'dead';

export interface GowEnemy {
  id: EnemyId;
  name: string;
  title: string;
  isBoss: boolean;
  scale: number;
  x: number;
  y: number;
  z: number;
  spawnX: number;
  spawnZ: number;
  yaw: number;
  hp: number;
  maxHp: number;
  stun: number;
  maxStun: number;
  state: EnemyState;
  stateTimer: number;
  stateDuration: number;
  hitDealt: boolean;
  cooldown: number;
  attackIndex: number;
  respawnTimer: number;
  clip: GowClipName;
  clipSpeed: number;
  flashTimer: number;
}

export interface GowProjectile {
  active: boolean;
  fromPlayer: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  damage: number;
  stun: number;
}

export interface GowPopup {
  id: number;
  text: string;
  tone: 'gold' | 'stun' | 'parry' | 'crimson' | 'rage';
  x: number;
  y: number;
  z: number;
  age: number;
}

export function createInitialEnemies(): GowEnemy[] {
  return [
    {
      id: 'nephilim-west', name: 'Sariel Vanguard', title: 'Nephilim Oathguard', isBoss: false, scale: 1.22,
      x: -4.2, y: 20, z: 56.5, spawnX: -4.2, spawnZ: 56.5, yaw: 0,
      hp: 140, maxHp: 140, stun: 0, maxStun: 100, state: 'idle', stateTimer: 0, stateDuration: 1,
      hitDealt: false, cooldown: 1.1, attackIndex: 0, respawnTimer: 0, clip: 'Sword_Idle', clipSpeed: 1, flashTimer: 0,
    },
    {
      id: 'nephilim-east', name: 'Armaros Vanguard', title: 'Nephilim Oathguard', isBoss: false, scale: 1.22,
      x: 4.2, y: 20, z: 56.5, spawnX: 4.2, spawnZ: 56.5, yaw: 0,
      hp: 140, maxHp: 140, stun: 0, maxStun: 100, state: 'idle', stateTimer: 0, stateDuration: 1,
      hitDealt: false, cooldown: 1.8, attackIndex: 0, respawnTimer: 0, clip: 'Sword_Idle', clipSpeed: 1, flashTimer: 0,
    },
    {
      id: 'semjaza-boss', name: 'Semjaza', title: 'Chief of the Two Hundred Watchers · 1 Enoch 6', isBoss: true, scale: 2.15,
      x: 0, y: 20, z: 49.0, spawnX: 0, spawnZ: 49.0, yaw: 0,
      hp: 520, maxHp: 520, stun: 0, maxStun: 100, state: 'idle', stateTimer: 0, stateDuration: 1,
      hitDealt: false, cooldown: 1.4, attackIndex: 0, respawnTimer: 0, clip: 'Sword_Idle', clipSpeed: 1, flashTimer: 0,
    },
  ];
}

export const gowRuntime = {
  heroReady: false,
  hp: 100,
  maxHp: 100,
  rage: 40,
  maxRage: 100,
  rageActive: 0,
  action: 'idle' as GowAction,
  actionTimer: 0,
  actionDuration: 0,
  hitDone: false,
  queuedLight: false,
  comboStep: 0,
  comboResetTimer: 0,
  comboHits: 0,
  comboBannerTimer: 0,
  lastMoveLabel: '',
  parryWindow: 0,
  dodgeInvuln: 0,
  runicCooldown: 0,
  hitstopTimer: 0,
  realmShiftTimer: 0,
  shockwaveTimer: 0,
  shockwaveColor: '#ffd97d',
  shockwaveX: 0,
  shockwaveY: 20,
  shockwaveZ: 60,
  shockwaveMaxR: 5,
  executableId: null as EnemyId | null,
  threatPrompt: '' as '' | 'PARRY [Q / RIGHT-CLICK]' | 'EVADE [SHIFT / C]' | 'EXECUTE [E]',
  threatTone: 'gold' as 'gold' | 'crimson' | 'stun',
  enemies: createInitialEnemies(),
  projectiles: Array.from({ length: 6 }, (): GowProjectile => ({
    active: false, fromPlayer: true, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, damage: 0, stun: 0,
  })),
  popups: [] as GowPopup[],
  nextPopupId: 1,
  hudTick: 0,
};
