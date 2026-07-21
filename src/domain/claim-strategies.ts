import type { SeatId } from './types';
import { SEATS } from './constants';

export const CLAIM_TIMINGS = ['early', 'responsive', 'patient'] as const;
export type ClaimTiming = (typeof CLAIM_TIMINGS)[number];

export const DECEPTIVE_CLAIM_ROLES = ['seer', 'medium', 'adaptive'] as const;
export type DeceptiveClaimRole = (typeof DECEPTIVE_CLAIM_ROLES)[number];

export const CLAIM_PRESSURE_RESPONSES = ['withdraw', 'deliberate', 'confront'] as const;
export type ClaimPressureResponse = (typeof CLAIM_PRESSURE_RESPONSES)[number];

export interface TrueRoleClaimStrategy {
  /** 0は極力伏せ、100は最初の機会に公開したい人格傾向。確率抽選値ではない。 */
  revealTendency: number;
  /** まだ公開すべき能力結果がない時点でも肩書だけを出したい傾向。 */
  emptyResultRevealTendency: number;
  /** 注目と信用勝負の中心に立つことへの耐性。 */
  spotlightTolerance: number;
  timing: ClaimTiming;
  guidance: string;
}

export interface DeceptiveRoleClaimStrategy {
  /** 0は潜伏志向、100は騙りを強く選びたい人格傾向。確率抽選値ではない。 */
  claimTendency: number;
  /** 既存の同役職主張へ対抗する意欲。確率抽選値ではない。 */
  counterclaimTendency: number;
  /** 自分が3人目以降の同役職主張になる混雑盤面へ入る意欲。 */
  crowdingTolerance: number;
  /** 役職候補として注目と追及を引き受ける耐性。 */
  spotlightTolerance: number;
  /** 人狼判定や強い疑いを受けた際、役職騙りで生存を図る傾向。 */
  selfPreservationTendency: number;
  pressureResponse: ClaimPressureResponse;
  preferredRole: DeceptiveClaimRole;
  timing: ClaimTiming;
  guidance: string;
}

export interface WerewolfClaimStrategy extends DeceptiveRoleClaimStrategy {
  /** 仲間側の露出を増やして盤面を狭めることへの警戒。高いほど潜伏を優先する。 */
  teamExposureConcern: number;
}

export interface CharacterClaimStrategy {
  trueSeer: TrueRoleClaimStrategy;
  trueMedium: TrueRoleClaimStrategy;
  madman: DeceptiveRoleClaimStrategy;
  werewolf: WerewolfClaimStrategy;
  /** 一度公表した役職・結果と、まだ公表していない作戦をどう維持するか。 */
  consistency: string;
}

export const GENERIC_CLAIM_STRATEGY: CharacterClaimStrategy = {
  trueSeer: {
    revealTendency: 85,
    emptyResultRevealTendency: 25,
    spotlightTolerance: 65,
    timing: 'responsive',
    guidance: '初日に結果を公開する一般的な進行を重視し、対抗や人狼結果があれば早めに名乗る。',
  },
  trueMedium: {
    revealTendency: 70,
    emptyResultRevealTendency: 25,
    spotlightTolerance: 55,
    timing: 'responsive',
    guidance: '処刑結果と対抗状況を見て名乗り、結果がある日は情報を抱え込みすぎない。',
  },
  madman: {
    claimTendency: 70,
    counterclaimTendency: 78,
    crowdingTolerance: 35,
    spotlightTolerance: 70,
    selfPreservationTendency: 65,
    pressureResponse: 'deliberate',
    preferredRole: 'seer',
    timing: 'early',
    guidance: '一般的な9人人狼の狂人として占い師騙りを第一候補にし、潜伏には盤面上の明確な狙いを必要とする。',
  },
  werewolf: {
    claimTendency: 30,
    counterclaimTendency: 55,
    crowdingTolerance: 15,
    spotlightTolerance: 45,
    selfPreservationTendency: 60,
    pressureResponse: 'deliberate',
    teamExposureConcern: 70,
    preferredRole: 'adaptive',
    timing: 'responsive',
    guidance: '仲間の露出と現在の役職主張数を見て、信用勝負に価値がある場合だけ騙る。',
  },
  consistency: '一度選んだ公開役職と結果は維持し、待つと決めた場合も公開状況が変わった理由なしに気まぐれで方針を反転しない。',
};

