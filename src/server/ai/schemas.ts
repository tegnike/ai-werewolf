import { z } from 'zod';
import { SEATS } from '@/domain/constants';
import type { SeatId } from '@/domain/types';

const motivationSchema = z.enum(['reply', 'question', 'challenge', 'new_information', 'clarify', 'none']);

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

export function speechDecisionSchema(legalSeats: SeatId[], withClaim = false, allowReply = true) {
  const base = {
    speech: z.string().max(200),
    addressedTo: nullableSeatSchema(legalSeats),
    requestsReply: allowReply ? z.boolean() : z.literal(false),
  };
  return z.object(withClaim ? { ...base, claim: speechClaimSchema } : base);
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
