// Types for tests/vote-audit.test.ts (the script itself is plain JavaScript, so tsc sees only this file).
export interface DecodedSample { hour: string; device: 'touch' | 'desktop'; favorite: string | null; tried: string[]; last: string; tag: string }
export interface AuditInput { pairs: [string, string][]; voids: string[]; ctl: Record<string, string>; rlg: Record<string, number | null>; hlen: number; ns: string; now: number; hours: number }
export interface AuditReport { lines: string[]; flags: string[]; voidLines: string[] }
type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;
export function decode(s: unknown): DecodedSample | null;
export function analyze(input: AuditInput): AuditReport;
export function collect(url: string, token: string, ns: string, days: string[], fetchImpl?: FetchLike): Promise<Omit<AuditInput, 'ns' | 'now' | 'hours'>>;
export function main(argv: string[], env: Record<string, string | undefined>, fetchImpl?: FetchLike): Promise<number>;
