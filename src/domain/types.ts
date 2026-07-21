import type { ClaimDirective, ClaimIntent, SpeechClaim } from './claims';

export type Role = 'villager' | 'werewolf' | 'seer' | 'medium' | 'bodyguard' | 'madman';
export type Team = 'village' | 'werewolf';
export type SeatId = `seat-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
export type MatchStatus = 'running' | 'paused' | 'paused_error' | 'finished' | 'aborted' | 'aborted_budget';
export type Winner = 'village' | 'werewolf' | 'draw';
export type Visibility = 'public' | 'private';
export type ViewMode = 'public' | 'gm';
export type LlmProvider = 'openai' | 'gemini';
export const OPENAI_REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type OpenAiReasoningEffort = (typeof OPENAI_REASONING_EFFORTS)[number];
export const GEMINI_THINKING_BUDGET_PRESETS = [-1, 128, 1_024, 4_096, 8_192, 16_384, 32_768] as const;
export type GeminiThinkingBudget = number;
export type TtsProvider = 'voicevox' | 'aivisspeech';
export type Phase =
  | 'setup' | 'night_zero' | 'dawn' | 'discussion' | 'vote' | 'runoff'
  | 'execution' | 'medium' | 'wolf_chat' | 'night_actions' | 'finished';

export interface Player {
  seat: SeatId;
  name: string;
  role: Role;
  alive: boolean;
}

export interface MatchEvent<T extends string = string, P = Record<string, unknown>> {
  matchId: string;
  seq: number;
  day: number;
  phase: Phase;
  type: T;
  visibility: Visibility;
  audienceSeats: SeatId[];
  payload: P;
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  seed: string;
  status: MatchStatus;
  winner: Winner | null;
  speed: number;
  apiCalls: number;
  error: { code: string; message: string; phase?: string; model?: string; reason?: string } | null;
  config: {
    ai: 'mock' | 'real';
    llmProvider?: LlmProvider;
    llmModel?: string;
    openaiReasoningEffort?: OpenAiReasoningEffort;
    geminiThinkingBudget?: GeminiThinkingBudget;
    ttsProvider?: TtsProvider;
    /** 新規試合ではキャラクターごとに解決したモデル名を席別に固定する。 */
    characterLlmModels?: Partial<Record<SeatId, string>>;
    characters?: import('./characters').CharacterRoster;
  };
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface GameState {
  day: number;
  phase: Phase;
  players: Player[];
  lastGuard: SeatId | null;
  lastExecuted: SeatId | null;
  pendingVictim: SeatId | null;
}

export type DecisionKind = 'speech' | 'speech_intent' | 'wolf_speech' | 'vote' | 'runoff_vote' | 'attack' | 'attack_final' | 'seer' | 'guard';
export type SpeechMotivation = 'reply' | 'question' | 'challenge' | 'new_information' | 'clarify' | 'none';
export type SpeechAct = 'role_claim' | 'question' | 'answer' | 'suspicion' | 'defense' | 'vote_intent' | 'board_analysis' | 'agreement' | 'other';
export type QuestionTopic = 'inspection_reason' | 'claim_timing' | 'counterclaim_reason' | 'execution_policy' | 'vote_plan' | 'gray_read' | 'defense' | 'other';
export type SuspicionBasis =
  | 'speech_content' | 'statement_slip' | 'reasoning_quality'
  | 'timing' | 'interaction' | 'vote_plan' | 'role_claim' | 'result' | 'intuition';

export interface SpeechStructure {
  primaryAct: SpeechAct;
  /** 質問をした、または質問へ答えた場合の話題。 */
  questionTopic: QuestionTopic | null;
  suspicion: {
    targetSeat: SeatId;
    basis: SuspicionBasis;
    /** 既出論点へ明示的に同調した場合の引用元。旧保存応答との互換のため任意。 */
    echoSourceSeat?: SeatId | null;
    /** 根拠となる公開情報の日。勘だけの場合はnull。旧保存応答との互換のため任意。 */
    evidenceDay?: number | null;
  } | null;
  voteIntent: SeatId | null;
  /** 役職主張数や今日の処刑範囲を本文で明示的に整理したか。 */
  boardAnalysis: boolean;
}

export interface CandidateEvidenceEntry {
  targetSeat: SeatId;
  suspicionSpeakers: number;
  voteIntentSpeakers: number;
  suspicionBases: Partial<Record<SuspicionBasis, number>>;
  /** 同じ既出論点を引用した疑いのユニーク話者数。 */
  echoSpeakers: number;
  /** 公開された疑いの根拠分類数。 */
  distinctBases: number;
  claimedResults: Array<{
    sourceSeat: SeatId;
    claimedRole: 'seer' | 'medium';
    verdict: '人狼' | '人狼ではない';
    sameRoleClaimants: number;
  }>;
}

export interface PublicCommitment {
  seat: SeatId;
  /** 今日この人物が最後に明示した暫定的な疑い先。 */
  suspicionTargetSeat?: SeatId;
  /** 最新の疑いで本人が自己分類した公開根拠。 */
  suspicionBasis?: SuspicionBasis;
  /** 今日この人物が最後に明示した投票予定。 */
  voteIntentTargetSeat?: SeatId;
  /** 今日この人物が明示的に回答した質問分類。 */
  answeredTopics: QuestionTopic[];
  /** 今日、自分への疑いへ弁明したか。 */
  defended: boolean;
  /** 今日、疑い先を別の人物へ更新したか。 */
  changedSuspicion: boolean;
}

export interface DiscussionContext {
  stage: 'opening' | 'free';
  turn: number;
  promptedBySeat?: SeatId;
  motivation?: SpeechMotivation;
  intendedTarget?: SeatId | null;
  spokenSeats?: SeatId[];
  remainingUnspokenSeats?: SeatId[];
  canRequestReply?: boolean;
  /** 新規試合の議論台帳とagendaを有効にする。 */
  version?: 'v3';
  /** 公開発言の構造化情報だけから導出した、秘密を含まない議論状況。 */
  boardDigest?: string[];
  /** 今日各人がすでに公開した最新の候補・回答・弁明。 */
  publicCommitments?: PublicCommitment[];
  /** 公開材料の量から決定論的に分けた、発言で求める貢献の段階。 */
  materialPhase?: 'scarce' | 'developing' | 'decision';
  /** 台本ではなく、まだ不足している貢献の候補。 */
  agenda?: string[];
  /** すでに十分に尋ねられ、追加の返答要求を受け付けない質問分類。 */
  closedQuestionTopics?: QuestionTopic[];
  /** 3人以上の投票予定が集まった公開上の先頭候補。 */
  consensusTarget?: SeatId;
  /** 投票予定が3人に達した候補本人へ保証された、合意形成後の反論枠。 */
  consensusDefense?: boolean;
  /** この話者が同日すでに宣言した投票予定。 */
  priorVoteIntentTarget?: SeatId;
  /** 同じ対象・根拠分類へ疑いが集中し、別材料との比較が必要な公開状況。 */
  saturatedPoint?: { targetSeat: SeatId; basis: SuspicionBasis; speakers: number };
  /** markerのない旧試合で固定一巡プロンプトを再現する。 */
  legacyRules?: boolean;
  /** discussion v2より前の保存済み試合を復旧するための互換情報。 */
  openingSpokenSeats?: SeatId[];
  /** discussion v2より前の保存済み試合を復旧するための互換情報。 */
  waitingForFreeReplySeats?: SeatId[];
}

export interface WolfChatContext {
  mode: 'dialogue' | 'monologue';
  participantSeats: SeatId[];
}

export interface DecisionContext {
  matchId: string;
  callKey: string;
  seed: string;
  day: number;
  phase: Phase;
  kind: DecisionKind;
  actor: Player;
  players: Player[];
  legalTargets: SeatId[];
  publicHistory: string[];
  privateFacts: string[];
  /** 試合開始時に保存したキャラクター設定。旧試合は固定9人へフォールバックする。 */
  characters?: import('./characters').CharacterRoster;
  round?: number;
  discussion?: DiscussionContext;
  wolfChat?: WolfChatContext;
  claimDirective?: ClaimDirective;
  claimBoard?: string[];
  /** 公開発言と公開役職主張だけから作る候補別の証拠台帳。 */
  candidateEvidence?: CandidateEvidenceEntry[];
}

export interface SpeechDecision {
  speech: string;
  addressedTo: SeatId | null;
  requestsReply: boolean;
  claim?: SpeechClaim | null;
  /** claims v3/v4でLLMが選んだ非公開作戦。discussion_speechの公開payloadへは保存しない。 */
  claimIntent?: ClaimIntent;
  /** discussion v3で必須。v2以前の保存済みAI応答との互換のため型上は任意。 */
  structure?: SpeechStructure;
  /** 同一話者による変更のない投票予定の再宣言を主要貢献から格下げした印。 */
  contributionDemoted?: boolean;
}
export interface SpeechIntentDecision {
  urgency: 0 | 1 | 2 | 3;
  motivation: SpeechMotivation;
  targetSeat: SeatId | null;
}
export interface TargetDecision { targetSeat: SeatId; statedReason: string }

export interface DecisionProvider {
  speech(context: DecisionContext): Promise<SpeechDecision>;
  speechIntent(context: DecisionContext): Promise<SpeechIntentDecision>;
  target(context: DecisionContext): Promise<TargetDecision>;
}

export interface RunHooks {
  emit(event: Omit<MatchEvent, 'matchId' | 'seq' | 'createdAt'>): Promise<void>;
  checkpoint(): Promise<void>;
}
