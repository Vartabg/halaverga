// Thin route: all logic and checks live in src/server/vote/handlers.ts. Only POST takes input; every other method is a 405, and
// OPTIONS says so (P5: Next would list every exported method).
import { depsFromEnv } from '@/server/vote/config';
import { handleVote, methodNotAllowed } from '@/server/vote/handlers';
import { optionsOf } from '@/server/vote/methods';

export function POST(request: Request) {
  return handleVote(request, depsFromEnv());
}

export const OPTIONS = optionsOf('POST, OPTIONS');
export const GET = methodNotAllowed, PUT = methodNotAllowed, PATCH = methodNotAllowed, DELETE = methodNotAllowed, HEAD = methodNotAllowed;
