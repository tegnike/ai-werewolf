import { MAX_DAYS } from '@/domain/constants';
import {
  assertClaimWithinDirective, claimBoardDigest, foldClaim,
  type ClaimDirective, type ClaimLedger, type ClaimResult, type ClaimableRole,
} from '@/domain/claims';
import type {
  DecisionContext, DecisionProvider, DiscussionContext, GameState, MatchEvent, Player, RunHooks, SeatId, SpeechIntentDecision, Winner,
} from '@/domain/types';
import { legalAttackTargets, legalGuardTargets, legalSeerTargets, legalVoteTargets } from './legal';
import { normalizeSpeech, seatName } from './narration';
import { stableShuffle } from './prng';
import { setupPlayers } from './setup';
import { createInitialState } from './state';
import { checkVictory, isWerewolfResult } from './victory';
import {
  claimDirectiveFor, decideClaimPolicies, planMadmanMediumFake, planMadmanSeerFake,
  planWolfMediumFake, planWolfSeerFake, preserveFakeResultConsistency,
} from './claim-policy';
import {
  candidateEvidenceLedger, closedQuestionTopics, consensusVoteTarget, discussionAgenda, discussionBoardDigest,
  emptyDiscussionBoard, foldDiscussionBoard, priorVoteIntentFor, sanitizeEchoSourceSeat, saturatedPointFor,
  suspicionCountFor, voteIntentCountFor,
} from './discussion-board';

export interface SimulationResult { winner: Winner; day: number; state: GameState }

interface ScheduledDiscussionSpeaker {
  actor: Player;
  promptedBySeat?: SeatId;
  motivation?: DiscussionContext['motivation'];
  intendedTarget?: SeatId | null;
  consensusDefense?: boolean;
  allowExtraSpeech?: boolean;
}

const MAX_INTENT_POLLS_PER_DAY = 2;
const INTENT_CANDIDATES_PER_POLL = 4;
const MAX_SPEECHES_PER_PLAYER = 2;
const LEGACY_MAX_FREE_SPEECHES_PER_PLAYER = 2;
const NINE_PLAYER_MIN_SPEECHES = 14;
const ABSOLUTE_MAX_SPEECHES = 18;
const DISCUSSION_SPEAKER_COOLDOWN = 2;

function canSpeakAfter(recentSpeakerSeats: SeatId[], seat: SeatId): boolean {
  return !recentSpeakerSeats.slice(-DISCUSSION_SPEAKER_COOLDOWN).includes(seat);
}

function rememberSpeaker(recentSpeakerSeats: SeatId[], seat: SeatId): void {
  recentSpeakerSeats.push(seat);
  if (recentSpeakerSeats.length > DISCUSSION_SPEAKER_COOLDOWN) recentSpeakerSeats.shift();
}

function discussionSpeechLimits(aliveCount: number): { minimum: number; maximum: number } {
  return {
    minimum: Math.max(aliveCount, Math.ceil((NINE_PLAYER_MIN_SPEECHES * aliveCount) / 9)),
    maximum: Math.min(ABSOLUTE_MAX_SPEECHES, aliveCount * MAX_SPEECHES_PER_PLAYER),
  };
}

function actorByRole(state: GameState, role: string): Player | undefined {
  return state.players.find((player) => player.alive && player.role === role);
}

function playerBySeat(state: GameState, seat: SeatId): Player {
  const player = state.players.find((candidate) => candidate.seat === seat);
  if (!player) throw new Error(`Unknown seat: ${seat}`);
  return player;
}

function rotateAlive(players: Player[], day: number): Player[] {
  const start = (day - 1) % 9;
  return [...players]
    .filter((player) => player.alive)
    .sort((a, b) => {
      const ai = (Number(a.seat.split('-')[1]) - 1 - start + 9) % 9;
      const bi = (Number(b.seat.split('-')[1]) - 1 - start + 9) % 9;
      return ai - bi;
    });
}

function countVotes(votes: Array<{ voter: SeatId; target: SeatId }>): Record<string, number> {
  return votes.reduce<Record<string, number>>((tally, vote) => {
    tally[vote.target] = (tally[vote.target] ?? 0) + 1;
    return tally;
  }, {});
}

function topCandidates(tally: Record<string, number>): SeatId[] {
  const max = Math.max(...Object.values(tally));
  return Object.entries(tally).filter(([, count]) => count === max).map(([seat]) => seat as SeatId);
}

function chooseIntent(
  decisions: Array<{ actor: Player; decision: SpeechIntentDecision; promptedBySeat?: SeatId }>,
  freeSpeechCounts: Map<SeatId, number>,
  seed: string,
  purposeKey: string,
): { actor: Player; decision: SpeechIntentDecision; promptedBySeat?: SeatId } | null {
  const eligible = decisions.filter(({ decision }) => decision.urgency > 0);
  if (eligible.length === 0) return null;
  const tieOrder = new Map(stableShuffle(eligible, seed, purposeKey).map((item, index) => [item.actor.seat, index]));
  return [...eligible].sort((a, b) => {
    const aScore = a.decision.urgency * 100 + (a.promptedBySeat ? 20 : 0) - (freeSpeechCounts.get(a.actor.seat) ?? 0) * 5;
    const bScore = b.decision.urgency * 100 + (b.promptedBySeat ? 20 : 0) - (freeSpeechCounts.get(b.actor.seat) ?? 0) * 5;
    return bScore - aScore || (tieOrder.get(a.actor.seat) ?? 0) - (tieOrder.get(b.actor.seat) ?? 0);
  })[0];
}

