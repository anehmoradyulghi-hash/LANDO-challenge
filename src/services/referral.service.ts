import { PointType } from "@prisma/client";
import {
  attachReferrerIfAbsent,
  findReferralForReferred,
  markReferralJoined,
  markReferralVerified,
} from "@/repositories/referral.repository";
import { awardPointsOnce } from "@/repositories/points.repository";
import { grantTicketForReferralOnce } from "@/repositories/ticket.repository";
import type { Challenge } from "@prisma/client";

/**
 * Called as soon as a referred user is seen (deep-link ref_TOKEN) - before they've
 * necessarily joined the challenge. Just records the pending relationship (section 34).
 */
export async function registerPendingReferral(
  challengeId: string,
  referrerId: string,
  referredId: string
) {
  return attachReferrerIfAbsent(challengeId, referrerId, referredId);
}

/**
 * Called once the referred user successfully becomes an ACTIVE participant.
 * Verifies + rewards the referrer according to section 36's minimum checklist,
 * then grants a ticket if the challenge has ticketing enabled (sections 37-38).
 */
export async function tryVerifyReferral(challenge: Challenge, referredUserId: string) {
  const referral = await findReferralForReferred(challenge.id, referredUserId);
  if (!referral) return; // this user was not referred by anyone
  if (referral.status === "VERIFIED") return; // already rewarded once (section 35)
  if (referral.referrerId === referral.referredId) return; // defensive: no self-referral

  await markReferralJoined(referral.id);

  if (!challenge.referralEnabled) return;

  const verified = await markReferralVerified(referral.id);

  const awarded = await awardPointsOnce({
    challengeId: challenge.id,
    userId: referral.referrerId,
    type: PointType.REFERRAL,
    points: challenge.pointsVerifiedReferral,
    referenceId: referral.id, // one referral = one reward, enforced by unique constraint
    referralsDelta: 1,
  });

  if (awarded && challenge.ticketEnabled) {
    await grantTicketForReferralOnce({
      challengeId: challenge.id,
      userId: referral.referrerId,
      referralId: referral.id,
      amount: challenge.ticketsPerReferral,
    });
  }

  return verified;
}
