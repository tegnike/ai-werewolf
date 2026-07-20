import { agentNameForSeat } from '@/domain/agents';
import type { SeatId } from '@/domain/types';
import type { UiEvent } from './types';

export type CinematicTone = 'day' | 'vote' | 'attack' | 'execution';
export type CinematicSound = 'scene' | 'vote' | 'attack' | 'execution';

export const CINEMATIC_SHORT_DURATION_MS = 2400;
export const CINEMATIC_LONG_DURATION_MS = 3600;
export const CINEMATIC_INTER_CUE_GAP_MS = 600;
export const CINEMATIC_VOTE_PRE_DELAY_MS = 1200;
export const CINEMATIC_VOTE_RESULT_DURATION_MS = 5000;

export interface CinematicVoteResult {
  seat: string;
  name: string;
  count: number;
  leading: boolean;
}

export interface CinematicCue {
  seq: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  tone: CinematicTone;
  sound: CinematicSound;
  durationMs: number;
  gapBeforeMs?: number;
  gapAfterMs?: number;
  voteResults?: CinematicVoteResult[];
  revealEventAfter?: boolean;
}

type PlayerNameResolver = (seat: SeatId) => string;

function playerName(value: unknown, resolveName: PlayerNameResolver = agentNameForSeat): string {
  const number = Number(String(value ?? '').split('-')[1]);
  if (!Number.isInteger(number) || number < 1 || number > 9) return '不明なプレイヤー';
  return resolveName(`seat-${number}` as SeatId);
}

function voteResults(event: UiEvent, resolveName?: PlayerNameResolver): CinematicVoteResult[] {
  const tally = event.payload.tally;
  if (!tally || typeof tally !== 'object' || Array.isArray(tally)) return [];
  const rows = Object.entries(tally)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const highest = rows[0]?.[1] ?? 0;
  return rows.map(([seat, count]) => ({ seat, name: playerName(seat, resolveName), count, leading: count === highest }));
}

function cinematicCuesForEvent(event: UiEvent, resolveName?: PlayerNameResolver): CinematicCue[] {
  if (event.type === 'match_created' || (event.type === 'private_action' && event.payload.label === '配役決定')) {
    return [{
      seq: event.seq,
      eyebrow: 'GAME START / NIGHT ZERO',
      title: '第0夜',
      subtitle: '配役確認と最初の夜の行動が始まります',
      tone: 'vote',
      sound: 'scene',
      durationMs: CINEMATIC_LONG_DURATION_MS,
    }];
  }

  if (event.type === 'dawn') {
    const victim = event.payload.victim;
    return [
      {
        seq: event.seq,
        eyebrow: 'NIGHT RESULT',
        title: victim ? playerName(victim, resolveName) : '犠牲者なし',
        subtitle: victim ? '襲撃の犠牲になりました' : '昨夜は誰も襲撃されませんでした',
        tone: victim ? 'attack' : 'day',
        sound: victim ? 'attack' : 'scene',
        durationMs: CINEMATIC_LONG_DURATION_MS,
        revealEventAfter: true,
      },
      {
        seq: event.seq,
        eyebrow: `DAWN / DAY ${event.day}`,
        title: `${event.day}日目`,
        subtitle: '新しい一日の議論が始まります',
        tone: 'day',
        sound: 'scene',
        durationMs: CINEMATIC_LONG_DURATION_MS,
      },
    ];
  }

  if (event.type === 'vote_reveal') {
    const runoff = event.payload.round === 2;
    const results = voteResults(event, resolveName);
    const leaders = results.filter((result) => result.leading);
    const resultSubtitle = leaders.length === 1
      ? `最多得票は${leaders[0].name}、${leaders[0].count}票です`
      : leaders.length > 1
        ? `最多得票${leaders[0].count}票で同数です`
        : '投票結果が確定しました';
    return [
      {
        seq: event.seq,
        eyebrow: `DAY ${event.day} / ${runoff ? 'RUNOFF' : 'VOTE'}`,
        title: runoff ? '決選開票' : '開票',
        subtitle: runoff ? '決選投票の結果を公開します' : '全員の投票先を公開します',
        tone: 'vote',
        sound: 'vote',
        durationMs: CINEMATIC_SHORT_DURATION_MS,
        gapBeforeMs: CINEMATIC_VOTE_PRE_DELAY_MS,
      },
      {
        seq: event.seq,
        eyebrow: `DAY ${event.day} / ${runoff ? 'RUNOFF ' : ''}VOTE RESULT`,
        title: runoff ? '決選投票結果' : '投票結果',
        subtitle: resultSubtitle,
        tone: 'vote',
        sound: 'scene',
        durationMs: CINEMATIC_VOTE_RESULT_DURATION_MS,
        voteResults: results,
        revealEventAfter: true,
      },
    ];
  }

  if (event.type === 'execution') {
    const executed = event.payload.seat;
    return [{
      seq: event.seq,
      eyebrow: `DAY ${event.day} / EXECUTION`,
      title: executed ? playerName(executed, resolveName) : '処刑なし',
      subtitle: executed ? '投票により処刑されました' : '決選投票でも同数となりました',
      tone: executed ? 'execution' : 'vote',
      sound: executed ? 'execution' : 'scene',
      durationMs: CINEMATIC_LONG_DURATION_MS,
      revealEventAfter: true,
    }];
  }

  return [];
}

export function cinematicCueForEvent(event: UiEvent, resolveName?: PlayerNameResolver): CinematicCue | null {
  return cinematicCuesForEvent(event, resolveName)[0] ?? null;
}

export function cinematicCuesBetween(events: UiEvent[], afterSeq: number, throughSeq: number, resolveName?: PlayerNameResolver): CinematicCue[] {
  const dayOneBoundarySeq = events
    .filter((event) => event.day === 0 && (event.type === 'seer_result' ||
      (event.type === 'private_action' && event.payload.label === '占い結果の確認')))
    .sort((left, right) => left.seq - right.seq)
    .at(-1)?.seq ?? events
    .filter((event) => event.day === 1 && event.type === 'discussion_speech')
    .sort((left, right) => left.seq - right.seq)[0]?.seq;
  return events
    .filter((event) => event.seq > afterSeq && event.seq <= throughSeq)
    .sort((left, right) => left.seq - right.seq)
    .flatMap((event) => {
      if (event.seq === dayOneBoundarySeq) {
        return [{
          seq: event.seq,
          eyebrow: 'DAWN / DAY 1',
          title: '1日目',
          subtitle: '最初の議論が始まります',
          tone: 'day',
          sound: 'scene',
          durationMs: CINEMATIC_LONG_DURATION_MS,
        } satisfies CinematicCue];
      }
      return cinematicCuesForEvent(event, resolveName);
    });
}
