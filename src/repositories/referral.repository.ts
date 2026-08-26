import { prisma } from "@/database/prisma";
import { ReferralStatus } from "@prisma/client";

/**
 * Creates the referral link the FIRST time a referred user is seen for this challenge.
 * Section 35: a user's referrer is fixed forever once set — never overwritten.
 */
export async function attachReferrerIfAbsent(
  challengeId: string,
  referrerId: string,
  referredId: string
) {
  if (referrerId === referredId) return null; // section 35: self-referral forbidden

  const existing = await prisma.referral.findUnique({
    where: { challengeId_referredId: { challengeId, referredId } },
  });
  if (existing) return existing; // referrer never changes once set

  return prisma.referral.create({
    data: { challengeId, referrerId, referredId, status: ReferralStatus.PENDING },
  });
}

export async function findReferralForReferred(challengeId: string, referredId: string) {
  return prisma.referral.findUnique({
    where: { challengeId_referredId: { challengeId, referredId } },
  });
}

export async function markReferralJoined(id: string) {
  return prisma.referral.update({ where: { id }, data: { status: ReferralStatus.JOINED } });
}

export async function markReferralVerified(id: string) {
  return prisma.referral.update({
    where: { id },
    data: { status: ReferralStatus.VERIFIED, verifiedAt: new Date() },
  });
}

export async function countVerifiedReferrals(challengeId: string, referrerId: string) {
  return prisma.referral.count({
    where: { challengeId, referrerId, status: ReferralStatus.VERIFIED },
  });
}

export async function getReferralLeaderboardEntry(challengeId: string, referrerId: string) {
  return prisma.referral.findMany({
    where: { challengeId, referrerId, status: ReferralStatus.VERIFIED },
    include: { referred: true },
    orderBy: { verifiedAt: "asc" },
  });
}
