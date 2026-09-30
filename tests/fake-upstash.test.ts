import { describe, expect, it } from 'vitest';
import { createUpstashStore, type Command, type FetchLike } from '@/server/vote/store';
import { createStore, handle } from '../scripts/fake-upstash.mjs';
import { FakeRedis } from './fixtures/fake-redis';
import { setup, voteBody, voteReq, json, VOTES } from './helpers/voteBody';
import { handleVote } from '@/server/vote/handlers';

// scripts/fake-upstash.mjs is the dev store behind the live check. Its engine is a second implementation of the subset of Redis the
// vote uses, so these tests run the SAME command script through it and through tests/fixtures/fake-redis.ts and compare every reply.
type Step = { tick: number } | Command[];
const c = (...x: (string | number)[]): Command => x;

function both(script: Step[]) {
  let t = 5_000_000;
  const a = new FakeRedis(() => t);
  const b = createStore(() => t);
  const out: { a: unknown; b: unknown }[] = [];
  for (const step of script) {
    if (!Array.isArray(step)) { t += step.tick; continue; }
    out.push({ a: a.execRaw(step), b: b.multi(step) });
  }
  return out;
}

const SCRIPT: Step[] = [
  [c('SET', 'a', 0, 'EX', 90000, 'NX'), c('SET', 'a', 5, 'NX'), c('GET', 'a'), c('GET', 'nope'), c('INCR', 'a'), c('INCR', 'fresh'), c('TTL', 'a'), c('TTL', 'fresh'), c('TTL', 'nope')],
  [c('SET', 'w', 'abc'), c('INCR', 'w'), c('SET', 'k', 1, 'EX', 5), c('SET', 'k', 2, 'EX', 0), c('SET', 'k', 2, 'EX', 'x'), c('SET', 'k', 2, 'XX'), c('SET', 'k', 2, 'EX'), c('SET', 'k', 2, 'ex', 9, 'nx')],
  [c('HSET', 'h', 'f', 'v', 'g', 'w'), c('HSET', 'h', 'f', 'z'), c('HSET', 'h', 'odd'), c('HSETNX', 'h', 'f', 'q'), c('HSETNX', 'h', 'n', 1), c('HMGET', 'h', 'f', 'g', 'n', 'none'), c('HLEN', 'h'), c('HGETALL', 'h'), c('HGETALL', 'gone'), c('HMGET', 'gone', 'x', 'y'), c('HLEN', 'gone')],
  [c('HDEL', 'h', 'f', 'g', 'nope'), c('HDEL', 'h', 'n'), c('HLEN', 'h'), c('HDEL', 'h', 'n'), c('SET', 'h', 'now a string'), c('GET', 'h')],
  [c('SADD', 's', 'x', 'y', 'x'), c('SADD', 's', 'z'), c('SMEMBERS', 's'), c('SREM', 's', 'x', 'q'), c('SMEMBERS', 's'), c('SREM', 's', 'y', 'z'), c('SMEMBERS', 's'), c('SREM', 's', 'y')],
  [c('GET', 's'), c('HLEN', 'w'), c('SADD', 'a', 'x'), c('HGETALL', 'a'), c('SMEMBERS', 'w'), c('HSET', 'a', 'f', 'v'), c('SET', 'a', 'over the top'), c('HMGET', 'w', 'f')],
  [c('EXPIRE', 'w', 30), c('TTL', 'w'), c('EXPIRE', 'none', 30), c('EXPIRE', 'w', 'x'), c('SET', 'w', 'plain'), c('TTL', 'w'), c('EXPIRE', 'w', 10), c('INCR', 'ctr'), c('EXPIRE', 'ctr', 4)],
  { tick: 3_999 }, [c('TTL', 'ctr'), c('INCR', 'ctr'), c('TTL', 'k'), c('GET', 'k')],
  { tick: 1 }, [c('TTL', 'ctr'), c('GET', 'ctr'), c('SET', 'ctr', 'again', 'EX', 5, 'NX'), c('TTL', 'k'), c('GET', 'k'), c('SET', 'k', 'v', 'NX'), c('GET', 'w')],
  { tick: 6_000 }, [c('TTL', 'k'), c('GET', 'k'), c('TTL', 'ctr'), c('GET', 'a')],
  [c('set', 'lower', 'v'), c('Get', 'lower'), c('SET', 'num', 12), c('GET', 'num'), c('INCR', 'num'), c('SET', 'neg', -3), c('INCR', 'neg'), c('SET', 'big', '9007199254740993'), c('INCR', 'big')],
  [c('DEL', 'lower', 'num', 'nope'), c('DEL', 'h', 'h'), c('DEL'), c('GET'), c('SET', 'onlykey'), c('HMGET', 'h'), c('SADD', 's'), c('EXPIRE', 'a'), c('FLUSHALL', 'x')],
  [c('DEL', 'a'), c('FLUSHALL'), c('GET', 'a'), c('SMEMBERS', 's'), c('HGETALL', 'h'), c('TTL', 'k'), c('FLUSHALL')],
  [c('BOGUS', 'a'), c('', 'a'), c('flushdb')],
];

