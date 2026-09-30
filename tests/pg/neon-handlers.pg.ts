import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handlerScenarios, pgBackend } from '../helpers/handlerScenarios';
import { hasPg, startPg, type Pg } from '../helpers/pgHttp';

// The handler scenarios of tests/vote-neon-handlers.test.ts, over a real PostgreSQL: same assertions as over FakeRedis.
describe.skipIf(!hasPg)('the vote handler over a real PostgreSQL', () => {
  let pg: Pg;
  beforeAll(async () => { pg = await startPg(); });
  afterAll(async () => { await pg?.stop(); });
  handlerScenarios(() => pgBackend(pg)());
  it('every request the adapter made was on contract', () => { expect(pg.violations).toEqual([]); });
});
