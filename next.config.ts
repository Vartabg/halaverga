import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';
import { securityHeaders } from './src/config/securityHeaders';
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
  // No image optimizer: nothing here needs it and /_next/image would be an unauthenticated resize endpoint (W9).
  images: { unoptimized: true },
  async headers() { return securityHeaders; },
  env: { NEXT_PUBLIC_BUILD_STAMP: `${built} · ${sha}` },
};
export default config;
