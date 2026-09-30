// Thin route (CODE-6): a route handler, not a page, so each answer sets its own Cache-Control and status and Next answers 405 for the
// methods not served here. connection() keeps it request-time; the store read is the one shared 120 s snapshot (shared with /api/results).
import { connection } from 'next/server';
import { cachedRead } from '@/server/vote/cachedResults';
import { depsFromEnv } from '@/server/vote/config';
import { notAllowed, optionsOf } from '@/server/vote/methods';
import { respondResults } from './respond';

const ALLOW = 'GET, HEAD, OPTIONS';
export async function GET() {
  await connection();
  return respondResults(depsFromEnv(), cachedRead);
}

export const OPTIONS = optionsOf(ALLOW);
export const POST = notAllowed(ALLOW), PUT = notAllowed(ALLOW), PATCH = notAllowed(ALLOW), DELETE = notAllowed(ALLOW);
