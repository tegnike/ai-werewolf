import { agentNameForSeat } from '@/domain/agents';
import type { SeatId } from '@/domain/types';
import type { UiEvent } from './types';

export type CinematicTone = 'day' | 'vote' | 'attack' | 'execution';
export type CinematicSound = 'scene' | 'vote' | 'attack' | 'execution';

export const CINEMATIC_SHORT_DURATION_MS = 2400;
export const CINEMATIC_LONG_DURATION_MS = 3600;
export const CINEMATIC_INTER_CUE_GAP_MS = 600;

export interface CinematicCue {
  seq: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  tone: CinematicTone;
  sound: CinematicSound;
  durationMs: number;
}

function playerName(value: unknown): string {
  const number = Number(String(value ?? '').split('-')[1]);
  if (!Number.isInteger(number) || number < 1 || number > 9) return '不明なプレイヤー';
  return agentNameForSeat(`seat-${number}` as SeatId);
}

export function cinematicCueForEvent(event: UiEvent): CinematicCue | null {
  if (event.type === 'match_created' || (event.type === 'private_action' && event.payload.label === '配役決定')) {
    return {
      seq: event.seq,
      eyebrow: 'GAME START / NIGHT ZERO',
      title: '第0夜',
      subtitle: '配役確認と最初の夜の行動が始まります',
      tone: 'vote',
      sound: 'scene',
      durationMs: CINEMATIC_LONG_DURATION_MS,
    };
  }

  if (event.type === 'dawn') {
    const victim = event.payload.victim;
    return {
      seq: event.seq,
      eyebrow: `DAWN / DAY ${event.day}`,
      title: `${event.day}日目`,
      subtitle: victim ? `${playerName(victim)}が襲撃の犠牲になりました` : '昨夜の犠牲者はいません',
      tone: victim ? 'attack' : 'day',
      sound: victim ? 'attack' : 'scene',
      durationMs: CINEMATIC_LONG_DURATION_MS,
    };
  }

  if (event.type === 'discussion_closed') {
    return {
      seq: event.seq,
      eyebrow: `DAY ${event.day} / VOTING PHASE`,
      title: '投票開始',
      subtitle: '生存者が処刑候補を選びます',
      tone: 'vote',
      sound: 'scene',
      durationMs: CINEMATIC_SHORT_DURATION_MS,
    };
  }

  if (event.type === 'vote_reveal') {
    const runoff = event.payload.round === 2;
    return {
      seq: event.seq,
      eyebrow: `DAY ${event.day} / ${runoff ? 'RUNOFF' : 'VOTE'} RESULT`,
      title: runoff ? '決選開票' : '開票',
      subtitle: runoff ? '決選投票の結果を公開します' : '全員の投票先を公開します',
      tone: 'vote',
      sound: 'vote',
      durationMs: CINEMATIC_SHORT_DURATION_MS,
    };
  }

  if (event.type === 'execution') {
    const executed = event.payload.seat;
    return {
      seq: event.seq,
      eyebrow: `DAY ${event.day} / EXECUTION`,
      title: executed ? playerName(executed) : '処刑なし',
      subtitle: executed ? '投票により処刑されました' : '決選投票でも同数となりました',
      tone: executed ? 'execution' : 'vote',
      sound: executed ? 'execution' : 'scene',
      durationMs: CINEMATIC_LONG_DURATION_MS,
    };
  }

  return null;
}

export function cinematicCuesBetween(events: UiEvent[], afterSeq: number, throughSeq: number): CinematicCue[] {
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
      const cue = cinematicCueForEvent(event);
      return cue ? [cue] : [];
    });
}