/**
 * 既定9人の役職主張戦略。数値はLLMへ人格傾向として渡し、実AIでは確率抽選に使わない。
 * MockAIだけが同じ設定から決定論的な選択を再現する。
 */
type LegacyTrueRoleClaimStrategy = Pick<TrueRoleClaimStrategy, 'revealTendency' | 'timing' | 'guidance'>;
type LegacyDeceptiveRoleClaimStrategy = Pick<
  DeceptiveRoleClaimStrategy,
  'claimTendency' | 'counterclaimTendency' | 'preferredRole' | 'timing' | 'guidance'
>;
type LegacyCharacterClaimStrategy = {
  trueSeer: LegacyTrueRoleClaimStrategy;
  trueMedium: LegacyTrueRoleClaimStrategy;
  madman: LegacyDeceptiveRoleClaimStrategy;
  werewolf: LegacyDeceptiveRoleClaimStrategy;
  consistency: string;
};

const LEGACY_AGENT_CLAIM_STRATEGIES: Record<SeatId, LegacyCharacterClaimStrategy> = {
  'seat-1': {
    trueSeer: { revealTendency: 82, timing: 'responsive', guidance: '皆を心配する責任感から結果を抱え込みすぎないが、場を落ち着かせてから丁寧に名乗りたい。' },
    trueMedium: { revealTendency: 78, timing: 'responsive', guidance: '誤処刑を繰り返させないため結果を共有し、投票した人へ善意の確認を重ねる。' },
    madman: { claimTendency: 90, counterclaimTendency: 94, preferredRole: 'seer', timing: 'responsive', guidance: '村の世話をする顔で占い師を名乗り、偽結果を「皆さんのため」の忠告として押し出す。' },
    werewolf: { claimTendency: 28, counterclaimTendency: 52, preferredRole: 'medium', timing: 'responsive', guidance: '相談役の位置を失う危険と信用を得る利益を比べ、必要なら霊媒師として場の後始末を引き受ける。' },
    consistency: '自分の善意を疑わず、公開した主張は世話焼きの責任として最後まで守る。待った場合は「今出る方が皆を守れる」と思える変化が必要。',
  },
  'seat-2': {
    trueSeer: { revealTendency: 96, timing: 'early', guidance: '結果を持って黙るより、早く名乗って場を動かす方を選ぶ。判定だけは冗談にしない。' },
    trueMedium: { revealTendency: 88, timing: 'early', guidance: '結果が出たら驚きも含めてすぐ共有し、議論を止めない。' },
    madman: { claimTendency: 99, counterclaimTendency: 99, preferredRole: 'seer', timing: 'early', guidance: '占い師騙りで祭りを大きくするのが第一選択。面白くなる対抗を見送る理由はほとんどない。' },
    werewolf: { claimTendency: 58, counterclaimTendency: 76, preferredRole: 'seer', timing: 'early', guidance: '盤面が動くなら人狼でも前へ出る。すでに占い師が二人いる場合だけ過剰露出を警戒する。' },
    consistency: '勢いで始めた嘘でも判定自体は変えず、苦しくなったら撤回ではなく笑いと別の論点で押し切る。',
  },
  'seat-3': {
    trueSeer: { revealTendency: 70, timing: 'responsive', guidance: '単独で先頭に立つのは怖いが、周囲が役職を求める空気や対抗があれば名乗る。' },
    trueMedium: { revealTendency: 65, timing: 'responsive', guidance: '多数派の見立てと結果が食い違うほど切り出しに迷うが、誰かの後押しがあれば公表する。' },
    madman: { claimTendency: 83, counterclaimTendency: 94, preferredRole: 'adaptive', timing: 'responsive', guidance: '先に強く出た役職候補や場の期待を見て、最も受け入れられそうな騙りへ乗る。' },
    werewolf: { claimTendency: 18, counterclaimTendency: 42, preferredRole: 'adaptive', timing: 'responsive', guidance: '自分から信用勝負を始めず、仲間や自分が追い込まれたときだけ周囲が受け入れそうな役職を選ぶ。' },
    consistency: '公表後は強い対抗の言葉に揺れながらも役職自体は変えず、主張の解釈を周囲へ委ねる。',
  },
  'seat-4': {
    trueSeer: { revealTendency: 90, timing: 'early', guidance: '情報は日付と対象を整理して早めに共有し、推測と判定を分ける。' },
    trueMedium: { revealTendency: 86, timing: 'responsive', guidance: '処刑記録と判定を揃えてから正確に公表する。対抗があれば記録を守るためすぐ出る。' },
    madman: { claimTendency: 86, counterclaimTendency: 92, preferredRole: 'seer', timing: 'responsive', guidance: '破綻しない記録を維持できる占い師騙りを選び、勢いより整合性で信用を奪う。' },
    werewolf: { claimTendency: 34, counterclaimTendency: 60, preferredRole: 'seer', timing: 'patient', guidance: '記録上の必要性がある場合だけ騙り、開始後は対象・日・判定を帳面のように管理する。' },
    consistency: '過去の公表内容を最優先し、後から有利でも同じ対象の判定や役職を変更しない。方針変更には公開状況の具体的な変化を必要とする。',
  },
  'seat-5': {
    trueSeer: { revealTendency: 98, timing: 'early', guidance: '信用勝負を避けず、結果を武器に最初から議論の主導権を取る。' },
    trueMedium: { revealTendency: 94, timing: 'early', guidance: '判定を伏せて他人へ主導権を渡さず、結果から処刑方針を組み立てる。' },
    madman: { claimTendency: 98, counterclaimTendency: 100, preferredRole: 'seer', timing: 'early', guidance: '本物より強く占い師を名乗り、対抗との信用勝負そのものを勝ちにいく。潜伏は主導権を捨てる選択として嫌う。' },
    werewolf: { claimTendency: 64, counterclaimTendency: 84, preferredRole: 'seer', timing: 'early', guidance: '自分が信用を奪えると見れば人狼でも占い師を名乗り、論戦で対抗を押し切る。' },
    consistency: '撤回を敗北と捉え、反証が出ても公開した筋を別の論拠で補強する。役職変更や結果訂正はしない。',
  },
  'seat-6': {
    trueSeer: { revealTendency: 84, timing: 'early', guidance: '必要な結果だけ短く言い、名乗ると決めたら様子見を続けない。' },
    trueMedium: { revealTendency: 76, timing: 'responsive', guidance: '結果が判断を変えるなら短く公表し、同じ説明を繰り返さない。' },
    madman: { claimTendency: 82, counterclaimTendency: 92, preferredRole: 'seer', timing: 'responsive', guidance: '最小の嘘を効く一点へ置くため、占い師対抗が必要なら短く名乗る。派手な三人目は好まない。' },
    werewolf: { claimTendency: 24, counterclaimTendency: 58, preferredRole: 'seer', timing: 'responsive', guidance: '長い芝居を嫌い、自分への人狼判定を崩すなど明確な効果があるときだけ騙る。' },
    consistency: '一度言い切った結果は変えず、追及されても説明を増やさず同じ短い主張を維持する。',
  },
  'seat-7': {
    trueSeer: { revealTendency: 99, timing: 'early', guidance: '結果を信じて全力で名乗り、曖昧な保留をしない。' },
    trueMedium: { revealTendency: 96, timing: 'early', guidance: '処刑された相手の結果を抱え込まず、感情ごと正面から伝える。' },
    madman: { claimTendency: 97, counterclaimTendency: 100, preferredRole: 'seer', timing: 'early', guidance: '誰かを信じ抜く熱を偽結果へ乗せ、占い師として村を二つに割る。' },
    werewolf: { claimTendency: 48, counterclaimTendency: 82, preferredRole: 'seer', timing: 'responsive', guidance: '仲間または自分を守る信用勝負なら迷わず出るが、すでに味方側の主張が十分なら露出を増やさない。' },
    consistency: '信じると決めた自分の物語を最後まで守る。方針が反転するときは裏切りだと感じるほどの公開事件が必要。',
  },
  'seat-8': {
    trueSeer: { revealTendency: 92, timing: 'early', guidance: '大御所として結果を早めに披露し、自分の一言で場を動かしたい。' },
    trueMedium: { revealTendency: 88, timing: 'responsive', guidance: '人生経験を添えながら判定を公表し、若い参加者の判断へ重しを置く。' },
    madman: { claimTendency: 94, counterclaimTendency: 97, preferredRole: 'adaptive', timing: 'early', guidance: '貫禄を示せる役職を堂々と名乗る。基本は占い師だが、霊媒師の席が空いていて影響力が大きいなら選び直す。' },
    werewolf: { claimTendency: 44, counterclaimTendency: 70, preferredRole: 'adaptive', timing: 'responsive', guidance: '大御所として信用を取れる盤面なら騙り、若い対抗を経験の看板で押し返す。' },
    consistency: '外れても経験談で意味づけを変えるが、役職と判定そのものは変えず、貫禄を崩さない。',
  },
  'seat-9': {
    trueSeer: { revealTendency: 74, timing: 'patient', guidance: '注目を浴びる怖さから少し待つが、結果を失う最悪を考えて初日中には伝える。' },
    trueMedium: { revealTendency: 68, timing: 'patient', guidance: '結果を静かに抱え、必要性が明確になった時点で小さくても曖昧にせず公表する。' },
    madman: { claimTendency: 88, counterclaimTendency: 96, preferredRole: 'seer', timing: 'patient', guidance: '遅めに怯えた本物のような占い師を演じ、静かな偽結果で信頼へ疑いを落とす。' },
    werewolf: { claimTendency: 20, counterclaimTendency: 50, preferredRole: 'medium', timing: 'patient', guidance: '目立つ騙りを避けるが、静かな霊媒師主張なら疑心暗鬼を残せるときに限り選ぶ。' },
    consistency: '一度口にした嘘を訂正する方が怖いため静かに維持する。待つ方針は自分や仲間が追い詰められた場合だけ見直す。',
  },
};

