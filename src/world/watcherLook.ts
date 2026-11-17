import type { WatcherRole } from '@/game/dronePatrols';

// Shared body and wings, with different silhouettes and motion for each role.
export const WATCHER_LOOK = {
  scout: { wing: '#826f64', cloth: '#c5bdb0', armed: false, wingRate: 2.05 },
  dart: { wing: '#593d34', cloth: '#ffffff', armed: true, wingRate: 1.65 },
  lancer: { wing: '#433637', cloth: '#c5b4aa', armed: true, wingRate: 1.35 },
  cantor: { wing: '#624b59', cloth: '#e0bdce', armed: true, wingRate: 1.52 },
} as const satisfies Record<WatcherRole, { wing: string; cloth: string; armed: boolean; wingRate: number }>;
