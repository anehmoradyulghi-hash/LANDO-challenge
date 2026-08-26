import { z } from "zod";

export const ChallengeNameSchema = z.string().trim().min(3).max(80);
export const ChallengeDescriptionSchema = z.string().trim().max(1024);
export const ChallengeRulesSchema = z.string().trim().max(2048);

export const CustomDateTimeSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date/time" });

export const PositiveIntSchema = z.coerce.number().int().min(0).max(1_000_000);

export const WinnerCountSchema = z.coerce.number().int().min(1).max(100_000);

export const PrizeAmountSchema = z.coerce.number().int().min(1).max(10_000_000);

export const ChannelHandleSchema = z
  .string()
  .trim()
  .refine((v) => v.startsWith("@") || /^-100\d+$/.test(v) || /^\d+$/.test(v), {
    message: "Must be a @username or a numeric channel id",
  });

export function parseRankedPrizeTable(
  input: { rank: number; amount: number }[],
  winnerCount: number
): { ok: true } | { ok: false; error: string } {
  // section 17/22: Publish forbidden if prize distribution is inconsistent.
  if (input.length !== winnerCount) {
    return { ok: false, error: "PRIZE_TABLE_RANK_COUNT_MISMATCH" };
  }
  const ranks = new Set(input.map((e) => e.rank));
  if (ranks.size !== winnerCount) {
    return { ok: false, error: "PRIZE_TABLE_DUPLICATE_RANKS" };
  }
  for (const e of input) {
    if (e.rank < 1 || e.rank > winnerCount) return { ok: false, error: "PRIZE_TABLE_RANK_OUT_OF_RANGE" };
    if (e.amount <= 0) return { ok: false, error: "PRIZE_TABLE_INVALID_AMOUNT" };
  }
  return { ok: true };
}
