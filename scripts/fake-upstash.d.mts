// Types for tests/fake-upstash.test.ts (the script itself is plain JavaScript, so tsc sees only this file).
export type Entry = { result: unknown } | { error: string };
export interface FakeStore { commands: number; run(cmd: (string | number)[]): unknown; multi(cmds: unknown[]): Entry[] }
export function createStore(clock?: () => number): FakeStore;
export function handle(store: FakeStore, token: string, method: string, path: string, headers: Record<string, string | undefined>, text: string): { status: number; body: unknown };
export const DEMO_TOUCH_CONTROLS: number;
export function seedDemo(store: FakeStore, ns: string, now?: number): void;
