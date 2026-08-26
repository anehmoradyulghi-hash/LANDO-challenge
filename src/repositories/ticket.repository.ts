import { prisma } from "@/database/prisma";
import { Prisma, TicketSource, TicketStatus } from "@prisma/client";
import { incrementTicketCount } from "@/repositories/participant.repository";

/**
 * Grants a ticket for a specific referral, exactly once (section 38: unique on referralId).
 * Returns true if newly granted, false if this referral already had a ticket.
 */
export async function grantTicketForReferralOnce(params: {
  challengeId: string;
  userId: string;
  referralId: string;
  amount: number;
}): Promise<boolean> {
  try {
    await prisma.giveawayTicket.create({
      data: {
        challengeId: params.challengeId,
        userId: params.userId,
        referralId: params.referralId,
        amount: params.amount,
        source: TicketSource.REFERRAL,
        status: TicketStatus.ACTIVE,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return false;
    }
    throw err;
  }

  await incrementTicketCount(params.challengeId, params.userId, params.amount);
  return true;
}

export async function getActiveTicketTotal(challengeId: string, userId: string): Promise<number> {
  const result = await prisma.giveawayTicket.aggregate({
    where: { challengeId, userId, status: TicketStatus.ACTIVE },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}
