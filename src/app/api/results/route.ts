// Thin route: connection() keeps it request-time (not prerendered at build); the store read is the one shared 120 s snapshot.
import { connection } from 'next/server';
import { cachedRead } from '@/server/vote/cachedResults';
import { depsFromEnv } from '@/server/vote/config';
import { handleResults } from '@/server/vote/results';

export async function GET() {
  await connection();
  return handleResults(depsFromEnv(), cachedRead);
}
