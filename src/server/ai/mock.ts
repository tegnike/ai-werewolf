import type { DecisionContext, DecisionProvider, SpeechDecision, TargetDecision } from '@/domain/types';
import { stableIndex } from '@/engine/prng';

const observations: Record<string, string[]> = {
  'seat-1': ['結論を急ぐ前に、各自の疑い先とその根拠を揃えましょう。対立点を整理すれば、判断材料が増えるはずです。'],
  'seat-2': ['んー、今の便乗っぽさはちょっと気になる！ まずそこを聞きたいな。'],
  'seat-3': ['Agent 2の反応は素直に見えました。逆にAgent 6はどうしてその結論になったのか、理由を聞かせてもらえますか？'],
  'seat-4': ['先ほどの発言と現在の疑い先には少しずれがあります。時系列を確認したうえで、投票理由まで一貫しているか慎重に見たいです。'],
  'seat-5': ['私は現時点でAgent 4を最優先で疑う。理由は発言の後追いと、疑い先を明確にしない姿勢の二点だ。反証があるなら具体的に示してほしい。'],
  'seat-6': ['その結論、根拠が薄い。便乗に見える。'],
  'seat-7': ['俺はAgent 5を疑う！ 言い切りは強いけど、まだ裏付けが足りない。みんなも立場を出してくれ！'],
  'seat-8': ['本日の処刑精度だけでなく、明日に残る情報も考えるべきです。候補を二名まで絞り、それぞれへの投票理由を明示する進行を提案します。'],
  'seat-9': ['発言内容より、質問を受けたあとの言い換えが少し気になりました。まだ断定はしませんが、その変化は覚えておきたいです。'],
};

export class MockAI implements DecisionProvider {
  async speech(context: DecisionContext): Promise<SpeechDecision> {
    const candidates = observations[context.actor.seat] ?? ['公開情報をもう一度確認します。'];
    const index = stableIndex(context.seed, context.callKey, candidates.length);
    const prefix = context.kind === 'wolf_speech' ? '襲撃方針として、' : '';
    return { speech: `${prefix}${candidates[index]}` };
  }

  async target(context: DecisionContext): Promise<TargetDecision> {
    const index = stableIndex(context.seed, context.callKey, context.legalTargets.length);
    return { targetSeat: context.legalTargets[index], statedReason: '公開情報と合法候補を比較した決定です。' };
  }
}
