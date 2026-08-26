import { PointType, ParticipantStatus } from "@prisma/client";
import type { Challenge, Channel, User } from "@prisma/client";
import {
  createPendingParticipant,
  findParticipant,
  activateParticipant,
  touchLastVerified,
} from "@/repositories/participant.repository";
import { awardPointsOnce } from "@/repositories/points.repository";
import { checkAllRequiredChannels } from "@/services/membership.service";
import { tryVerifyReferral } from "@/services/referral.service";

export interface JoinAttemptResult {
  status: "ALREADY_ACTIVE" | "JOINED_NOW" | "MISSING_CHANNELS" | "CHALLENGE_NOT_ACTIVE";
  missingChannels?: Channel[];
}

export async function attemptJoin(
  challenge: Challenge,
  requiredChannels: Channel[],
  user: User
): Promise<JoinAttemptResult> {
  if (challenge.status !== "ACTIVE") {
    return { status: "CHALLENGE_NOT_ACTIVE" };
  }

  const existing = await findParticipant(challenge.id, user.id);
  if (existing?.status === ParticipantStatus.ACTIVE) {
    return { status: "ALREADY_ACTIVE" };
  }

  await createPendingParticipant(challenge.id, user.id);

  const { allJoined, missing } = await checkAllRequiredChannels(
    requiredChannels,
    user.telegramUserId
  );

  if (!allJoined) {
    return { status: "MISSING_CHANNELS", missingChannels: missing };
  }

  await activateParticipant(challenge.id, user.id);

  // section 27: join points, server-side only, deduped by (challengeId, userId, type, referenceId)
  await awardPointsOnce({
    challengeId: challenge.id,
    userId: user.id,
    type: PointType.JOIN_CHALLENGE,
    points: challenge.pointsJoin,
    referenceId: `join:${challenge.id}:${user.id}`,
  });

  // section 36: referral is only verified once the referred user is an active participant
  await tryVerifyReferral(challenge, user.id);

  return { status: "JOINED_NOW" };
}

/** Used by "🔄 بررسی عضویت" retry button when the user was previously missing channels. */
export async function recheckMembership(
  challenge: Challenge,
  requiredChannels: Channel[],
  user: User
): Promise<JoinAttemptResult> {
  const result = await attemptJoin(challenge, requiredChannels, user);
  if (result.status === "ALREADY_ACTIVE" || result.status === "JOINED_NOW") {
    await touchLastVerified(challenge.id, user.id);
  }
  return result;
}
