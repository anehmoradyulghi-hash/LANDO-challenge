import { prisma } from "@/database/prisma";

export async function saveWinners(
  challengeId: string,
  winners: { userId: string; rank: number; prizeAmount: number | null }[]
) {
  return prisma.$transaction(
    winners.map((w) =>
      prisma.challengeWinner.upsert({
        where: { challengeId_userId: { challengeId, userId: w.userId } },
        create: { challengeId, userId: w.userId, rank: w.rank, prizeAmount: w.prizeAmount },
        update: { rank: w.rank, prizeAmount: w.prizeAmount },
      })
    )
  );
}

export async function listWinners(challengeId: string) {
  return prisma.challengeWinner.findMany({
    where: { challengeId },
    orderBy: { rank: "asc" },
    include: { user: true },
  });
}

export async function markWinnersAnnounced(challengeId: string) {
  return prisma.challengeWinner.updateMany({
    where: { challengeId },
    data: { announcedAt: new Date() },
  });
}

export async function countWinsForUser(userId: string) {
  return prisma.challengeWinner.count({ where: { userId } });
}
