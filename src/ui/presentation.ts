import type { UiEvent } from './types';

const isSpokenEvent = (event: UiEvent): boolean => ['discussion_speech', 'werewolf_chat'].includes(event.type);

export interface PresentedState { day: number; phase: string }

export function aiErrorDescription(error: { message: string; reason?: string } | null | undefined): string {
  if (!error) return 'AI判断に失敗しました。';
  if (error.reason === 'claim_contract:unspoken_target_behavior') {
    return 'AI応答の内容検証に失敗しました。未発言者に関する根拠の日付を確認できませんでした。';
  }
  if (error.reason === 'claim_contract:suspicion_evidence_day_missing' || error.reason === 'claim_contract:future_suspicion_evidence') {
    return 'AI応答の内容検証に失敗しました。疑いの根拠日が不正です。';
  }
  if (error.reason?.startsWith('claim_contract:')) {
    return 'AI応答の内容検証に失敗しました。発言と構造化情報が一致していません。';
  }
  if (error.reason?.startsWith('http_429')) return 'OpenAI APIの利用制限に達しました。時間を置いて再試行してください。';
  if (/^http_5\d\d/.test(error.reason ?? '')) return 'OpenAI APIで一時的な障害が発生しました。';
  if (error.reason === 'request_error') return 'AI応答の取得または解析に失敗しました。';
  return error.message;
}

export function privateActionDescription(event: UiEvent): string | null {
  if (event.type !== 'private_action') return null;
  return `${String(event.payload.label ?? '非公開処理')}が行われました。`;
}

export function featuredSpeechEvent(events: UiEvent[], speakingSeq: number | null): UiEvent | null {
  const speeches = events.filter((event) => ['discussion_speech', 'werewolf_chat'].includes(event.type));
  if (speakingSeq !== null) return speeches.find((event) => event.seq === speakingSeq) ?? speeches.at(-1) ?? null;
  return speeches.at(-1) ?? null;
}

export function focusPanelKind(featuredSpeech: UiEvent | null, hasCurrentDayVote: boolean, day: number, phase: string): 'speech' | 'vote' | null {
  const speechPhase = ['discussion', 'night_zero', 'wolf_chat'].includes(phase);
  if (featuredSpeech && featuredSpeech.day === day && (speechPhase || !hasCurrentDayVote)) return 'speech';
  if (hasCurrentDayVote) return 'vote';
  return null;
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

export function publicSecretsReady(events: UiEvent[], matchStatus: string | undefined, maxLoadedSeq: number): boolean {
  if (!['finished', 'aborted', 'aborted_budget'].includes(matchStatus ?? '')) return false;
  if (events.some((event) => event.type === 'match_finished')) return true;
  const maxPresentedSeq = Math.max(0, ...events.map((event) => event.seq));
  return maxLoadedSeq > 0 && maxPresentedSeq >= maxLoadedSeq;
}

export function presentationLimit(events: UiEvent[], currentSeq: number, voiceReady: boolean, voiceBusy: boolean, speakingSeq: number | null, paused = false): number {
  if (paused) return currentSeq;
  const maxSeq = Math.max(0, ...events.map((event) => event.seq));
  if (!voiceReady) return maxSeq;
  if (speakingSeq !== null) return Math.max(currentSeq, speakingSeq);
  const nextSpeech = events.find((event) => event.seq > currentSeq && isSpokenEvent(event));
  if (nextSpeech) return Math.max(currentSeq, nextSpeech.seq - 1);
  return voiceBusy ? currentSeq : maxSeq;
}
