import { findChannelById } from "@/repositories/channel.repository";
import { findChallengeById } from "@/repositories/challenge.repository";

/**
 * Section 2: "Creator A نباید به اطلاعات مدیریتی Challengeهای Creator B دسترسی داشته باشد."
 * Every management action must re-check ownership server-side; the Telegram UI is never trusted.
 */
export async function assertOwnsChannel(channelId: string, requesterUserId: string) {
  const channel = await findChannelById(channelId);
  if (!channel || channel.ownerId !== requesterUserId || channel.isDeleted) {
    throw Object.assign(new Error("NOT_CHANNEL_OWNER"), { code: "FORBIDDEN" });
  }
  return channel;
}

export async function assertOwnsChallenge(challengeId: string, requesterUserId: string) {
  const challenge = await findChallengeById(challengeId);
  if (!challenge || challenge.creatorId !== requesterUserId) {
    throw Object.assign(new Error("NOT_CHALLENGE_OWNER"), { code: "FORBIDDEN" });
  }
  return challenge;
}
