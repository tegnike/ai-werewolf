import { z } from 'zod';
import { SEATS } from '@/domain/constants';
import type { SeatId } from '@/domain/types';

const motivationSchema = z.enum(['reply', 'question', 'challenge', 'new_information', 'clarify', 'none']);
const speechActSchema = z.enum(['role_claim', 'question', 'answer', 'suspicion', 'defense', 'vote_intent', 'board_analysis', 'agreement', 'other']);
const questionTopicSchema = z.enum(['inspection_reason', 'claim_timing', 'counterclaim_reason', 'execution_policy', 'vote_plan', 'gray_read', 'defense', 'other']);
const suspicionBasisSchema = z.enum([
  'speech_content', 'statement_slip', 'reasoning_quality',
  'timing', 'interaction', 'vote_plan', 'role_claim', 'result', 'intuition',
]);

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
      echoSourceSeat: z.enum(SEATS as [SeatId, ...SeatId[]]).nullable(),
      evidenceDay: z.number().int().min(0).max(8).nullable(),
    }).nullable() : z.null(),
    voteIntent: nullableSeatSchema(structureSeats),
    boardAnalysis: z.boolean(),
  }) : null;
  const shape = withClaim ? { ...base, claim: speechClaimSchema } : base;
  return z.object(structure ? { ...shape, structure } : shape);
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
