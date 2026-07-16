export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getRunnerManager } = await import('@/server/runner');
    getRunnerManager().recover();
  }
}
