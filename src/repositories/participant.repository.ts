import { prisma } from "@/database/prisma";
import { ParticipantStatus } from "@prisma/client";

export async function findParticipant(challengeId: string, userId: string) {
  return prisma.challengeParticipant.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
  });
}

export async function createPendingParticipant(challengeId: string, userId: string) {
  return prisma.challengeParticipant.upsert({
    where: { challengeId_userId: { challengeId, userId } },
    create: { challengeId, userId, status: ParticipantStatus.PENDING_MEMBERSHIP },
    update: {},
  });
}

export async function activateParticipant(challengeId: string, userId: string) {
  return prisma.challengeParticipant.update({
    where: { challengeId_userId: { challengeId, userId } },
    data: {
      status: ParticipantStatus.ACTIVE,
      joinedAt: new Date(),
      lastVerifiedAt: new Date(),
    },
  });
}

export async function touchLastVerified(challengeId: string, userId: string) {
  return prisma.challengeParticipant.update({
    where: { challengeId_userId: { challengeId, userId } },
    data: { lastVerifiedAt: new Date() },
  });
}

export async function countActiveParticipants(challengeId: string): Promise<number> {
  return prisma.challengeParticipant.count({
    where: { challengeId, status: ParticipantStatus.ACTIVE },
  });
}

export async function incrementPointsAndReferrals(
  challengeId: string,
  userId: string,
  pointsDelta: number,
  referralsDelta = 0
) {
  return prisma.challengeParticipant.update({
    where: { challengeId_userId: { challengeId, userId } },
    data: {
      totalPoints: { increment: pointsDelta },
      verifiedReferrals: { increment: referralsDelta },
    },
  });
}

export async function incrementTicketCount(challengeId: string, userId: string, amount: number) {
  return prisma.challengeParticipant.update({
    where: { challengeId_userId: { challengeId, userId } },
    data: { ticketCount: { increment: amount } },
  });
}

/** Leaderboard page ordered by points desc, tie-broken by joinedAt asc (first come, first served). */
export async function getLeaderboardPage(challengeId: string, skip: number, take: number) {
  return prisma.challengeParticipant.findMany({
    where: { challengeId, status: ParticipantStatus.ACTIVE },
    orderBy: [{ totalPoints: "desc" }, { joinedAt: "asc" }],
    skip,
    take,
    include: { user: true },
  });
}

export async function getReferralLeaderboardPage(challengeId: string, skip: number, take: number) {
  return prisma.challengeParticipant.findMany({
    where: { challengeId, status: ParticipantStatus.ACTIVE },
    orderBy: [{ verifiedReferrals: "desc" }, { joinedAt: "asc" }],
    skip,
    take,
    include: { user: true },
  });
}

/** 1-indexed rank of a user by points within a challenge. */
export async function getUserPointsRank(challengeId: string, userId: string): Promise<number | null> {
  const me = await findParticipant(challengeId, userId);
  if (!me || me.status !== ParticipantStatus.ACTIVE) return null;
  const better = await prisma.challengeParticipant.count({
    where: {
      challengeId,
      status: ParticipantStatus.ACTIVE,
      OR: [
        { totalPoints: { gt: me.totalPoints } },
        { totalPoints: me.totalPoints, joinedAt: { lt: me.joinedAt ?? new Date() } },
      ],
    },
  });
  return better + 1;
}

export async function getUserReferralRank(challengeId: string, userId: string): Promise<number | null> {
  const me = await findParticipant(challengeId, userId);
  if (!me || me.status !== ParticipantStatus.ACTIVE) return null;
  const better = await prisma.challengeParticipant.count({
    where: {
      challengeId,
      status: ParticipantStatus.ACTIVE,
      OR: [
        { verifiedReferrals: { gt: me.verifiedReferrals } },
        { verifiedReferrals: me.verifiedReferrals, joinedAt: { lt: me.joinedAt ?? new Date() } },
      ],
    },
  });
  return better + 1;
}

/** All active participants with a positive ticket weight, for weighted giveaway draws. */
export async function getGiveawayPool(challengeId: string) {
  return prisma.challengeParticipant.findMany({
    where: { challengeId, status: ParticipantStatus.ACTIVE },
  });
}
