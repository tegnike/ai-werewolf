import { syncAgentNameDictionary } from '../src/server/voicevox-user-dictionary';

async function main() {
  try {
    const result = await syncAgentNameDictionary();
    console.log(`VOICEVOX dictionary synced: added=${result.added.length}, updated=${result.updated.length}, unchanged=${result.unchanged.length}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`VOICEVOX dictionary sync failed: ${message}`);
    process.exitCode = 1;
  }
}

void main();
