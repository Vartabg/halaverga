// Thin route: connection() keeps it request-time (not prerendered at build); the store read itself is cached for 30 s.
import { connection } from 'next/server';
import { cachedRead } from '@/server/vote/cachedResults';
import { depsFromEnv } from '@/server/vote/handlers';
import { handleResults } from '@/server/vote/results';

export async function GET() {
  await connection();
  return handleResults(depsFromEnv(), cachedRead);
}
