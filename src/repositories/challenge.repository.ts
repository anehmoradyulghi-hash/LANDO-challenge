import { prisma } from "@/database/prisma";
import { ChallengeStatus } from "@prisma/client";
import { generatePublicToken } from "@/utils/token";
import type { ChallengeDraft } from "@/types/wizard";

export async function createChallengeFromDraft(creatorId: string, draft: ChallengeDraft) {
  if (
    !draft.channelId ||
    !draft.name ||
    !draft.type ||
    !draft.startAt ||
    !draft.endAt ||
    !draft.requiredChannelIds
  ) {
    throw new Error("Draft is incomplete, cannot create challenge");
  }

  return prisma.challenge.create({
    data: {
      publicToken: generatePublicToken(),
      creatorId,
      channelId: draft.channelId,
      name: draft.name,
      description: draft.description ?? null,
      rules: draft.rules ?? null,
      type: draft.type,
      status: draft.startMode === "NOW" ? ChallengeStatus.ACTIVE : ChallengeStatus.SCHEDULED,
      startAt: new Date(draft.startAt),
      endAt: new Date(draft.endAt),
      pointsJoin: draft.pointsJoin ?? 10,
      pointsVerifiedReferral: draft.pointsVerifiedReferral ?? 20,
      pointsBonus: draft.pointsBonus ?? 0,
      referralEnabled: draft.referralEnabled ?? true,
      ticketEnabled: draft.ticketEnabled ?? false,
      ticketsPerReferral: draft.ticketsPerReferral ?? 1,
      winnerEnabled: draft.winnerEnabled ?? false,
      winnerCount: draft.winnerEnabled ? draft.winnerCount ?? null : null,
      selectionMode: draft.selectionMode ?? null,
      prizeMode: draft.winnerEnabled ? draft.prizeMode ?? "NONE" : "NONE", // section 23
      prizeEqualAmount: draft.prizeEqualAmount ?? null,
      prizeRankedTable: draft.prizeRankedTable ? (draft.prizeRankedTable as any) : undefined,
      requiredChannels: {
        create: draft.requiredChannelIds.map((channelId) => ({ channelId })),
      },
    },
    include: { requiredChannels: { include: { channel: true } }, channel: true },
  });
}

export async function findChallengeByPublicToken(publicToken: string) {
  return prisma.challenge.findUnique({
    where: { publicToken },
    include: { requiredChannels: { include: { channel: true } }, channel: true },
  });
}

export async function findChallengeById(id: string) {
  return prisma.challenge.findUnique({
    where: { id },
    include: { requiredChannels: { include: { channel: true } }, channel: true },
  });
}

export async function listChallengesForCreator(creatorId: string, status?: ChallengeStatus) {
  return prisma.challenge.findMany({
    where: { creatorId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    include: { channel: true },
  });
}

export async function setChallengeStatus(id: string, status: ChallengeStatus) {
  return prisma.challenge.update({ where: { id }, data: { status } });
}

/** Challenges whose scheduled start time has passed but are still SCHEDULED. */
export async function findChallengesToActivate() {
  return prisma.challenge.findMany({
    where: { status: ChallengeStatus.SCHEDULED, startAt: { lte: new Date() } },
  });
}

/** Active challenges whose end time has passed - move to ENDED then settle. */
export async function findChallengesToEnd() {
  return prisma.challenge.findMany({
    where: { status: ChallengeStatus.ACTIVE, endAt: { lte: new Date() } },
  });
}

export async function findChallengesToSettle() {
  return prisma.challenge.findMany({
    where: { status: ChallengeStatus.ENDED },
    include: { requiredChannels: { include: { channel: true } }, channel: true },
  });
}

export async function markSettled(id: string) {
  return prisma.challenge.update({
    where: { id },
    data: { status: ChallengeStatus.SETTLED, settledAt: new Date() },
  });
}
