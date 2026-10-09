import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// scripts/hand-deploy.sh is the deploy recipe of docs/deploy.md. The point of these tests is the HARD security gate: a gitleaks finding
// (in the history or in the folder that would go up), a missing gitleaks and a missing project link must each end the script before
// `vercel deploy` runs. Both tools are stubs on PATH that log their arguments, so nothing is scanned or deployed here.
const SCRIPT = resolve(__dirname, '../scripts/hand-deploy.sh');
const STUB_GITLEAKS = `#!/bin/sh
echo "gitleaks $*" >> "$STUB_LOG"
case "$1" in
  git) [ "\${FAKE_GIT_EXIT:-0}" = 0 ] || { echo "leaks found: 1" >&2; exit "$FAKE_GIT_EXIT"; } ;;
  dir) [ "\${FAKE_DIR_EXIT:-0}" = 0 ] || { echo "leaks found: 1" >&2; exit "$FAKE_DIR_EXIT"; } ;;
esac
`;
const STUB_VERCEL = `#!/bin/sh
echo "vercel $*" >> "$STUB_LOG"
echo "cwd $(pwd)" >> "$STUB_LOG"
echo "files $(ls -A | tr '\\n' ' ' | sed 's/ $//')" >> "$STUB_LOG"
echo "link $(cat .vercel/project.json)" >> "$STUB_LOG"
`;

let work: string, repo: string, stubs: string, log: string, link: string, sha: string;
const git = (...a: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: repo, encoding: 'utf8' });
const stub = (dir: string, name: string, body: string) => { const f = join(dir, name); writeFileSync(f, body); chmodSync(f, 0o755); };
/** The log with the scratch folder name made stable. */
const lines = () => (existsSync(log) ? readFileSync(log, 'utf8') : '').split('\n').filter(Boolean);
function run(args: string[], env: Record<string, string> = {}, path = `${stubs}:/usr/bin:/bin`) {
  return spawnSync('/bin/bash', [SCRIPT, ...args], { cwd: repo, encoding: 'utf8',
    env: { NODE_ENV: 'test', PATH: path, HOME: work, TMPDIR: join(work, 'tmp'), STUB_LOG: log, HALAVERGA_VERCEL_LINK: link, ...env } });
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'hand-deploy-test-'));
  repo = join(work, 'repo'); stubs = join(work, 'stubs'); log = join(work, 'log.txt'); link = join(work, 'project.json');
  mkdirSync(repo); mkdirSync(stubs); mkdirSync(join(work, 'tmp'));
  writeFileSync(link, '{"projectId":"prj_test","orgId":"team_test"}');
  stub(stubs, 'gitleaks', STUB_GITLEAKS); stub(stubs, 'vercel', STUB_VERCEL);
  git('init', '-q'); writeFileSync(join(repo, 'app.txt'), 'committed\n'); git('add', 'app.txt'); git('commit', '-q', '-m', 'one');
  sha = git('rev-parse', 'HEAD').stdout.trim();
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

