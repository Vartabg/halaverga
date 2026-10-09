// Thin route: all logic and checks live in src/server/vote/handlers.ts. POST handlers are never cached.
import { depsFromEnv, handleVote } from '@/server/vote/handlers';

export function POST(request: Request) {
  return handleVote(request, depsFromEnv());
}
