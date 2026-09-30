// Thin route: all logic and checks live in src/server/vote/handlers.ts. Only POST takes input; every other method is a 405.
import { depsFromEnv } from '@/server/vote/config';
import { handleVote, methodNotAllowed } from '@/server/vote/handlers';

export function POST(request: Request) {
  return handleVote(request, depsFromEnv());
}

export const GET = methodNotAllowed, PUT = methodNotAllowed, PATCH = methodNotAllowed, DELETE = methodNotAllowed, HEAD = methodNotAllowed;
