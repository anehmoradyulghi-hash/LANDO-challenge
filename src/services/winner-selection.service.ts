import type { Challenge } from "@prisma/client";
import { PrizeMode, WinnerSelectionMode } from "@prisma/client";
import { getGiveawayPool } from "@/repositories/participant.repository";
import { prisma } from "@/database/prisma";
import { saveWinners } from "@/repositories/winner.repository";
import { secureShuffle, weightedRandomDraw } from "@/utils/random";

interface PrizeRankedEntry {
  rank: number;
  amount: number;
}

function prizeForRank(challenge: Challenge, rank: number): number | null {
  if (challenge.prizeMode === PrizeMode.NONE) return null; // section 23
  if (challenge.prizeMode === PrizeMode.EQUAL) return challenge.prizeEqualAmount ?? null;
  if (challenge.prizeMode === PrizeMode.RANKED) {
    const table = (challenge.prizeRankedTable as unknown as PrizeRankedEntry[]) ?? [];
    return table.find((e) => e.rank === rank)?.amount ?? null;
  }
  return null;
}

/**
 * Settles a single ended challenge: picks winners if winnerEnabled, otherwise
 * just leaves the (already-computed) leaderboard/pool frozen (sections 15-23).
 */
export async function selectWinners(challenge: Challenge): Promise<void> {
  // section 47: Winner OFF => nothing to select, prize is already forced to NONE at creation time.
  if (!challenge.winnerEnabled || !challenge.winnerCount) {
    return;
  }

  if (challenge.selectionMode === WinnerSelectionMode.RANKED) {
    // LEADERBOARD: top-N by points (section 16)
    const topN = await prisma.challengeParticipant.findMany({
      where: { challengeId: challenge.id, status: "ACTIVE" },
      orderBy: [{ totalPoints: "desc" }, { joinedAt: "asc" }],
      take: challenge.winnerCount,
    });

    const winners = topN.map((p, idx) => ({
      userId: p.userId,
      rank: idx + 1,
      prizeAmount: prizeForRank(challenge, idx + 1),
    }));
    await saveWinners(challenge.id, winners);
    return;
  }

  // GIVEAWAY: RANDOM or WEIGHTED (sections 19-20, 39)
  const pool = await getGiveawayPool(challenge.id);
  if (pool.length === 0) return;

  let ordered: { id: string; userId: string }[];

  if (challenge.selectionMode === WinnerSelectionMode.WEIGHTED && challenge.ticketEnabled) {
    const weighted = pool.map((p) => ({
      id: p.id,
      userId: p.userId,
      weight: Math.max(p.ticketCount, 1), // section 39: everyone still has a baseline chance
    }));
    const drawn = weightedRandomDraw(weighted, challenge.winnerCount);
    ordered = drawn.map((d) => ({ id: d.id, userId: d.userId }));
  } else {
    const shuffled = secureShuffle(pool);
    ordered = shuffled.slice(0, challenge.winnerCount).map((p) => ({ id: p.id, userId: p.userId }));
  }

  const winners = ordered.map((w, idx) => ({
    userId: w.userId,
    rank: idx + 1,
    prizeAmount: prizeForRank(challenge, idx + 1),
  }));
  await saveWinners(challenge.id, winners);
}