describe('fake-upstash engine matches the tested fixture on one command script', () => {
  it('every reply entry is identical, and the script really exercises errors', () => {
    const out = both(SCRIPT);
    for (const [i, r] of out.entries()) expect(r.b, `batch ${i}`).toEqual(r.a);
    const errors = new Set(out.flatMap((r) => (r.b as { error?: string }[]).map((x) => x.error).filter(Boolean)));
    expect(errors.size).toBeGreaterThanOrEqual(7);
    for (const m of ['WRONGTYPE', 'not an integer', 'syntax error', 'invalid expire time', 'wrong number of arguments', 'unknown command']) {
      expect([...errors].some((e) => String(e).includes(m)), m).toBe(true);
    }
  });

  it('a seeded random script of 12,000 commands over a tiny keyspace, with clock jumps, replies identically', () => {
    for (const seed of [1, 7, 4242]) {
      let x = seed;
      const rnd = (n: number) => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x % n; };
      const pick = <T,>(xs: T[]) => xs[rnd(xs.length)];
      const keys = ['a', 'b', 'h', 'i', 's', 't'], vals = ['0', '1', 'abc', '-5', '007', '12', ''];
      const gens: (() => Command)[] = [
        () => c('SET', pick(keys), pick(vals), ...pick([[], ['EX', 1 + rnd(6)], ['NX'], ['EX', 3, 'NX'], ['XX'], ['EX', 0], ['EX', 'z']])),
        () => c('GET', pick(keys)), () => c('INCR', pick(keys)), () => c('HMGET', pick(keys), pick(vals), pick(vals)), () => c('HLEN', pick(keys)),
        () => c('HSETNX', pick(keys), pick(vals), pick(vals)), () => c('HSET', pick(keys), pick(vals), pick(vals), ...(rnd(4) ? [] : [pick(vals)])),
        () => c('HDEL', pick(keys), pick(vals)), () => c('HGETALL', pick(keys)), () => c('SADD', pick(keys), pick(vals), pick(vals)),
        () => c('SREM', pick(keys), pick(vals)), () => c('SMEMBERS', pick(keys)), () => c('DEL', pick(keys), pick(keys)), () => c('TTL', pick(keys)),
        () => c('EXPIRE', pick(keys), pick(['1', '4', 'x', '-1'])), () => c('GET'), () => c('FLUSHALL'),
      ];
      const script: Step[] = [];
      for (let i = 0; i < 4000; i++) {
        if (!rnd(5)) script.push({ tick: rnd(3000) });
        script.push(Array.from({ length: 1 + rnd(5) }, () => (rnd(60) ? pick(gens.slice(0, -1))() : gens[gens.length - 1]())));
      }
      const out = both(script);
      out.forEach((r, i) => expect(r.b, `seed ${seed} batch ${i}`).toEqual(r.a));
      const flat = out.flatMap((r) => r.b as { result?: unknown; error?: string }[]);
      expect(flat.filter((r) => r.error).length).toBeGreaterThan(500);
      expect(flat.filter((r) => Array.isArray(r.result) && r.result.length > 1).length).toBeGreaterThan(50);
      expect(flat.filter((r) => r.result === null).length).toBeGreaterThan(200);
    }
  });

  it('the commands the fixture keeps only for the retired handler are unknown here', () => {
    const b = createStore();
    for (const name of ['HINCRBY', 'LPUSH', 'LTRIM', 'LLEN', 'EVAL']) expect(b.multi([c(name, 'k', '1', '2')])[0]).toEqual({ error: `ERR unknown command '${name.toLowerCase()}'` });
    expect(b.multi([[], 'x', [{}], [null]])).toEqual(Array(4).fill({ error: 'ERR invalid command' }));
  });
});

