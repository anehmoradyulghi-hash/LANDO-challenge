import type { Challenge } from "@prisma/client";

const toStars = (amount: number) => `${amount.toLocaleString("fa-IR")} ⭐️`;

export function formatRemainingTime(endAt: Date): string {
  const ms = endAt.getTime() - Date.now();
  if (ms <= 0) return "به پایان رسیده";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} روز و ${hours % 24} ساعت`;
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours} ساعت و ${minutes} دقیقه`;
}

function winnerPrizeSummaryLines(challenge: Challenge): string[] {
  const lines: string[] = [];
  if (!challenge.winnerEnabled || !challenge.winnerCount) {
    lines.push("🏆 Winner:\n❌ ندارد");
    lines.push("🎁 Prize:\n❌ ندارد");
    return lines;
  }

  lines.push(`🏆 Winner:\n${challenge.winnerCount.toLocaleString("fa-IR")} نفر`);

  if (challenge.prizeMode === "EQUAL" && challenge.prizeEqualAmount) {
    lines.push(`🎁 Prize:\nهر Winner = ${toStars(challenge.prizeEqualAmount)}`);
  } else if (challenge.prizeMode === "RANKED" && challenge.prizeRankedTable) {
    const table = challenge.prizeRankedTable as unknown as { rank: number; amount: number }[];
    const medals = ["🥇", "🥈", "🥉"];
    const prizeLines = table
      .sort((a, b) => a.rank - b.rank)
      .map((e) => `${medals[e.rank - 1] ?? `${e.rank}️⃣`} ${toStars(e.amount)}`);
    lines.push(`🎁 Prize:\n${prizeLines.join("\n")}`);
  } else {
    lines.push("🎁 Prize:\n❌ ندارد");
  }

  return lines;
}

export function buildChallengePostText(challenge: Challenge, participantCount: number): string {
  const remaining = formatRemainingTime(challenge.endAt);

  if (challenge.type === "GIVEAWAY") {
    const parts = [
      "🎁 GIFT GIVEAWAY",
      "",
      `📝 ${challenge.name}`,
      ...(challenge.description ? [challenge.description] : []),
      "",
      ...winnerPrizeSummaryLines(challenge),
      "",
      `⏱ زمان باقی‌مانده: ${remaining}`,
      `👥 Participants: ${participantCount.toLocaleString("fa-IR")}`,
      ...(challenge.ticketEnabled
        ? [`\n🎟 هر Referral معتبر = +${challenge.ticketsPerReferral} Ticket`]
        : []),
    ];
    return parts.join("\n");
  }

  // LEADERBOARD / REFERRAL / ACTIVITY
  const parts = [
    `🏆 ${challenge.name}`,
    "",
    ...(challenge.description ? [challenge.description, ""] : []),
    `⭐ Join = +${challenge.pointsJoin}`,
    ...(challenge.referralEnabled ? [`⭐ Referral = +${challenge.pointsVerifiedReferral}`] : []),
    "",
    ...winnerPrizeSummaryLines(challenge),
    "",
    `⏱ زمان باقی‌مانده: ${remaining}`,
    `👥 Participants: ${participantCount.toLocaleString("fa-IR")}`,
  ];
  return parts.join("\n");
}

export function buildParticipantSummaryText(params: {
  points: number;
  referrals: number;
  tickets: number;
  rank: number | null;
  remaining: string;
  alreadyJoined: boolean;
}): string {
  const header = params.alreadyJoined
    ? "✅ شما قبلاً در این Challenge شرکت کرده‌اید!"
    : "🎉 با موفقیت در Challenge شرکت کردی!";
  return [
    header,
    "",
    `⭐ Points: ${params.points.toLocaleString("fa-IR")}`,
    `👥 Referral: ${params.referrals.toLocaleString("fa-IR")}`,
    `🎟 Tickets: ${params.tickets.toLocaleString("fa-IR")}`,
    `🏆 Rank: ${params.rank ? `#${params.rank.toLocaleString("fa-IR")}` : "—"}`,
    "",
    `⏱ زمان باقی‌مانده: ${params.remaining}`,
  ].join("\n");
}
