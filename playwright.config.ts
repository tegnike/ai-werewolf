import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  webServer: { command: 'PORT=3101 DATABASE_PATH=./data/e2e.db node node_modules/next/dist/bin/next dev', port: 3101, reuseExistingServer: false, timeout: 120_000 },
  use: { baseURL: 'http://127.0.0.1:3101', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  ],
});
