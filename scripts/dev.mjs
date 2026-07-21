import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const projectRoot = process.cwd();
const explicitlyMock = process.env.AI_PROVIDER === 'mock' || process.env.ALLOW_REAL_AI === '0';

function mainWorktreeRoot() {
  try {
    const commonGitDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return dirname(commonGitDir);
  } catch {
    return projectRoot;
  }
}

function loadRuntimeEnvironment() {
  if (explicitlyMock) return 'explicit MockAI environment';
  const localEnv = join(projectRoot, '.env.local');
  const sharedEnv = join(mainWorktreeRoot(), '.env.local');
  const source = existsSync(localEnv) ? localEnv : existsSync(sharedEnv) ? sharedEnv : null;
  if (!source) return 'no .env.local found';
  process.loadEnvFile(source);
  return source === localEnv ? 'local .env.local' : 'main-worktree .env.local';
}

const environmentSource = loadRuntimeEnvironment();
const provider = process.env.AI_PROVIDER === 'real' ? 'real' : 'mock';
const hasAnyApiKey = Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);

if (provider === 'real' && (process.env.ALLOW_REAL_AI !== '1' || !hasAnyApiKey)) {
  console.error('[dev] Real AI configuration is incomplete: ALLOW_REAL_AI=1 and at least one of OPENAI_API_KEY / GEMINI_API_KEY are required.');
  process.exit(1);
}

console.log(`[dev] AI provider: ${provider}${provider === 'real' ? ' / per-character LLM' : ''} (${environmentSource})`);

const nextBin = resolve(projectRoot, 'node_modules/next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, 'dev', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`[dev] Failed to start Next.js: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
