import { prisma } from "@/database/prisma";
import { PointType, Prisma } from "@prisma/client";
import { incrementPointsAndReferrals } from "@/repositories/participant.repository";

/**
 * Awards points idempotently. The unique constraint on
 * (challengeId, userId, type, referenceId) guarantees a given event
 * (e.g. one specific referral) can never be rewarded twice (section 28).
 *
 * Returns true if points were newly awarded, false if this was a no-op duplicate.
 */
export async function awardPointsOnce(params: {
  challengeId: string;
  userId: string;
  type: PointType;
  points: number;
  referenceId: string;
  metadata?: Record<string, unknown>;
  referralsDelta?: number;
}): Promise<boolean> {
  try {
    await prisma.$transaction([
      prisma.challengePoint.create({
        data: {
          challengeId: params.challengeId,
          userId: params.userId,
          type: params.type,
          points: params.points,
          referenceId: params.referenceId,
          metadata: params.metadata ? (params.metadata as any) : undefined,
        },
      }),
    ]);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return false; // duplicate event, ignored on purpose
    }
    throw err;
  }

  await incrementPointsAndReferrals(
    params.challengeId,
    params.userId,
    params.points,
    params.referralsDelta ?? 0
  );
  return true;
}
