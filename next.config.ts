import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';
// Build identity baked into every deployment: the commit being built (Vercel
// supplies VERCEL_GIT_COMMIT_SHA for deployments; local builds fall back to
// git) and the build date. Surfaced in the Field guide footer and the playtest
// JSON download via src/ui/buildInfo.ts.
const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'uncommitted'; }
})();
const built = new Date().toISOString().slice(0, 10);
const config: NextConfig = {
  poweredByHeader: false, devIndicators: false,
  env: { NEXT_PUBLIC_BUILD_STAMP: `${built} · ${sha}` },
};
export default config;
