import { EventEmitter } from 'node:events';
import type { MatchEvent } from '@/domain/types';

const globalBus = globalThis as typeof globalThis & { __werewolfBus?: EventEmitter };
const emitter = globalBus.__werewolfBus ?? new EventEmitter();
emitter.setMaxListeners(100);
globalBus.__werewolfBus = emitter;

export function publishEvent(event: MatchEvent): void { emitter.emit(event.matchId, event); }
export function subscribe(matchId: string, listener: (event: MatchEvent) => void): () => void {
  emitter.on(matchId, listener);
  return () => emitter.off(matchId, listener);
}
