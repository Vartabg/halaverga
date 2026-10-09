// Thin route: connection() keeps it request-time (not prerendered at build); the store read is the one shared 120 s snapshot.
import { connection } from 'next/server';
import { cachedRead } from '@/server/vote/cachedResults';
import { depsFromEnv } from '@/server/vote/config';
import { notAllowed, optionsOf } from '@/server/vote/methods';
import { handleResults } from '@/server/vote/results';

const ALLOW = 'GET, HEAD, OPTIONS';
export async function GET() {
  await connection();
  return handleResults(depsFromEnv(), cachedRead);
}

export const OPTIONS = optionsOf(ALLOW);
export const POST = notAllowed(ALLOW), PUT = notAllowed(ALLOW), PATCH = notAllowed(ALLOW), DELETE = notAllowed(ALLOW);
