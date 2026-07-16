import type { UiEvent } from './types';

const isSpokenEvent = (event: UiEvent): boolean => ['discussion_speech', 'werewolf_chat'].includes(event.type);

export function presentationLimit(events: UiEvent[], currentSeq: number, voiceReady: boolean, voiceBusy: boolean): number {
  const maxSeq = Math.max(0, ...events.map((event) => event.seq));
  if (!voiceReady) return maxSeq;
  const nextSpeech = events.find((event) => event.seq > currentSeq && isSpokenEvent(event));
  if (nextSpeech) return Math.max(currentSeq, nextSpeech.seq - 1);
  return voiceBusy ? currentSeq : maxSeq;
}