describe('hand-deploy.sh runs the gate, then deploys the committed files', () => {
  it('a preview scans the history and the scratch folder, then deploys with the stamp and no --prod', () => {
    const r = run(['preview']);
    expect(r.status, r.stderr).toBe(0);
    const l = lines();
    expect(l[0]).toMatch(/^gitleaks git .* --no-banner --redact --exit-code 1$/);
    expect(l[1]).toMatch(/^gitleaks dir .*halaverga-deploy\.[A-Za-z0-9]+ --no-banner --redact --exit-code 1$/);
    expect(l[2]).toBe(`vercel deploy --yes --build-env VERCEL_GIT_COMMIT_SHA=${sha}`);
    expect(l.join('\n')).not.toContain('--prod');
    expect(l[3]).toMatch(/halaverga-deploy\./); // deployed from the scratch folder, not from the repo
    expect(l[3]).not.toContain(repo);
    expect(l[4]).toBe('files .vercel app.txt'); // the committed file and the link, no .git
    expect(l[5]).toBe('link {"projectId":"prj_test","orgId":"team_test"}');
  });
  it('prod adds --prod and passes any extra flag through (the staged --skip-domain variant)', () => {
    const r = run(['prod', '--skip-domain']);
    expect(r.status, r.stderr).toBe(0);
    expect(lines().find(x => x.startsWith('vercel '))).toBe(`vercel deploy --yes --build-env VERCEL_GIT_COMMIT_SHA=${sha} --prod --skip-domain`);
  });
  it('HALAVERGA_DEPLOY_REF deploys another commit, stamped with its own SHA, through the same gate; an unknown ref stops', () => {
    writeFileSync(join(repo, 'app.txt'), 'two\n'); git('add', 'app.txt'); git('commit', '-q', '-m', 'two');
    const r = run(['prod'], { HALAVERGA_DEPLOY_REF: sha });
    expect(r.status, r.stderr).toBe(0);
    expect(lines().find(x => x.startsWith('vercel '))).toBe(`vercel deploy --yes --build-env VERCEL_GIT_COMMIT_SHA=${sha} --prod`);
    expect(lines().some(x => x.startsWith('gitleaks dir'))).toBe(true);
    rmSync(log, { force: true });
    expect(run(['prod'], { HALAVERGA_DEPLOY_REF: 'no-such-ref' }).status).not.toBe(0);
    expect(existsSync(log)).toBe(false);
  });
  it('ships only what is committed: an untracked .env and an uncommitted edit stay behind', () => {
    writeFileSync(join(repo, '.env.local'), 'SECRET=nope\n'); writeFileSync(join(repo, 'app.txt'), 'edited\n');
    const r = run(['preview']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain('uncommitted changes are not deployed');
    expect(lines().find(x => x.startsWith('files '))).toBe('files .vercel app.txt');
  });
});

describe('hand-deploy.sh stops before vercel deploy runs', () => {
  const deployed = () => lines().some(x => x.startsWith('vercel '));
  it('on a finding in the folder that would go up, in preview and in prod', () => {
    for (const mode of ['preview', 'prod']) {
      rmSync(log, { force: true });
      const r = run([mode], { FAKE_DIR_EXIT: '1' });
      expect(r.status, mode).not.toBe(0);
      expect(r.stderr).toContain('leaks found');
      expect(deployed(), mode).toBe(false);
    }
  });
  it('on a finding in the history, before the folder is even scanned', () => {
    const r = run(['prod'], { FAKE_GIT_EXIT: '1' });
    expect(r.status).not.toBe(0);
    expect(deployed()).toBe(false);
    expect(lines().some(x => x.startsWith('gitleaks dir'))).toBe(false);
  });
  it('whatever exit code gitleaks fails with', () => {
    for (const code of ['2', '126', '255']) { rmSync(log, { force: true }); expect(run(['prod'], { FAKE_DIR_EXIT: code }).status).not.toBe(0); expect(deployed()).toBe(false); }
  });
  it('when gitleaks is not installed', () => {
    rmSync(join(stubs, 'gitleaks'));
    const r = run(['prod']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('gitleaks is not installed');
    expect(deployed()).toBe(false);
  });
  it('when the project link is missing', () => {
    const r = run(['preview'], { HALAVERGA_VERCEL_LINK: join(work, 'nope.json') });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no Vercel project link');
    expect(existsSync(log)).toBe(false); // not even a scan: nothing was archived
  });
  it('without a mode, or with a mode that is not preview or prod', () => {
    for (const args of [[], ['production'], ['--prod'], ['']]) { const r = run(args); expect(r.status, args.join(' ')).toBe(2); expect(r.stderr).toContain('usage:'); }
    expect(existsSync(log)).toBe(false);
  });
});

describe('the script and its docs', () => {
  const text = readFileSync(SCRIPT, 'utf8'), deployMd = readFileSync(resolve(__dirname, '../docs/deploy.md'), 'utf8');
  it('is strict, has no skip flag, and the scan comes before the only deploy call', () => {
    expect(text).toContain('set -euo pipefail');
    expect(text).not.toMatch(/--no-verify|SKIP|\|\| true|\|\| :/);
    expect(text.match(/vercel "\$\{args\[@\]\}"/g)).toHaveLength(1);
    expect(text.indexOf('gitleaks dir')).toBeLessThan(text.indexOf('exec vercel'));
    expect(text.split('\n').length).toBeLessThan(200);
  });
  it('deploy.md runs deploys through it, and no deploy command in the doc sits outside it', () => {
    expect(deployMd).toContain('scripts/hand-deploy.sh preview');
    expect(deployMd).toContain('scripts/hand-deploy.sh prod');
    expect(deployMd).not.toMatch(/^\s*(cd "\$D" && )?vercel deploy/m); // a pasted block would run the deploy after a failed scan
    expect(deployMd).not.toContain('step 2 below');
  });
});
