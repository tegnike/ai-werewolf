import { MAX_DAYS } from '@/domain/constants';
import type {
  DecisionContext, DecisionProvider, GameState, MatchEvent, Player, RunHooks, SeatId, Winner,
} from '@/domain/types';
import { legalAttackTargets, legalGuardTargets, legalSeerTargets, legalVoteTargets } from './legal';
import { normalizeSpeech, seatName } from './narration';
import { setupPlayers } from './setup';
import { createInitialState } from './state';
import { checkVictory, isWerewolfResult } from './victory';

export interface SimulationResult { winner: Winner; day: number; state: GameState }

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

function privateFactsFor(
  actor: Player,
  state: GameState,
  histories: { seer: string[]; medium: string[]; guard: string[]; wolf: string[] },
): string[] {
  const facts = [`自分の役職: ${actor.role}`];
  if (actor.role === 'werewolf') {
    facts.push(`仲間: ${state.players.filter((player) => player.role === 'werewolf' && player.seat !== actor.seat).map((player) => player.name).join(', ')}`);
    facts.push(...histories.wolf.slice(-20));
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
  options: { includeDayOneDawn?: boolean } = {},
): Promise<SimulationResult> {
  const players = setupPlayers(seed);
  let state = createInitialState(players);
  const publicHistory: string[] = [];
  const histories = { seer: [] as string[], medium: [] as string[], guard: [] as string[], wolf: [] as string[] };
  let pendingVictim: SeatId | null = null;

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
  ): DecisionContext => ({
    matchId, seed, day, phase, kind, callKey, actor,
    players: state.players.map((player) => ({ ...player })), legalTargets,
    publicHistory: [...publicHistory], privateFacts: privateFactsFor(actor, state, histories), round,
  });

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

  await emit(0, 'setup', 'match_created', {
    seed,
    players: players.map((player) => ({ seat: player.seat, name: player.name, role: player.role })),
  }, 'private');

  const wolves = state.players.filter((player) => player.role === 'werewolf');
  await emit(0, 'night_zero', 'werewolf_reveal', {
    wolves: wolves.map((player) => ({ seat: player.seat, name: player.name })),
  }, 'private', wolves.map((player) => player.seat));

  for (const wolf of wolves) {
    const decision = await ai.speech(context(wolf, 0, 'night_zero', 'wolf_speech', `d0-wolf-chat-${wolf.seat}`, [], 1));
    const speech = normalizeSpeech(decision.speech);
    histories.wolf.push(`${wolf.name}: ${speech}`);
    await emit(0, 'night_zero', 'werewolf_chat', { seat: wolf.seat, speech, round: 1 }, 'private', wolves.map((player) => player.seat));
  }

  const initialSeer = actorByRole(state, 'seer');
  if (initialSeer) {
    const target = await ai.target(context(initialSeer, 0, 'night_zero', 'seer', 'd0-seer', legalSeerTargets(state, initialSeer.seat)));
    const result = isWerewolfResult(playerBySeat(state, target.targetSeat).role);
    histories.seer.push(`${seatName(target.targetSeat)}: ${result}`);
    await emit(0, 'night_zero', 'seer_result', { seat: initialSeer.seat, targetSeat: target.targetSeat, result }, 'private', [initialSeer.seat]);
  }

  for (let day = 1; day <= MAX_DAYS; day += 1) {
    if (pendingVictim) {
      state = { ...state, players: state.players.map((player) => player.seat === pendingVictim ? { ...player, alive: false } : player) };
    }
    if (day > 1 || options.includeDayOneDawn) {
      await emit(day, 'dawn', 'dawn', { victim: pendingVictim, message: pendingVictim ? `${seatName(pendingVictim)}が犠牲になりました。` : '犠牲者はいません。' });
      publicHistory.push(pendingVictim ? `${seatName(pendingVictim)}が襲撃で死亡` : '夜の犠牲者なし');
    }
    const dawnWinner = checkVictory(state);
    if (dawnWinner) return finish(dawnWinner, day);

    for (let round = 1; round <= 2; round += 1) {
      for (const actor of rotateAlive(state.players, day)) {
        const decision = await ai.speech(context(actor, day, 'discussion', 'speech', `d${day}-speech-r${round}-${actor.seat}`, [], round));
        const speech = normalizeSpeech(decision.speech);
        await emit(day, 'discussion', 'discussion_speech', { seat: actor.seat, name: actor.name, round, speech });
        publicHistory.push(`${actor.name}: ${speech}`);
      }
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
      await emit(day, 'medium', 'medium_result', { seat: medium.seat, targetSeat: executed, result }, 'private', [medium.seat]);
    }

    const livingWolves = state.players.filter((player) => player.alive && player.role === 'werewolf');
    for (let round = 1; round <= 2; round += 1) {
      for (const wolf of livingWolves) {
        const decision = await ai.speech(context(wolf, day, 'wolf_chat', 'wolf_speech', `d${day}-wolf-chat-r${round}-${wolf.seat}`, [], round));
        const speech = normalizeSpeech(decision.speech);
        histories.wolf.push(`${wolf.name}: ${speech}`);
        await emit(day, 'wolf_chat', 'werewolf_chat', { seat: wolf.seat, speech, round }, 'private', livingWolves.map((player) => player.seat));
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
      await emit(day, 'night_actions', 'seer_result', { seat: seer.seat, targetSeat: seerTarget, result }, 'private', [seer.seat]);
    }

    let guardTarget: SeatId | null = null;
    const guard = actorByRole(state, 'bodyguard');
    if (guard) {
      const decision = await ai.target(context(guard, day, 'night_actions', 'guard', `d${day}-guard`, legalGuardTargets(state)));
      guardTarget = decision.targetSeat;
      state = { ...state, lastGuard: guardTarget };
      histories.guard.push(`${day}日目: ${seatName(guardTarget)}を護衛`);
      await emit(day, 'night_actions', 'guard_choice', { seat: guard.seat, targetSeat: guardTarget, statedReason: decision.statedReason }, 'private', [guard.seat]);
    }

    pendingVictim = guardTarget === attackTarget ? null : attackTarget;
    await emit(day, 'night_actions', 'night_resolved', {
      attackTarget, guardTarget, seerTarget, victim: pendingVictim, guarded: guardTarget === attackTarget,
    }, 'private');
  }

  return finish('draw', MAX_DAYS, true);
}
