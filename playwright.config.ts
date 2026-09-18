import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', timeout: 60000, workers: 1,
  use: { baseURL: process.env.PLAYTEST_URL || 'http://127.0.0.1:3366', viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined,
      args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }, trace: 'retain-on-failure' },
  webServer: process.env.CI ? { command: 'pnpm exec next start --hostname 127.0.0.1 --port 3366', url: 'http://127.0.0.1:3366', reuseExistingServer: false } : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
});
