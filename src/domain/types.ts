export type Role = 'villager' | 'werewolf' | 'seer' | 'medium' | 'bodyguard' | 'madman';
export type Team = 'village' | 'werewolf';
export type SeatId = `seat-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
export type MatchStatus = 'running' | 'paused' | 'paused_error' | 'finished' | 'aborted' | 'aborted_budget';
export type Winner = 'village' | 'werewolf' | 'draw';
export type Visibility = 'public' | 'private';
export type ViewMode = 'public' | 'gm';
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
  error: { code: string; message: string; phase?: string; model?: string } | null;
  config: { ai: 'mock' | 'real' };
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

export interface DiscussionContext {
  stage: 'opening' | 'free';
  turn: number;
  promptedBySeat?: SeatId;
  motivation?: SpeechMotivation;
  intendedTarget?: SeatId | null;
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
  round?: number;
  discussion?: DiscussionContext;
}

export interface SpeechDecision {
  speech: string;
  addressedTo: SeatId | null;
  requestsReply: boolean;
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