describe('fake-upstash HTTP surface', () => {
  const auth = { authorization: 'Bearer dev-token' };
  it('/multi-exec needs the bearer token, is atomic and in order, counts commands; POST / and /stats do not', () => {
    const s = createStore();
    const post = (path: string, text: string, headers: Record<string, string | undefined> = auth) => handle(s, 'dev-token', 'POST', path, headers, text);
    expect(post('/multi-exec', '[["SET","k","0"]]', {}).status).toBe(401);
    expect(post('/multi-exec', '[["SET","k","0"]]', { authorization: 'Bearer nope' }).status).toBe(401);
    expect(post('/', '["GET","k"]', { authorization: 'dev-token' }).status).toBe(401);
    expect(handle(s, 'dev-token', 'GET', '/stats', {}, '').body).toEqual({ commands: 0 });
    expect(post('/multi-exec', '[["SET","k","0"],["INCR","k"],["INCR","k"],["GET","k"],["HGETALL","k"]]')).toEqual({
      status: 200, body: [{ result: 'OK' }, { result: 1 }, { result: 2 }, { result: '2' }, { error: 'WRONGTYPE Operation against a key holding the wrong kind of value' }],
    });
    expect(handle(s, 'dev-token', 'GET', '/stats', {}, '').body).toEqual({ commands: 5 });
    expect(post('/', '["HSET","ctl","unit",9]')).toEqual({ status: 200, body: { result: 1 } });
    expect(post('/', '["BOGUS"]').status).toBe(400);
    expect(handle(s, 'dev-token', 'GET', '/stats', {}, '').body).toEqual({ commands: 5 });
    for (const bad of ['', 'not json', '{"a":1}', '"x"', '7']) expect(post('/multi-exec', bad).status, bad).toBe(400);
    expect(post('/pipeline', '[]').status).toBe(404);
    expect(handle(s, 'dev-token', 'GET', '/multi-exec', auth, '').status).toBe(404);
    expect(handle(s, 'dev-token', 'DELETE', '/', auth, '["FLUSHALL"]').status).toBe(404);
    expect(handle(s, 'dev-token', 'GET', '/stats', {}, '').body).toEqual({ commands: 5 });
  });

  // createUpstashStore is the real client; this adapter is the HTTP hop, so the wire shapes are the ones the app depends on.
  const wire = (s: ReturnType<typeof createStore>): FetchLike => async (input, init) => {
    const h = init.headers as Record<string, string>;
    const r = handle(s, 'dev-token', String(init.method), new URL(input).pathname, { authorization: h.Authorization }, String(init.body));
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
  it('createUpstashStore talks to it: counter replies, a batch error throws the scrubbed message, a wrong token is a status error', async () => {
    const s = createStore();
    const store = createUpstashStore('http://fake.test/', 'dev-token', wire(s));
    expect(await store.exec([c('SET', 'u', 0, 'EX', 90000, 'NX'), c('INCR', 'u'), c('HMGET', 'ctl', 'mode', 'unit')])).toEqual(['OK', 1, [null, null]]);
    await expect(store.exec([c('SADD', 'u', 'x')])).rejects.toThrow('vote store command failed');
    await expect(createUpstashStore('http://fake.test', 'wrong', wire(s)).exec([c('GET', 'u')])).rejects.toThrow('vote store http 401');
    expect(s.commands).toBe(4);
  });

  it('the vote handler over the fake store answers and costs exactly what it does over the fixture (unit limit, spec 4.2)', async () => {
    const run = async (kind: 'fixture' | 'engine') => {
      const s = setup();
      const engine = createStore(() => s.at());
      if (kind === 'engine') s.deps.store = createUpstashStore('http://fake.test', 'dev-token', wire(engine));
      const cost = () => (kind === 'engine' ? engine.commands : s.redis.commands);
      const shape: string[] = [];
      for (let i = 0; i < 18; i++) {
        const before = cost();
        const res = await handleVote(voteReq(voteBody(), { ip: '203.0.113.9' }), s.deps);
        shape.push(`${res.status}@${cost() - before}`);
      }
      const hlen = kind === 'engine' ? engine.run(c('HLEN', VOTES)) : Object.keys(s.redis.hash(VOTES)).length;
      return { shape, hlen, s };
    };
    const [a, b] = [await run('fixture'), await run('engine')];
    expect(b.shape).toEqual([...Array(8).fill('200@12'), ...Array(8).fill('429@5'), '429@0', '429@0']);
    expect(b.shape).toEqual(a.shape);
    expect([a.hlen, b.hlen]).toEqual([8, 8]);
    expect(await json(await handleVote(voteReq(voteBody(), { ip: '198.51.100.4' }), b.s.deps))).toMatchObject({ status: 200 });
  });
});