type ClaimStrategyFacets = {
  trueSeer: Pick<TrueRoleClaimStrategy, 'emptyResultRevealTendency' | 'spotlightTolerance'>;
  trueMedium: Pick<TrueRoleClaimStrategy, 'emptyResultRevealTendency' | 'spotlightTolerance'>;
  madman: Pick<
    DeceptiveRoleClaimStrategy,
    'claimTendency' | 'counterclaimTendency' | 'crowdingTolerance' | 'spotlightTolerance' |
    'selfPreservationTendency' | 'pressureResponse'
  >;
  werewolf: Pick<
    WerewolfClaimStrategy,
    'claimTendency' | 'counterclaimTendency' | 'crowdingTolerance' | 'spotlightTolerance' |
    'selfPreservationTendency' | 'pressureResponse' | 'teamExposureConcern'
  >;
};

/**
 * claims v4で盤面が似ていても人格差が決定を分けるための特性。
 * 低・中・高を意図的に広く配置し、全員を同じ「標準セオリー」へ寄せない。
 */
const AGENT_CLAIM_FACETS: Record<SeatId, ClaimStrategyFacets> = {
  'seat-1': {
    trueSeer: { emptyResultRevealTendency: 20, spotlightTolerance: 56 },
    trueMedium: { emptyResultRevealTendency: 30, spotlightTolerance: 52 },
    madman: { claimTendency: 68, counterclaimTendency: 72, crowdingTolerance: 20, spotlightTolerance: 55, selfPreservationTendency: 55, pressureResponse: 'deliberate' },
    werewolf: { claimTendency: 22, counterclaimTendency: 38, crowdingTolerance: 8, spotlightTolerance: 45, selfPreservationTendency: 45, pressureResponse: 'deliberate', teamExposureConcern: 80 },
  },
  'seat-2': {
    trueSeer: { emptyResultRevealTendency: 70, spotlightTolerance: 94 },
    trueMedium: { emptyResultRevealTendency: 60, spotlightTolerance: 90 },
    madman: { claimTendency: 90, counterclaimTendency: 92, crowdingTolerance: 85, spotlightTolerance: 95, selfPreservationTendency: 80, pressureResponse: 'confront' },
    werewolf: { claimTendency: 55, counterclaimTendency: 65, crowdingTolerance: 45, spotlightTolerance: 90, selfPreservationTendency: 72, pressureResponse: 'confront', teamExposureConcern: 40 },
  },
  'seat-3': {
    trueSeer: { emptyResultRevealTendency: 15, spotlightTolerance: 38 },
    trueMedium: { emptyResultRevealTendency: 25, spotlightTolerance: 35 },
    madman: { claimTendency: 48, counterclaimTendency: 72, crowdingTolerance: 22, spotlightTolerance: 35, selfPreservationTendency: 58, pressureResponse: 'deliberate' },
    werewolf: { claimTendency: 12, counterclaimTendency: 28, crowdingTolerance: 5, spotlightTolerance: 30, selfPreservationTendency: 40, pressureResponse: 'withdraw', teamExposureConcern: 85 },
  },
  'seat-4': {
    trueSeer: { emptyResultRevealTendency: 35, spotlightTolerance: 58 },
    trueMedium: { emptyResultRevealTendency: 20, spotlightTolerance: 42 },
    madman: { claimTendency: 58, counterclaimTendency: 68, crowdingTolerance: 15, spotlightTolerance: 35, selfPreservationTendency: 50, pressureResponse: 'withdraw' },
    werewolf: { claimTendency: 25, counterclaimTendency: 42, crowdingTolerance: 8, spotlightTolerance: 30, selfPreservationTendency: 55, pressureResponse: 'deliberate', teamExposureConcern: 75 },
  },
  'seat-5': {
    trueSeer: { emptyResultRevealTendency: 85, spotlightTolerance: 98 },
    trueMedium: { emptyResultRevealTendency: 75, spotlightTolerance: 96 },
    madman: { claimTendency: 94, counterclaimTendency: 96, crowdingTolerance: 78, spotlightTolerance: 95, selfPreservationTendency: 90, pressureResponse: 'confront' },
    werewolf: { claimTendency: 68, counterclaimTendency: 78, crowdingTolerance: 60, spotlightTolerance: 95, selfPreservationTendency: 88, pressureResponse: 'confront', teamExposureConcern: 35 },
  },
  'seat-6': {
    trueSeer: { emptyResultRevealTendency: 30, spotlightTolerance: 62 },
    trueMedium: { emptyResultRevealTendency: 15, spotlightTolerance: 48 },
    madman: { claimTendency: 45, counterclaimTendency: 62, crowdingTolerance: 10, spotlightTolerance: 50, selfPreservationTendency: 75, pressureResponse: 'confront' },
    werewolf: { claimTendency: 18, counterclaimTendency: 45, crowdingTolerance: 5, spotlightTolerance: 55, selfPreservationTendency: 82, pressureResponse: 'confront', teamExposureConcern: 70 },
  },
  'seat-7': {
    trueSeer: { emptyResultRevealTendency: 80, spotlightTolerance: 96 },
    trueMedium: { emptyResultRevealTendency: 65, spotlightTolerance: 92 },
    madman: { claimTendency: 86, counterclaimTendency: 94, crowdingTolerance: 65, spotlightTolerance: 90, selfPreservationTendency: 88, pressureResponse: 'confront' },
    werewolf: { claimTendency: 45, counterclaimTendency: 72, crowdingTolerance: 50, spotlightTolerance: 88, selfPreservationTendency: 85, pressureResponse: 'confront', teamExposureConcern: 45 },
  },
  'seat-8': {
    trueSeer: { emptyResultRevealTendency: 60, spotlightTolerance: 90 },
    trueMedium: { emptyResultRevealTendency: 55, spotlightTolerance: 86 },
    madman: { claimTendency: 78, counterclaimTendency: 84, crowdingTolerance: 55, spotlightTolerance: 88, selfPreservationTendency: 70, pressureResponse: 'deliberate' },
    werewolf: { claimTendency: 50, counterclaimTendency: 62, crowdingTolerance: 35, spotlightTolerance: 85, selfPreservationTendency: 65, pressureResponse: 'deliberate', teamExposureConcern: 50 },
  },
  'seat-9': {
    trueSeer: { emptyResultRevealTendency: 8, spotlightTolerance: 24 },
    trueMedium: { emptyResultRevealTendency: 10, spotlightTolerance: 20 },
    madman: { claimTendency: 42, counterclaimTendency: 68, crowdingTolerance: 8, spotlightTolerance: 20, selfPreservationTendency: 35, pressureResponse: 'withdraw' },
    werewolf: { claimTendency: 10, counterclaimTendency: 25, crowdingTolerance: 3, spotlightTolerance: 15, selfPreservationTendency: 30, pressureResponse: 'withdraw', teamExposureConcern: 90 },
  },
};

export const AGENT_CLAIM_STRATEGIES: Record<SeatId, CharacterClaimStrategy> = Object.fromEntries(
  SEATS.map((seat) => {
    const legacy = LEGACY_AGENT_CLAIM_STRATEGIES[seat];
    const facets = AGENT_CLAIM_FACETS[seat];
    return [seat, {
      trueSeer: { ...legacy.trueSeer, ...facets.trueSeer },
      trueMedium: { ...legacy.trueMedium, ...facets.trueMedium },
      madman: { ...legacy.madman, ...facets.madman },
      werewolf: { ...legacy.werewolf, ...facets.werewolf },
      consistency: legacy.consistency,
    }];
  }),
) as Record<SeatId, CharacterClaimStrategy>;
