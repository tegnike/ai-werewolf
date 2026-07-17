import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = Number(process.env.E2E_PORT ?? 3101);
const databasePath = process.env.E2E_DATABASE_PATH ?? join(tmpdir(), `ai-werewolf-e2e-${process.pid}.db`);

export default defineConfig({
  testDir: './test/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  webServer: { command: `PORT=${port} DATABASE_PATH="${databasePath}" AI_PROVIDER=mock ALLOW_REAL_AI=0 node node_modules/next/dist/bin/next dev`, port, reuseExistingServer: false, timeout: 120_000 },
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  ],
});
