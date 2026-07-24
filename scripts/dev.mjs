import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const projectRoot = process.cwd();
const explicitlyMock = process.env.AI_PROVIDER === 'mock' || process.env.ALLOW_REAL_AI === '0';

function configuredPort(args) {
  const inlinePort = args.find((argument) => argument.startsWith('--port='));
  if (inlinePort) return inlinePort.slice('--port='.length);
  const portIndex = args.findIndex((argument) => argument === '--port' || argument === '-p');
  if (portIndex >= 0 && args[portIndex + 1]) return args[portIndex + 1];
  return process.env.PORT || '3000';
}

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
const nextArguments = process.argv.slice(2);
const port = configuredPort(nextArguments);
const safePort = port.replace(/[^a-zA-Z0-9_-]/g, '-');
const nextDistDir = process.env.NEXT_DIST_DIR || `.next-dev-${safePort}`;
const ownsTsconfig = !process.env.NEXT_TSCONFIG_PATH;
const nextTsconfigPath = process.env.NEXT_TSCONFIG_PATH || `.tsconfig.next-dev-${safePort}.json`;
const nextEnvPath = join(projectRoot, 'next-env.d.ts');
const originalNextEnv = existsSync(nextEnvPath) ? readFileSync(nextEnvPath, 'utf8') : null;

function restoreNextEnv() {
  if (originalNextEnv === null) return;
  try {
    if (readFileSync(nextEnvPath, 'utf8') === originalNextEnv) return;
  } catch {}
  writeFileSync(nextEnvPath, originalNextEnv);
}

if (provider === 'real' && (process.env.ALLOW_REAL_AI !== '1' || !hasAnyApiKey)) {
  console.error('[dev] Real AI configuration is incomplete: ALLOW_REAL_AI=1 and at least one of OPENAI_API_KEY / GEMINI_API_KEY are required.');
  process.exit(1);
}

console.log(`[dev] AI provider: ${provider}${provider === 'real' ? ' / per-character LLM' : ''} (${environmentSource})`);
console.log(`[dev] Next.js distDir: ${nextDistDir}`);

if (ownsTsconfig) {
  writeFileSync(
    nextTsconfigPath,
    `${JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          plugins: [{ name: 'next' }],
        },
        include: [
          'next-env.d.ts',
          '**/*.ts',
          '**/*.tsx',
          `${nextDistDir}/types/**/*.ts`,
        ],
        exclude: ['node_modules'],
      },
      null,
      2,
    )}\n`,
  );
}

const nextBin = resolve(projectRoot, 'node_modules/next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, 'dev', ...nextArguments], {
  cwd: projectRoot,
  env: { ...process.env, NEXT_DIST_DIR: nextDistDir, NEXT_TSCONFIG_PATH: nextTsconfigPath },
  stdio: 'inherit',
});
const nextEnvGuard = setInterval(restoreNextEnv, 1_000);
nextEnvGuard.unref();
process.on('SIGINT', restoreNextEnv);
process.on('SIGTERM', restoreNextEnv);

child.on('error', (error) => {
  console.error(`[dev] Failed to start Next.js: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  clearInterval(nextEnvGuard);
  restoreNextEnv();
  if (ownsTsconfig) {
    try {
      unlinkSync(nextTsconfigPath);
    } catch {}
  }
  process.exitCode = code ?? (signal ? 1 : 0);
});
