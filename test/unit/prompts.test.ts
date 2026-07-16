import { describe, expect, it } from 'vitest';
import type { DecisionContext } from '@/domain/types';
import { setupPlayers } from '@/engine/setup';
import { buildPrompts } from '@/server/ai/prompts';

describe('実AI人格プロンプト', () => {
  it('固有名・欠点・台詞例・話者固有の呼称表を使い、議事録調とAgent番号を避けさせる', () => {
    const players = setupPlayers('persona-prompt');
    const context: DecisionContext = {
      matchId: 'test',
      callKey: 'day-1-speech-seat-2',
      seed: 'persona-prompt',
      day: 1,
      phase: 'discussion',
      kind: 'speech',
      actor: players[1],
      players,
      legalTargets: [],
      publicHistory: ['名取 澪: 皆さんの話を聞きたいです。'],
      privateFacts: [],
      round: 1,
    };

    const { systemPrompt, decisionPrompt } = buildPrompts(context);
    expect(systemPrompt).toContain('あなたは八木 こはる');
    expect(systemPrompt).toContain('内面の矛盾と欠点');
    expect(systemPrompt).toContain('台詞の見本');
    expect(systemPrompt).toContain('他の参加者の呼び方');
    expect(systemPrompt).toContain('宮下 さくらは「さくらちゃん」');
    expect(systemPrompt).toContain('神崎 レナは「レナ」');
    expect(systemPrompt).toContain('Agent番号や別の呼び方を使わず');
    expect(systemPrompt).toContain('議事録調の語を繰り返さない');
    expect(decisionPrompt).toContain('名取 澪');
    expect(decisionPrompt).toContain('八木 こはる');
  });

  it('占い結果の初回公開では占い師COを同じ発言で要求する', () => {
    const players = setupPlayers('persona-prompt');
    const seer = { ...players[1], role: 'seer' as const };
    const context: DecisionContext = {
      matchId: 'test', callKey: 'd1-seer-speech', seed: 'persona-prompt', day: 1, phase: 'discussion', kind: 'speech',
      actor: seer, players: players.map((player) => player.seat === seer.seat ? seer : player), legalTargets: [],
      publicHistory: [], privateFacts: ['自分の役職: seer', '青木 征司: 人狼'], round: 1,
    };
    expect(buildPrompts(context).systemPrompt).toContain('必ず同じ発言内で「占い師COです」');
  });
});