function privateFactsFor(
  actor: Player,
  state: GameState,
  histories: { seer: string[]; medium: string[]; guard: string[]; wolf: string[]; wolfAttack: string[] },
): string[] {
  const facts = [`自分の役職: ${actor.role}`];
  if (actor.role === 'werewolf') {
    const allies = state.players.filter((player) => player.role === 'werewolf' && player.seat !== actor.seat);
    const livingAllies = allies.filter((player) => player.alive).map((player) => player.name);
    const deadAllies = allies.filter((player) => !player.alive).map((player) => player.name);
    facts.push(livingAllies.length > 0
      ? `生存中の人狼仲間: ${livingAllies.join(', ')}`
      : '生存中の人狼仲間: なし（自分だけ）');
    if (deadAllies.length > 0) facts.push(`死亡した人狼仲間: ${deadAllies.join(', ')}`);
    facts.push(...histories.wolf.slice(-20));
    facts.push(...histories.wolfAttack);
  }
  if (actor.role === 'seer') facts.push(...histories.seer);
  if (actor.role === 'medium') facts.push(...histories.medium);
  if (actor.role === 'bodyguard') facts.push(...histories.guard);
  return facts;
}

export async function runGame(
  matchId: string,
  seed: string,
  ai: DecisionProvider,
  hooks: RunHooks,
  options: { includeDayOneDawn?: boolean; claimsVersion?: 'v1'; discussionVersion?: 'legacy' | 'v2' | 'v3' } = {},
): Promise<SimulationResult> {
  const players = setupPlayers(seed);
  const claimsEnabled = options.claimsVersion === 'v1';
  const discussionVersion = options.discussionVersion ?? 'v3';
  const claimPolicies = decideClaimPolicies(seed, players);
  let state = createInitialState(players);
  const publicHistory: string[] = [];
  let claimLedger: ClaimLedger = [];
  const claimResults = new Map<SeatId, Record<ClaimableRole, ClaimResult[]>>(
    players.map((player) => [player.seat, { seer: [], medium: [] }]),
  );
  const histories = {
    seer: [] as string[], medium: [] as string[], guard: [] as string[], wolf: [] as string[], wolfAttack: [] as string[],
  };
  let discussionBoard = emptyDiscussionBoard();
  let pendingVictim: SeatId | null = null;

  const directiveFor = (actor: Player, day: number, stage: 'opening' | 'free'): ClaimDirective => {
    const policy = claimPolicies.get(actor.seat);
    if (!policy) return { mode: 'forbidden', claimedRole: null, results: [], counterTargetSeat: null };
    const actorAlreadyClaimed = claimLedger.some((entry) => entry.seat === actor.seat);
    const alliedWolfAlreadyClaimed = actor.role === 'werewolf' && claimLedger.some((entry) =>
      entry.seat !== actor.seat && playerBySeat(state, entry.seat).role === 'werewolf');
    if (!actorAlreadyClaimed && alliedWolfAlreadyClaimed) {
      return { mode: 'forbidden', claimedRole: null, results: [], counterTargetSeat: null };
    }
    const results = claimResults.get(actor.seat) ?? { seer: [], medium: [] };
    return claimDirectiveFor(seed, policy, claimLedger, {
      seer: results.seer.map((result) => ({ ...result })),
      medium: results.medium.map((result) => ({ ...result })),
    }, { day, stage });
  };

  const emit = async (
    day: number,
    phase: MatchEvent['phase'],
    type: string,
    payload: Record<string, unknown>,
    visibility: MatchEvent['visibility'] = 'public',
    audienceSeats: SeatId[] = [],
  ) => {
    state = { ...state, day, phase };
    await hooks.emit({ day, phase, type, payload, visibility, audienceSeats });
    await hooks.checkpoint();
  };

  const context = (
    actor: Player,
    day: number,
    phase: MatchEvent['phase'],
    kind: DecisionContext['kind'],
    callKey: string,
    legalTargets: SeatId[] = [],
    round?: number,
    discussion?: DiscussionContext,
  ): DecisionContext => {
    const saturatedPoint = discussionVersion === 'v3' ? saturatedPointFor(discussionBoard) : undefined;
    const base: DecisionContext = {
      matchId, seed, day, phase, kind, callKey, actor,
      players: state.players.map((player) => ({ ...player })), legalTargets,
      publicHistory: [...publicHistory], privateFacts: privateFactsFor(actor, state, histories), round,
      ...(discussionVersion === 'v3' ? { candidateEvidence: candidateEvidenceLedger(discussionBoard, claimLedger) } : {}),
      discussion: discussion ? {
        ...discussion,
        ...(discussionVersion === 'legacy' ? { legacyRules: true } : {}),
        ...(discussionVersion === 'v3' ? {
          version: 'v3' as const,
          boardDigest: discussionBoardDigest(discussionBoard, state.players, claimLedger),
          agenda: discussionAgenda(
            discussionBoard,
            state.players,
            actor.seat,
            discussion.turn,
            discussion.promptedBySeat,
            discussion.spokenSeats,
          ),
          closedQuestionTopics: closedQuestionTopics(discussionBoard),
          ...(consensusVoteTarget(discussionBoard) ? { consensusTarget: consensusVoteTarget(discussionBoard) } : {}),
          ...(priorVoteIntentFor(discussionBoard, actor.seat) ? { priorVoteIntentTarget: priorVoteIntentFor(discussionBoard, actor.seat) } : {}),
          ...(saturatedPoint ? { saturatedPoint } : {}),
        } : {}),
      } : undefined,
    };
    if (kind === 'wolf_speech') {
      const participantSeats = state.players
        .filter((player) => player.alive && player.role === 'werewolf')
        .map((player) => player.seat);
      base.wolfChat = {
        mode: participantSeats.length === 1 ? 'monologue' : 'dialogue',
        participantSeats,
      };
    }
    if (claimsEnabled) base.claimBoard = claimBoardDigest(claimLedger);
    if (claimsEnabled && kind === 'speech' && discussion) base.claimDirective = directiveFor(actor, day, discussion.stage);
    return base;
  };

  const finish = async (winner: Winner, day: number, anomaly = false): Promise<SimulationResult> => {
    await emit(day, 'finished', anomaly ? 'anomaly_flag' : 'match_finished', {
      winner,
      roles: state.players.map((player) => ({ seat: player.seat, name: player.name, role: player.role, alive: player.alive })),
      anomaly,
    });
    if (anomaly) {
      await emit(day, 'finished', 'match_finished', {
        winner,
        roles: state.players.map((player) => ({ seat: player.seat, name: player.name, role: player.role, alive: player.alive })),
        anomaly: true,
      });
    }
    return { winner, day, state: { ...state, phase: 'finished' } };
  };

  const runLegacyDiscussion = async (day: number): Promise<void> => {
    const openingOrder = rotateAlive(state.players, day);
    const openingIndex = new Map(openingOrder.map((player, index) => [player.seat, index]));
    const openingPromptedBy = new Map<SeatId, SeatId>();
    const pendingReplies = new Map<SeatId, SeatId>();

    for (const [index, actor] of openingOrder.entries()) {
      const promptedBySeat = openingPromptedBy.get(actor.seat);
      const waitingForFreeReplySeats = [...pendingReplies.keys()];
      const counterTargetSeat = claimsEnabled ? directiveFor(actor, day, 'opening').counterTargetSeat : null;
      const legalTargets = openingOrder
        .filter((player) => player.seat !== actor.seat &&
          (!pendingReplies.has(player.seat) || player.seat === counterTargetSeat))
        .map((player) => player.seat);
      const discussion: DiscussionContext = {
        stage: 'opening', turn: index + 1,
        openingSpokenSeats: openingOrder.slice(0, index).map((player) => player.seat),
        ...(waitingForFreeReplySeats.length > 0 ? { waitingForFreeReplySeats } : {}),
        ...(promptedBySeat ? { promptedBySeat } : {}),
      };
      const speechContext = context(
        actor, day, 'discussion', 'speech', `d${day}-speech-opening-${actor.seat}`, legalTargets, 1, discussion,
      );
      const decision = await ai.speech(speechContext);
      if (speechContext.claimDirective) assertClaimWithinDirective(decision.claim, speechContext.claimDirective);
      const speech = normalizeSpeech(decision.speech);
      await emit(day, 'discussion', 'discussion_speech', {
        seat: actor.seat, name: actor.name, round: 1, stage: 'opening', turn: index + 1,
        speech, addressedTo: decision.addressedTo, requestsReply: decision.requestsReply,
        ...(claimsEnabled ? { claim: decision.claim ?? null } : {}),
      });
      if (claimsEnabled) {
        claimLedger = foldClaim(claimLedger, {
          seat: actor.seat, name: actor.name, day, stage: 'opening', claim: decision.claim ?? null,
        });
      }
      publicHistory.push(`${actor.name}: ${speech}`);
      openingPromptedBy.delete(actor.seat);

      if (decision.requestsReply && decision.addressedTo) {
        const targetIndex = openingIndex.get(decision.addressedTo);
        if (targetIndex !== undefined && targetIndex > index) {
          openingPromptedBy.set(decision.addressedTo, actor.seat);
        } else if (targetIndex !== undefined && !pendingReplies.has(decision.addressedTo)) {
          pendingReplies.set(decision.addressedTo, actor.seat);
        }
      }
    }

    const freeSpeechCounts = new Map<SeatId, number>();
    const polledSeats = new Set<SeatId>();
    const lastIntentSpeechCount = new Map<SeatId, number>();
    let freeSpeechCount = 0;
    let intentPolls = 0;
    let nextSpeaker: { actor: Player; discussion: DiscussionContext } | null = null;

    while (freeSpeechCount < openingOrder.length) {
      if (!nextSpeaker && claimsEnabled) {
        const mandatory = openingOrder.filter((player) =>
          (freeSpeechCounts.get(player.seat) ?? 0) < LEGACY_MAX_FREE_SPEECHES_PER_PLAYER &&
          directiveFor(player, day, 'free').mode === 'must');
        if (mandatory.length > 0) {
          const actor = stableShuffle(mandatory, seed, `claims/v1/counter-order-d${day}-t${freeSpeechCount + 1}`)[0];
          const directive = directiveFor(actor, day, 'free');
          nextSpeaker = {
            actor,
            discussion: {
              stage: 'free', turn: freeSpeechCount + 1, motivation: 'challenge',
              intendedTarget: directive.counterTargetSeat,
              ...(directive.counterTargetSeat ? { promptedBySeat: directive.counterTargetSeat } : {}),
            },
          };
        }
      }
      if (!nextSpeaker) {
        if (intentPolls >= MAX_INTENT_POLLS_PER_DAY) break;
        const pollNumber = intentPolls + 1;
        const eligible = openingOrder.filter((player) =>
          (freeSpeechCounts.get(player.seat) ?? 0) < LEGACY_MAX_FREE_SPEECHES_PER_PLAYER);
        const pollable = eligible.filter((player) =>
          pendingReplies.has(player.seat) || lastIntentSpeechCount.get(player.seat) !== freeSpeechCount);
        const shuffled = stableShuffle(pollable, seed, `d${day}-intent-candidates-p${pollNumber}`);
        const shuffledIndex = new Map(shuffled.map((player, index) => [player.seat, index]));
        const candidates = [...shuffled]
          .sort((a, b) => {
            const aPriority = pendingReplies.has(a.seat) ? 0 : polledSeats.has(a.seat) ? 2 : 1;
            const bPriority = pendingReplies.has(b.seat) ? 0 : polledSeats.has(b.seat) ? 2 : 1;
            return aPriority - bPriority || (shuffledIndex.get(a.seat) ?? 0) - (shuffledIndex.get(b.seat) ?? 0);
          })
          .slice(0, INTENT_CANDIDATES_PER_POLL);
        if (candidates.length === 0) break;
        intentPolls = pollNumber;

        const intents: Array<{ actor: Player; decision: SpeechIntentDecision; promptedBySeat?: SeatId }> = [];
        for (const actor of candidates) {
          polledSeats.add(actor.seat);
          lastIntentSpeechCount.set(actor.seat, freeSpeechCount);
          const promptedBySeat = pendingReplies.get(actor.seat);
          const legalTargets = openingOrder
            .filter((player) => player.seat !== actor.seat &&
              (freeSpeechCounts.get(player.seat) ?? 0) < LEGACY_MAX_FREE_SPEECHES_PER_PLAYER)
            .map((player) => player.seat);
          const discussion: DiscussionContext = {
            stage: 'free', turn: freeSpeechCount + 1, ...(promptedBySeat ? { promptedBySeat } : {}),
          };
          const decision = await ai.speechIntent(context(
            actor, day, 'discussion', 'speech_intent', `d${day}-speech-intent-p${intentPolls}-${actor.seat}`,
            legalTargets, undefined, discussion,
          ));
          intents.push({ actor, decision, ...(promptedBySeat ? { promptedBySeat } : {}) });
          if (decision.urgency === 0) pendingReplies.delete(actor.seat);
        }

        const selected = chooseIntent(intents, freeSpeechCounts, seed, `d${day}-intent-choice-p${intentPolls}`);
        if (!selected) continue;
        pendingReplies.delete(selected.actor.seat);
        nextSpeaker = {
          actor: selected.actor,
          discussion: {
            stage: 'free', turn: freeSpeechCount + 1,
            ...(selected.promptedBySeat ? { promptedBySeat: selected.promptedBySeat } : {}),
            motivation: selected.decision.motivation,
            intendedTarget: selected.decision.targetSeat,
          },
        };
      }

      const currentSpeaker: { actor: Player; discussion: DiscussionContext } = nextSpeaker;
      const actor = currentSpeaker.actor;
      const discussion = currentSpeaker.discussion;
      nextSpeaker = null;
      if ((freeSpeechCounts.get(actor.seat) ?? 0) >= LEGACY_MAX_FREE_SPEECHES_PER_PLAYER) continue;
      const legalTargets = openingOrder
        .filter((player) => player.seat !== actor.seat &&
          (freeSpeechCounts.get(player.seat) ?? 0) < LEGACY_MAX_FREE_SPEECHES_PER_PLAYER)
        .map((player) => player.seat);
      const speechContext = context(
        actor, day, 'discussion', 'speech', `d${day}-speech-free-t${freeSpeechCount + 1}-${actor.seat}`,
        legalTargets, 2, discussion,
      );
      const decision = await ai.speech(speechContext);
      if (speechContext.claimDirective) assertClaimWithinDirective(decision.claim, speechContext.claimDirective);
      const speech = normalizeSpeech(decision.speech);
      freeSpeechCount += 1;
      freeSpeechCounts.set(actor.seat, (freeSpeechCounts.get(actor.seat) ?? 0) + 1);
      await emit(day, 'discussion', 'discussion_speech', {
        seat: actor.seat, name: actor.name, round: 2, stage: 'free', turn: freeSpeechCount,
        speech, addressedTo: decision.addressedTo, requestsReply: decision.requestsReply,
        ...(claimsEnabled ? { claim: decision.claim ?? null } : {}),
      });
      if (claimsEnabled) {
        claimLedger = foldClaim(claimLedger, {
          seat: actor.seat, name: actor.name, day, stage: 'free', claim: decision.claim ?? null,
        });
      }
      publicHistory.push(`${actor.name}: ${speech}`);

      if (decision.requestsReply && decision.addressedTo &&
        (freeSpeechCounts.get(decision.addressedTo) ?? 0) < LEGACY_MAX_FREE_SPEECHES_PER_PLAYER) {
        const target = playerBySeat(state, decision.addressedTo);
        nextSpeaker = {
          actor: target,
          discussion: {
            stage: 'free', turn: freeSpeechCount + 1, promptedBySeat: actor.seat,
            motivation: 'reply', intendedTarget: actor.seat,
          },
        };
      }
    }

    await emit(day, 'vote', 'discussion_closed', {
      openingSpeeches: openingOrder.length, freeSpeeches: freeSpeechCount, intentPolls,
    });
  };

  await emit(0, 'setup', 'match_created', {
    seed,
    players: players.map((player) => ({ seat: player.seat, name: player.name, role: player.role })),
    ...(discussionVersion === 'v2' || discussionVersion === 'v3'
      ? { rules: { discussion: discussionVersion, ...(claimsEnabled ? { claims: 'v1' } : {}) } }
      : claimsEnabled ? { rules: { claims: 'v1' } } : {}),
  }, 'private');

  const wolves = state.players.filter((player) => player.role === 'werewolf');
  await emit(0, 'night_zero', 'werewolf_reveal', {
    wolves: wolves.map((player) => ({ seat: player.seat, name: player.name })),
  }, 'private', wolves.map((player) => player.seat));

  for (const wolf of wolves) {
    const decision = await ai.speech(context(wolf, 0, 'night_zero', 'wolf_speech', `d0-wolf-chat-${wolf.seat}`, [], 1));
    const speech = normalizeSpeech(decision.speech);
    histories.wolf.push(`${wolf.name}: ${speech}`);
    await emit(0, 'night_zero', 'werewolf_chat', {
      seat: wolf.seat, speech, round: 1, mode: 'dialogue',
    }, 'private', wolves.map((player) => player.seat));
  }

  const initialSeer = actorByRole(state, 'seer');
  if (initialSeer) {
    const target = await ai.target(context(initialSeer, 0, 'night_zero', 'seer', 'd0-seer', legalSeerTargets(state, initialSeer.seat)));
    const result = isWerewolfResult(playerBySeat(state, target.targetSeat).role);
    histories.seer.push(`${seatName(target.targetSeat)}: ${result}`);
    if (discussionVersion === 'v3') histories.seer.push(`0日目に${seatName(target.targetSeat)}を占った理由: ${target.statedReason}`);
    claimResults.get(initialSeer.seat)?.seer.push({ day: 0, targetSeat: target.targetSeat, verdict: result });
    await emit(0, 'night_zero', 'seer_result', { seat: initialSeer.seat, targetSeat: target.targetSeat, result }, 'private', [initialSeer.seat]);
  }

  if (claimsEnabled) {
    const aliveSeats = state.players.filter((player) => player.alive).map((player) => player.seat);
    const wolfSeats = wolves.map((player) => player.seat);
    for (const actor of state.players.filter((player) => ['madman', 'werewolf'].includes(player.role))) {
      const result = actor.role === 'madman'
        ? planMadmanSeerFake(seed, actor.seat, 0, aliveSeats)
        : planWolfSeerFake(seed, actor.seat, 0, aliveSeats, wolfSeats.filter((seat) => seat !== actor.seat));
      const history = claimResults.get(actor.seat)?.seer;
      if (history) history.push(preserveFakeResultConsistency(history, result));
    }
  }

  for (let day = 1; day <= MAX_DAYS; day += 1) {
    discussionBoard = emptyDiscussionBoard();
    if (pendingVictim) {
      state = { ...state, players: state.players.map((player) => player.seat === pendingVictim ? { ...player, alive: false } : player) };
    }
    if (day > 1 || options.includeDayOneDawn) {
      await emit(day, 'dawn', 'dawn', { victim: pendingVictim, message: pendingVictim ? `${seatName(pendingVictim)}が犠牲になりました。` : '犠牲者はいません。' });
      publicHistory.push(pendingVictim ? `${seatName(pendingVictim)}が襲撃で死亡` : '夜の犠牲者なし');
    }
    const dawnWinner = checkVictory(state);
    if (dawnWinner) return finish(dawnWinner, day);

    if (discussionVersion === 'legacy') {
      await runLegacyDiscussion(day);
    } else {
      const speakers = state.players.filter((player) => player.alive);
      const { minimum: minimumSpeeches, maximum: maximumSpeeches } = discussionSpeechLimits(speakers.length);
      const speechCounts = new Map<SeatId, number>();
      const polledSeats = new Set<SeatId>();
      const lastIntentSpeechCount = new Map<SeatId, number>();
      const defenseScheduledSeats = new Set<SeatId>();
      const consensusDefenseScheduledSeats = new Set<SeatId>();
      const recentSpeakerSeats: SeatId[] = [];
      let speechCount = 0;
      let consensusDefenseExtraSpeeches = 0;
      let intentPolls = 0;
      let nextSpeaker: ScheduledDiscussionSpeaker | null = {
        actor: stableShuffle(speakers, seed, `d${day}-first-speaker`)[0],
        motivation: 'new_information',
      };

      while (speechCount < maximumSpeeches + 1) {
        if (!nextSpeaker) {
          if (claimsEnabled && speechCount < maximumSpeeches + consensusDefenseExtraSpeeches) {
            const mandatory = speakers.filter((player) => {
              const count = speechCounts.get(player.seat) ?? 0;
              const stage = count === 0 ? 'opening' : 'free';
              return canSpeakAfter(recentSpeakerSeats, player.seat) &&
                count < MAX_SPEECHES_PER_PLAYER && directiveFor(player, day, stage).mode === 'must';
            });
            if (mandatory.length > 0) {
              const actor = stableShuffle(mandatory, seed, `claims/v1/counter-order-d${day}-t${speechCount + 1}`)[0];
              const stage = (speechCounts.get(actor.seat) ?? 0) === 0 ? 'opening' : 'free';
              const directive = directiveFor(actor, day, stage);
              nextSpeaker = {
                actor,
                motivation: 'challenge',
                intendedTarget: directive.counterTargetSeat,
                ...(directive.counterTargetSeat ? { promptedBySeat: directive.counterTargetSeat } : {}),
              };
            }
          }
        }
        if (!nextSpeaker && discussionVersion === 'v3') {
          const consensus = consensusVoteTarget(discussionBoard);
          const actor = consensus ? speakers.find((player) => player.seat === consensus) : undefined;
          const actorSpeechCount = actor ? (speechCounts.get(actor.seat) ?? 0) : 0;
          if (actor && !consensusDefenseScheduledSeats.has(actor.seat) &&
            canSpeakAfter(recentSpeakerSeats, actor.seat) &&
            actorSpeechCount >= 1 && actorSpeechCount < MAX_SPEECHES_PER_PLAYER + 1) {
            consensusDefenseScheduledSeats.add(actor.seat);
            nextSpeaker = {
              actor,
              motivation: 'challenge',
              consensusDefense: true,
              allowExtraSpeech: actorSpeechCount >= MAX_SPEECHES_PER_PLAYER,
            };
          }
        }
        if (!nextSpeaker && speechCount >= maximumSpeeches + consensusDefenseExtraSpeeches) break;
        if (!nextSpeaker) {
          if (discussionVersion === 'v3') {
            const defenseCandidates = speakers.filter((player) =>
              canSpeakAfter(recentSpeakerSeats, player.seat) &&
              !defenseScheduledSeats.has(player.seat) &&
              (speechCounts.get(player.seat) ?? 0) === 1 &&
              (suspicionCountFor(discussionBoard, player.seat) >= 2 || voteIntentCountFor(discussionBoard, player.seat) >= 3));
            if (defenseCandidates.length > 0) {
              const actor = stableShuffle(defenseCandidates, seed, `discussion/v3/defense-d${day}-t${speechCount + 1}`)[0];
              defenseScheduledSeats.add(actor.seat);
              nextSpeaker = { actor, motivation: 'challenge' };
            }
          }
        }
        if (!nextSpeaker) {
          const unspoken = speakers.filter((player) =>
            canSpeakAfter(recentSpeakerSeats, player.seat) && (speechCounts.get(player.seat) ?? 0) === 0);
          if (speechCount < minimumSpeeches || unspoken.length > 0) {
            const eligible = speakers.filter((player) =>
              canSpeakAfter(recentSpeakerSeats, player.seat) &&
              (speechCounts.get(player.seat) ?? 0) < MAX_SPEECHES_PER_PLAYER);
            const consensus = consensusVoteTarget(discussionBoard);
            const consensusUnspoken = consensus ? unspoken.filter((player) => player.seat === consensus) : [];
            const pool = consensusUnspoken.length > 0 ? consensusUnspoken : unspoken.length > 0 ? unspoken : eligible;
            if (pool.length === 0) break;
            nextSpeaker = {
              actor: stableShuffle(pool, seed, `d${day}-scheduled-speaker-t${speechCount + 1}`)[0],
              motivation: 'new_information',
            };
            continue;
          }
          if (intentPolls >= MAX_INTENT_POLLS_PER_DAY) break;
          const pollNumber = intentPolls + 1;

          const eligible = speakers.filter((player) =>
            canSpeakAfter(recentSpeakerSeats, player.seat) &&
            (speechCounts.get(player.seat) ?? 0) < MAX_SPEECHES_PER_PLAYER);
          const pollable = eligible.filter((player) => lastIntentSpeechCount.get(player.seat) !== speechCount);
          const shuffled = stableShuffle(pollable, seed, `d${day}-intent-candidates-p${pollNumber}`);
          const shuffledIndex = new Map(shuffled.map((player, index) => [player.seat, index]));
          const candidates = [...shuffled]
            .sort((a, b) => {
              const consensus = consensusVoteTarget(discussionBoard);
              const aRepeatsConsensus = consensus && priorVoteIntentFor(discussionBoard, a.seat) === consensus ? 1 : 0;
              const bRepeatsConsensus = consensus && priorVoteIntentFor(discussionBoard, b.seat) === consensus ? 1 : 0;
              const aPriority = aRepeatsConsensus * 2 + (polledSeats.has(a.seat) ? 1 : 0);
              const bPriority = bRepeatsConsensus * 2 + (polledSeats.has(b.seat) ? 1 : 0);
              return aPriority - bPriority || (shuffledIndex.get(a.seat) ?? 0) - (shuffledIndex.get(b.seat) ?? 0);
            })
            .slice(0, INTENT_CANDIDATES_PER_POLL);
          if (candidates.length === 0) break;
          intentPolls = pollNumber;

          const intents: Array<{ actor: Player; decision: SpeechIntentDecision; promptedBySeat?: SeatId }> = [];
          for (const actor of candidates) {
            polledSeats.add(actor.seat);
            lastIntentSpeechCount.set(actor.seat, speechCount);
            const legalTargets = speakers
              .filter((player) => player.seat !== actor.seat &&
                player.seat !== recentSpeakerSeats.at(-1) &&
                (speechCounts.get(player.seat) ?? 0) < MAX_SPEECHES_PER_PLAYER)
              .map((player) => player.seat);
            const discussion: DiscussionContext = {
              stage: (speechCounts.get(actor.seat) ?? 0) === 0 ? 'opening' : 'free',
              turn: speechCount + 1,
            };
            const decision = await ai.speechIntent(context(
              actor, day, 'discussion', 'speech_intent', `d${day}-speech-intent-p${intentPolls}-${actor.seat}`,
              legalTargets, undefined, discussion,
            ));
            intents.push({ actor, decision });
          }

          const selected = chooseIntent(intents, speechCounts, seed, `d${day}-intent-choice-p${intentPolls}`);
          if (!selected) continue;
          nextSpeaker = {
            actor: selected.actor,
            motivation: selected.decision.motivation,
            intendedTarget: selected.decision.targetSeat,
          };
        }

        const currentSpeaker: ScheduledDiscussionSpeaker = nextSpeaker;
        const actor = currentSpeaker.actor;
        nextSpeaker = null;
        if (!canSpeakAfter(recentSpeakerSeats, actor.seat)) continue;
        const actorSpeechCount = speechCounts.get(actor.seat) ?? 0;
        const actorSpeechLimit = currentSpeaker.allowExtraSpeech
          ? MAX_SPEECHES_PER_PLAYER + 1
          : MAX_SPEECHES_PER_PLAYER;
        if (actorSpeechCount >= actorSpeechLimit) continue;
        const stage = actorSpeechCount === 0 ? 'opening' : 'free';
        const canRequestReply = speechCount + 1 < maximumSpeeches && speakers.some((player) =>
          player.seat !== actor.seat && player.seat !== recentSpeakerSeats.at(-1) &&
          (speechCounts.get(player.seat) ?? 0) < MAX_SPEECHES_PER_PLAYER);
        const legalTargets = speakers
          .filter((player) => canRequestReply && player.seat !== actor.seat &&
            player.seat !== recentSpeakerSeats.at(-1) &&
            (speechCounts.get(player.seat) ?? 0) < MAX_SPEECHES_PER_PLAYER)
          .map((player) => player.seat);
        const spokenSeats = speakers.filter((player) => (speechCounts.get(player.seat) ?? 0) > 0).map((player) => player.seat);
        const remainingUnspokenSeats = speakers.filter((player) => (speechCounts.get(player.seat) ?? 0) === 0).map((player) => player.seat);
        const discussion: DiscussionContext = {
          stage,
          turn: speechCount + 1,
          spokenSeats,
          remainingUnspokenSeats,
          canRequestReply,
          ...(currentSpeaker.promptedBySeat ? { promptedBySeat: currentSpeaker.promptedBySeat } : {}),
          ...(currentSpeaker.motivation ? { motivation: currentSpeaker.motivation } : {}),
          ...(currentSpeaker.consensusDefense ? { consensusDefense: true } : {}),
          ...('intendedTarget' in currentSpeaker ? { intendedTarget: currentSpeaker.intendedTarget } : {}),
        };
        const speechContext = context(
          actor, day, 'discussion', 'speech', `d${day}-speech-t${speechCount + 1}-${actor.seat}`,
          legalTargets, actorSpeechCount + 1, discussion,
        );
        const decision = await ai.speech(speechContext);
        if (speechContext.claimDirective) assertClaimWithinDirective(decision.claim, speechContext.claimDirective);
        if (discussionVersion === 'v3' && !decision.structure) throw new Error('DISCUSSION_V3_STRUCTURE_REQUIRED');
        if (discussionVersion === 'v3' && decision.structure) {
          decision.structure = sanitizeEchoSourceSeat(
            discussionBoard, claimLedger, actor.seat, decision.structure,
          );
        }
        const speech = normalizeSpeech(decision.speech);
        speechCount += 1;
        if (currentSpeaker.allowExtraSpeech && actorSpeechCount >= MAX_SPEECHES_PER_PLAYER) {
          consensusDefenseExtraSpeeches += 1;
        }
        speechCounts.set(actor.seat, actorSpeechCount + 1);
        await emit(day, 'discussion', 'discussion_speech', {
          seat: actor.seat, name: actor.name, round: actorSpeechCount + 1, stage, turn: speechCount,
          speech, addressedTo: decision.addressedTo, requestsReply: decision.requestsReply,
          ...(claimsEnabled ? { claim: decision.claim ?? null } : {}),
          ...(discussionVersion === 'v3' ? { structure: decision.structure } : {}),
          ...(decision.contributionDemoted ? { contributionDemoted: true } : {}),
        });
        if (claimsEnabled) {
          claimLedger = foldClaim(claimLedger, {
            seat: actor.seat, name: actor.name, day, stage, claim: decision.claim ?? null,
          });
        }
        publicHistory.push(`${actor.name}: ${speech}`);
        rememberSpeaker(recentSpeakerSeats, actor.seat);
        if (discussionVersion === 'v3' && decision.structure) {
          discussionBoard = foldDiscussionBoard(discussionBoard, actor.seat, decision.structure, decision.requestsReply);
        }

        if (decision.requestsReply && decision.addressedTo &&
          canSpeakAfter(recentSpeakerSeats, decision.addressedTo) &&
          (speechCounts.get(decision.addressedTo) ?? 0) < MAX_SPEECHES_PER_PLAYER) {
          const target = playerBySeat(state, decision.addressedTo);
          nextSpeaker = {
            actor: target,
            promptedBySeat: actor.seat,
            motivation: 'reply',
            intendedTarget: actor.seat,
          };
        }
      }

      const openingSpeeches = [...speechCounts.values()].filter((count) => count >= 1).length;
      await emit(day, 'vote', 'discussion_closed', {
        openingSpeeches,
        freeSpeeches: speechCount - openingSpeeches,
        totalSpeeches: speechCount,
        minimumSpeeches,
        maximumSpeeches,
        consensusDefenseExtraSpeeches,
        intentPolls,
      });
    }

    const alive = rotateAlive(state.players, day);
    const votes: Array<{ voter: SeatId; target: SeatId; statedReason: string }> = [];
    for (const actor of alive) {
      const decision = await ai.target(context(actor, day, 'vote', 'vote', `d${day}-vote-${actor.seat}`, legalVoteTargets(state, actor.seat)));
      votes.push({ voter: actor.seat, target: decision.targetSeat, statedReason: decision.statedReason });
      await emit(day, 'vote', 'vote_cast', { voter: actor.seat, target: decision.targetSeat, statedReason: decision.statedReason }, 'private');
    }
    const tally = countVotes(votes);
    await emit(day, 'vote', 'vote_reveal', { round: 1, votes, tally });
    publicHistory.push(`投票: ${votes.map((vote) => `${seatName(vote.voter)}→${seatName(vote.target)}`).join(', ')}`);
    let candidates = topCandidates(tally);
    let executed: SeatId | null = candidates.length === 1 ? candidates[0] : null;

    if (candidates.length > 1) {
      const runoffVotes: Array<{ voter: SeatId; target: SeatId; statedReason: string }> = [];
      for (const actor of alive) {
        const legal = legalVoteTargets(state, actor.seat, candidates);
        if (legal.length === 0) continue;
        const decision = await ai.target(context(actor, day, 'runoff', 'runoff_vote', `d${day}-runoff-${actor.seat}`, legal));
        runoffVotes.push({ voter: actor.seat, target: decision.targetSeat, statedReason: decision.statedReason });
        await emit(day, 'runoff', 'vote_cast', { voter: actor.seat, target: decision.targetSeat, statedReason: decision.statedReason }, 'private');
      }
      const runoffTally = countVotes(runoffVotes);
      candidates = topCandidates(runoffTally);
      await emit(day, 'runoff', 'vote_reveal', { round: 2, votes: runoffVotes, tally: runoffTally });
      executed = candidates.length === 1 ? candidates[0] : null;
    }

    await emit(day, 'execution', 'execution', { seat: executed, message: executed ? `${seatName(executed)}が処刑されました。` : '同数のため処刑はありません。' });
    if (executed) {
      state = { ...state, lastExecuted: executed, players: state.players.map((player) => player.seat === executed ? { ...player, alive: false } : player) };
      publicHistory.push(`${seatName(executed)}が処刑`);
    } else {
      state = { ...state, lastExecuted: null };
      publicHistory.push('処刑なし');
    }
    const executionWinner = checkVictory(state);
    if (executionWinner) return finish(executionWinner, day);
    if (day === MAX_DAYS) return finish('draw', day, true);

    const medium = actorByRole(state, 'medium');
    if (medium) {
      const result = executed ? isWerewolfResult(playerBySeat(state, executed).role) : '判定対象なし';
      histories.medium.push(executed ? `${seatName(executed)}: ${result}` : result);
      if (executed) claimResults.get(medium.seat)?.medium.push({
        day, targetSeat: executed, verdict: isWerewolfResult(playerBySeat(state, executed).role),
      });
      await emit(day, 'medium', 'medium_result', { seat: medium.seat, targetSeat: executed, result }, 'private', [medium.seat]);
    }

    if (claimsEnabled && executed) {
      const wolfSeats = state.players.filter((player) => player.role === 'werewolf').map((player) => player.seat);
      for (const actor of state.players.filter((player) => player.alive && ['madman', 'werewolf'].includes(player.role))) {
        const result = actor.role === 'madman'
          ? planMadmanMediumFake(seed, actor.seat, day, executed)
          : planWolfMediumFake(seed, actor.seat, day, executed, wolfSeats.filter((seat) => seat !== actor.seat));
        claimResults.get(actor.seat)?.medium.push(result);
      }
    }

    const livingWolves = state.players.filter((player) => player.alive && player.role === 'werewolf');
    const wolfChatRounds = livingWolves.length === 1 ? 1 : 2;
    for (let round = 1; round <= wolfChatRounds; round += 1) {
      for (const wolf of livingWolves) {
        const decision = await ai.speech(context(wolf, day, 'wolf_chat', 'wolf_speech', `d${day}-wolf-chat-r${round}-${wolf.seat}`, [], round));
        const speech = normalizeSpeech(decision.speech);
        histories.wolf.push(`${wolf.name}: ${speech}`);
        await emit(day, 'wolf_chat', 'werewolf_chat', {
          seat: wolf.seat,
          speech,
          round,
          mode: livingWolves.length === 1 ? 'monologue' : 'dialogue',
        }, 'private', livingWolves.map((player) => player.seat));
      }
    }

    const attackChoices: SeatId[] = [];
    for (const wolf of livingWolves) {
      const decision = await ai.target(context(wolf, day, 'night_actions', 'attack', `d${day}-attack-${wolf.seat}`, legalAttackTargets(state)));
      attackChoices.push(decision.targetSeat);
      await emit(day, 'night_actions', 'attack_choice', { seat: wolf.seat, targetSeat: decision.targetSeat, statedReason: decision.statedReason }, 'private', livingWolves.map((player) => player.seat));
    }
    let attackTarget = attackChoices[0];
    if (attackChoices.length > 1 && new Set(attackChoices).size > 1) {
      const decider = [...livingWolves].sort((a, b) => a.seat.localeCompare(b.seat))[0];
      const legal = [...new Set(attackChoices)];
      const decision = await ai.target(context(decider, day, 'night_actions', 'attack_final', `d${day}-attack-final`, legal));
      attackTarget = decision.targetSeat;
      await emit(day, 'night_actions', 'decision_note', { kind: 'attack_final', seat: decider.seat, targetSeat: attackTarget, statedReason: decision.statedReason }, 'private');
    }

    let seerTarget: SeatId | null = null;
    const seer = actorByRole(state, 'seer');
    if (seer) {
      const decision = await ai.target(context(seer, day, 'night_actions', 'seer', `d${day}-seer`, legalSeerTargets(state, seer.seat)));
      seerTarget = decision.targetSeat;
      const result = isWerewolfResult(playerBySeat(state, seerTarget).role);
      histories.seer.push(`${seatName(seerTarget)}: ${result}`);
      if (discussionVersion === 'v3') histories.seer.push(`${day}日目に${seatName(seerTarget)}を占った理由: ${decision.statedReason}`);
      claimResults.get(seer.seat)?.seer.push({ day, targetSeat: seerTarget, verdict: result });
      await emit(day, 'night_actions', 'seer_result', { seat: seer.seat, targetSeat: seerTarget, result }, 'private', [seer.seat]);
    }


    if (claimsEnabled) {
      const aliveSeats = state.players.filter((player) => player.alive).map((player) => player.seat);
      const wolfSeats = state.players.filter((player) => player.role === 'werewolf').map((player) => player.seat);
      for (const actor of state.players.filter((player) => player.alive && ['madman', 'werewolf'].includes(player.role))) {
        const result = actor.role === 'madman'
          ? planMadmanSeerFake(seed, actor.seat, day, aliveSeats)
          : planWolfSeerFake(seed, actor.seat, day, aliveSeats, wolfSeats.filter((seat) => seat !== actor.seat));
        const history = claimResults.get(actor.seat)?.seer;
        if (history) history.push(preserveFakeResultConsistency(history, result));
      }
    }

    let guardTarget: SeatId | null = null;
    const guard = actorByRole(state, 'bodyguard');
    if (guard) {
      const decision = await ai.target(context(guard, day, 'night_actions', 'guard', `d${day}-guard`, legalGuardTargets(state)));
      guardTarget = decision.targetSeat;
      state = { ...state, lastGuard: guardTarget };
      await emit(day, 'night_actions', 'guard_choice', { seat: guard.seat, targetSeat: guardTarget, statedReason: decision.statedReason }, 'private', [guard.seat]);
    }

    const guarded = guardTarget === attackTarget;
    pendingVictim = guarded ? null : attackTarget;
    histories.wolfAttack.push(`${day}日目の最終襲撃: ${seatName(attackTarget)} → ${guarded ? '護衛され襲撃失敗' : '襲撃成功'}`);
    if (guardTarget) {
      histories.guard.push(`${day}日目: ${seatName(guardTarget)}を護衛 → ${guarded ? '護衛成功' : '護衛対象への襲撃なし'}`);
    }
    await emit(day, 'night_actions', 'night_resolved', {
      attackTarget, guardTarget, seerTarget, victim: pendingVictim, guarded,
    }, 'private');
  }

  return finish('draw', MAX_DAYS, true);
}
