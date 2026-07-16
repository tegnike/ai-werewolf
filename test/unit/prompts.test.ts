import { describe, expect, it } from 'vitest';
import type { DecisionContext } from '@/domain/types';
import { setupPlayers } from '@/engine/setup';
import { buildPrompts } from '@/server/ai/prompts';

describe('実AI人格プロンプト', () => {
  it('固有名・欠点・台詞例を使い、議事録調とAgent番号を避けさせる', () => {
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
    expect(systemPrompt).toContain('Agent番号ではなく');
    expect(systemPrompt).toContain('議事録調の語を繰り返さない');
    expect(decisionPrompt).toContain('名取 澪');
    expect(decisionPrompt).toContain('八木 こはる');
  });
});
