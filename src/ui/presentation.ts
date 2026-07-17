import type { UiEvent } from './types';

const isSpokenEvent = (event: UiEvent): boolean => ['discussion_speech', 'werewolf_chat'].includes(event.type);

export interface PresentedState { day: number; phase: string }

export function privateActionDescription(event: UiEvent): string | null {
  if (event.type !== 'private_action') return null;
  return `${String(event.payload.label ?? '非公開処理')}が行われました。`;
}

export function derivePresentedState(events: UiEvent[], matchStatus?: string): PresentedState {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const last = ordered.at(-1);
  const terminal = ['finished', 'aborted', 'aborted_budget'].includes(matchStatus ?? '');
  if (!last) {
    return ['running', 'paused', 'paused_error'].includes(matchStatus ?? '')
      ? { day: 0, phase: 'night_zero' }
      : { day: 0, phase: 'setup' };
  }
  if (last.type === 'match_finished') return { day: last.day, phase: 'finished' };
  if (last.type === 'execution' && !terminal) return { day: last.day, phase: 'night_actions' };
  if (last.type === 'discussion_closed' && !terminal) return { day: last.day, phase: 'vote' };
  if (last.type === 'discussion_speech' && !terminal) {
    const dead = new Set<string>();
    for (const event of ordered) {
      if (event.type === 'execution' && event.payload.seat) dead.add(String(event.payload.seat));
      if (event.type === 'dawn' && event.payload.victim) dead.add(String(event.payload.victim));
    }
    const speechCount = ordered.filter((event) => event.day === last.day && event.type === 'discussion_speech').length;
    if (speechCount >= (9 - dead.size) * 2) return { day: last.day, phase: 'vote' };
  }
  return { day: last.day, phase: last.phase };
}

export function presentationCursorAfterLoad(currentSeq: number, maxLoadedSeq: number, initialized: boolean): number {
  return initialized ? currentSeq : maxLoadedSeq;
}

export function presentationLimit(events: UiEvent[], currentSeq: number, voiceReady: boolean, voiceBusy: boolean, speakingSeq: number | null): number {
  const maxSeq = Math.max(0, ...events.map((event) => event.seq));
  if (!voiceReady) return maxSeq;
  if (speakingSeq !== null) return Math.max(currentSeq, speakingSeq);
  const nextSpeech = events.find((event) => event.seq > currentSeq && isSpokenEvent(event));
  if (nextSpeech) return Math.max(currentSeq, nextSpeech.seq - 1);
  return voiceBusy ? currentSeq : maxSeq;
}
