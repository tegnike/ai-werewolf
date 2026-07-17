import { z } from 'zod';
import { SEATS } from '@/domain/constants';
import type { QuestionTopic, SeatId } from '@/domain/types';

const motivationSchema = z.enum(['reply', 'question', 'challenge', 'new_information', 'clarify', 'none']);
const speechActSchema = z.enum(['role_claim', 'question', 'answer', 'suspicion', 'defense', 'vote_intent', 'board_analysis', 'agreement', 'other']);
const questionTopicSchema = z.enum(['inspection_reason', 'claim_timing', 'counterclaim_reason', 'execution_policy', 'vote_plan', 'gray_read', 'defense', 'other']);
const suspicionBasisSchema = z.enum(['speech_content', 'timing', 'interaction', 'vote_plan', 'role_claim', 'result', 'intuition']);

function nullableSeatSchema(legalSeats: SeatId[]) {
  return legalSeats.length > 0
    ? z.enum(legalSeats as [SeatId, ...SeatId[]]).nullable()
    : z.null();
}

const claimResultSchema = z.object({
  day: z.number().int().min(0).max(8),
  targetSeat: z.enum(SEATS as [SeatId, ...SeatId[]]),
  verdict: z.enum(['人狼', '人狼ではない']),
});

const speechClaimSchema = z.object({
  claimedRole: z.enum(['seer', 'medium']),
  results: z.array(claimResultSchema),
}).nullable();

export function speechDecisionSchema(
  legalSeats: SeatId[],
  withClaim = false,
  allowReply = true,
  structureSeats?: SeatId[],
  closedQuestionTopics: QuestionTopic[] = [],
  blockedVoteIntentTargets: SeatId[] = [],
) {
  const base = {
    speech: z.string().max(200),
    addressedTo: nullableSeatSchema(legalSeats),
    requestsReply: allowReply ? z.boolean() : z.literal(false),
  };
  const structure = structureSeats ? z.object({
    primaryAct: speechActSchema,
    questionTopic: questionTopicSchema.nullable(),
    suspicion: structureSeats.length > 0 ? z.object({
      targetSeat: z.enum(structureSeats as [SeatId, ...SeatId[]]),
      basis: suspicionBasisSchema,
    }).nullable() : z.null(),
    voteIntent: nullableSeatSchema(structureSeats.filter((seat) => !blockedVoteIntentTargets.includes(seat))),
    boardAnalysis: z.boolean(),
  }) : null;
  const shape = withClaim ? { ...base, claim: speechClaimSchema } : base;
  return z.object(structure ? { ...shape, structure } : shape).superRefine((decision, context) => {
    if (decision.requestsReply && decision.addressedTo === null) {
      context.addIssue({ code: 'custom', path: ['requestsReply'], message: '返答要求には宛先が必要です。' });
    }
    if (!('structure' in decision) || !decision.structure) return;
    if (decision.requestsReply && decision.structure.questionTopic === null) {
      context.addIssue({ code: 'custom', path: ['structure', 'questionTopic'], message: '返答を求める質問には話題分類が必要です。' });
    }
    if (decision.requestsReply && decision.structure.questionTopic && closedQuestionTopics.includes(decision.structure.questionTopic)) {
      context.addIssue({ code: 'custom', path: ['structure', 'questionTopic'], message: 'この質問分類はすでに十分に尋ねられています。再質問せず、別の評価・反論・投票方針を示してください。' });
    }
    if (['question', 'answer'].includes(decision.structure.primaryAct) && decision.structure.questionTopic === null) {
      context.addIssue({ code: 'custom', path: ['structure', 'questionTopic'], message: '質問または回答には話題分類が必要です。' });
    }
    if (decision.structure.primaryAct === 'suspicion' && decision.structure.suspicion === null) {
      context.addIssue({ code: 'custom', path: ['structure', 'suspicion'], message: '疑いを主目的にする場合は対象と根拠分類が必要です。' });
    }
    if (decision.structure.primaryAct === 'vote_intent' && decision.structure.voteIntent === null) {
      context.addIssue({ code: 'custom', path: ['structure', 'voteIntent'], message: '投票予定を主目的にする場合は対象が必要です。' });
    }
    if ('claim' in decision && decision.claim !== null && decision.structure.primaryAct !== 'role_claim') {
      context.addIssue({ code: 'custom', path: ['structure', 'primaryAct'], message: '役職を名乗る発言の主目的はrole_claimです。' });
    }
  });
}

export function speechIntentDecisionSchema(legalSeats: SeatId[]) {
  return z.object({
    urgency: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    motivation: motivationSchema,
    targetSeat: nullableSeatSchema(legalSeats),
  });
}

export function targetDecisionSchema(legalSeats: SeatId[]) {
  if (legalSeats.length === 0) throw new Error('No legal target');
  return z.object({
    targetSeat: z.enum(legalSeats as [SeatId, ...SeatId[]]),
    statedReason: z.string().max(120),
  });
}
