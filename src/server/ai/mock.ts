import type { DecisionContext, DecisionProvider, SpeechDecision, TargetDecision } from '@/domain/types';
import { stableIndex } from '@/engine/prng';

const observations = [
  '発言と投票先の一貫性を見たいです。',
  '断定を急がず、今日の情報を整理しましょう。',
  '投票理由を明確にして情報を残したいです。',
  '役職COと結果の整合性に注目しています。',
  '疑い先だけでなく、村らしい点も比較します。',
];

export class MockAI implements DecisionProvider {
  async speech(context: DecisionContext): Promise<SpeechDecision> {
    const index = stableIndex(context.seed, context.callKey, observations.length);
    const prefix = context.kind === 'wolf_speech' ? '襲撃方針として、' : '';
    return { speech: `${prefix}${observations[index]}` };
  }

  async target(context: DecisionContext): Promise<TargetDecision> {
    const index = stableIndex(context.seed, context.callKey, context.legalTargets.length);
    return { targetSeat: context.legalTargets[index], statedReason: '公開情報と合法候補を比較した決定です。' };
  }
}
