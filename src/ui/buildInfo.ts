// Build identity surfaced to players and playtest reports. Keep DEPLOYMENT_URL
// aligned with public/qr-deployment.svg (regenerated via pnpm make:qr).
export const BUILD_STAMP = process.env.NEXT_PUBLIC_BUILD_STAMP || 'local development build';
export const DEPLOYMENT_URL = 'https://halaverga-flight.vercel.app';