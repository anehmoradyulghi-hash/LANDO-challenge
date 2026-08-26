import cron from "node-cron";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { ChallengeStatus } from "@prisma/client";
import {
  findChallengesToActivate,
  findChallengesToEnd,
  findChallengesToSettle,
  setChallengeStatus,
  markSettled,
} from "@/repositories/challenge.repository";
import { selectWinners } from "@/services/winner-selection.service";
import { announceWinnersToChannels } from "@/services/announce.service";
import { refreshParticipantCountsIfDue } from "@/services/post-refresh.service";
import { prisma } from "@/database/prisma";

let running = false;

/**
 * A single scheduler tick. Deliberately sequential and defensive: every challenge is
 * processed independently and a failure on one never blocks the others (mirrors the
 * per-channel isolation principle from section 53).
 */
async function tick() {
  if (running) return; // avoid overlapping ticks if one run takes longer than the interval
  running = true;
  try {
    await activateScheduledChallenges();
    await endActiveChallenges();
    await settleEndedChallenges();
    await refreshLivePostCounts();
  } catch (err) {
    logger.error({ err }, "Scheduler tick failed");
  } finally {
    running = false;
  }
}

// Flow (section 26): draft -> scheduled/active -> ended -> settled
async function activateScheduledChallenges() {
  const due = await findChallengesToActivate();
  for (const challenge of due) {
    try {
      await setChallengeStatus(challenge.id, ChallengeStatus.ACTIVE);
      logger.info({ challengeId: challenge.id }, "Challenge activated");
    } catch (err) {
      logger.error({ err, challengeId: challenge.id }, "Failed to activate challenge");
    }
  }
}

async function endActiveChallenges() {
  const due = await findChallengesToEnd();
  for (const challenge of due) {
    try {
      // Leaderboard/pool is frozen as soon as status leaves ACTIVE (section 15, 18).
      await setChallengeStatus(challenge.id, ChallengeStatus.ENDED);
      logger.info({ challengeId: challenge.id }, "Challenge ended, awaiting settlement");
    } catch (err) {
      logger.error({ err, challengeId: challenge.id }, "Failed to end challenge");
    }
  }
}

async function settleEndedChallenges() {
  const toSettle = await findChallengesToSettle();
  for (const challenge of toSettle) {
    try {
      await selectWinners(challenge); // no-op if winnerEnabled = false (section 47)
      await announceWinnersToChannels(
        challenge,
        challenge.requiredChannels.map((rc) => rc.channel)
      );
      await markSettled(challenge.id);
      logger.info({ challengeId: challenge.id }, "Challenge settled");
    } catch (err) {
      logger.error({ err, challengeId: challenge.id }, "Failed to settle challenge");
    }
  }
}

async function refreshLivePostCounts() {
  const activeChallenges = await prisma.challenge.findMany({
    where: { status: ChallengeStatus.ACTIVE },
  });
  for (const challenge of activeChallenges) {
    try {
      await refreshParticipantCountsIfDue(challenge); // debounced internally (section 51)
    } catch (err) {
      logger.error({ err, challengeId: challenge.id }, "Failed to refresh participant count");
    }
  }
}

export function startScheduler() {
  cron.schedule(env.SCHEDULER_TICK_CRON, () => {
    void tick();
  });
  logger.info({ cron: env.SCHEDULER_TICK_CRON }, "Scheduler started");
}
