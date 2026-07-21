import type { MatchEvent, MatchRecord, MatchStatus, ViewMode } from '@/domain/types';
import { cloneDefaultCharacterRoster, publicCharacterRoster } from '@/domain/characters';

export interface PublicEvent {
  matchId: string; seq: number; day: number; phase: string; type: string; payload: Record<string, unknown>; createdAt: string;
}

const privateEventLabels: Record<string, string> = {
  match_created: '配役決定',
  werewolf_reveal: '人狼確認',
  werewolf_chat: '人狼の夜会話',
  vote_cast: '投票',
  medium_result: '霊媒結果の確認',
  attack_choice: '襲撃先の検討',
  seer_result: '占い結果の確認',
  guard_choice: '護衛先の選択',
  night_resolved: '夜の処理',
  decision_note: '襲撃先の決定',
};

function redactedPrivateEvent(event: MatchEvent): PublicEvent {
  return {
    matchId: event.matchId,
    seq: event.seq,
    day: event.day,
    phase: event.phase,
    type: 'private_action',
    payload: { label: privateEventLabels[event.type] ?? '非公開処理' },
    createdAt: event.createdAt,
  };
}

function publicPayload(event: MatchEvent): Record<string, unknown> {
  const payload = event.payload;
  const fields: Record<string, string[]> = {
    dawn: ['victim', 'message'],
    discussion_closed: ['openingSpeeches', 'freeSpeeches', 'totalSpeeches', 'minimumSpeeches', 'maximumSpeeches', 'intentPolls'],
    execution: ['seat', 'message'],
    anomaly_flag: ['winner', 'roles', 'anomaly'],
    match_finished: ['winner', 'roles', 'anomaly'],
  };

  if (event.type === 'discussion_speech') {
    const common = Object.fromEntries(
      ['seat', 'name', 'round', 'stage', 'turn', 'speech', 'addressedTo', 'requestsReply']
        .flatMap((key) => key in payload ? [[key, payload[key]]] : []),
    );
    if (!('claim' in payload) || payload.claim === null) return { ...common, ...('claim' in payload ? { claim: null } : {}) };
    if (typeof payload.claim !== 'object') return common;
    const claim = payload.claim as Record<string, unknown>;
    const results = Array.isArray(claim.results) ? claim.results.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const result = value as Record<string, unknown>;
      return typeof result.day === 'number' && typeof result.targetSeat === 'string' &&
        (result.verdict === '人狼' || result.verdict === '人狼ではない')
        ? [{ day: result.day, targetSeat: result.targetSeat, verdict: result.verdict }]
        : [];
    }) : [];
    return claim.claimedRole === 'seer' || claim.claimedRole === 'medium'
      ? { ...common, claim: { claimedRole: claim.claimedRole, results } }
      : common;
  }

  if (event.type === 'vote_reveal') {
    const votes = Array.isArray(payload.votes)
      ? payload.votes.flatMap((vote) => {
        if (!vote || typeof vote !== 'object') return [];
        const item = vote as Record<string, unknown>;
        return typeof item.voter === 'string' && typeof item.target === 'string'
          ? [{ voter: item.voter, target: item.target }]
          : [];
      })
      : [];
    return { round: payload.round, votes, tally: payload.tally };
  }

  return Object.fromEntries((fields[event.type] ?? []).flatMap((key) => key in payload ? [[key, payload[key]]] : []));
}

export function projectEvents(events: MatchEvent[], view: ViewMode, revealSecrets = false): Array<MatchEvent | PublicEvent> {
  // 修正前に保存された試合にも第0夜明けのdawnイベントが残っているため、
  // 新規生成の防止だけでなくAPI射影でも1日目の夜明けを除外する。
  const presentable = events.filter((event) => !(event.day === 1 && event.type === 'dawn'));
  if (view === 'gm' || revealSecrets) return presentable;
  return presentable.map((event) => event.visibility === 'private' ? redactedPrivateEvent(event) : ({
    matchId: event.matchId, seq: event.seq, day: event.day, phase: event.phase,
    type: event.type, payload: publicPayload(event), createdAt: event.createdAt,
  }));
}

export function canRevealSecrets(view: ViewMode, status: MatchStatus, requested: boolean): boolean {
  return view === 'gm' || (requested && ['finished', 'aborted', 'aborted_budget'].includes(status));
}

export function projectMatch(match: MatchRecord, view: ViewMode) {
  const common = {
    id: match.id, seed: match.seed, status: match.status, winner: match.winner, speed: match.speed,
    apiCalls: match.apiCalls, error: match.error, createdAt: match.createdAt, updatedAt: match.updatedAt, finishedAt: match.finishedAt,
    ...(match.config.ttsProvider ? { ttsProvider: match.config.ttsProvider } : {}),
    characters: publicCharacterRoster(match.config.characters ?? cloneDefaultCharacterRoster()),
  };
  return view === 'gm' ? {
    ...common,
    ai: match.config.ai,
    ...(match.config.llmProvider ? {
      llmProvider: match.config.llmProvider,
      llmModel: match.config.llmModel,
      openaiReasoningEffort: match.config.openaiReasoningEffort ?? 'low',
      geminiThinkingBudget: match.config.geminiThinkingBudget ?? -1,
    } : {}),
  } : common;
}
