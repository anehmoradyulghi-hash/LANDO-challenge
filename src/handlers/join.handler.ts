import { Markup } from "telegraf";
import type { BotContext } from "@/types/context";
import { env } from "@/config/env";
import type { Challenge, ChallengeChannel, Channel } from "@prisma/client";
import { findChallengeByPublicToken } from "@/repositories/challenge.repository";
import { countActiveParticipants, findParticipant, getUserPointsRank } from "@/repositories/participant.repository";
import { getActiveTicketTotal } from "@/repositories/ticket.repository";
import { attemptJoin, recheckMembership } from "@/services/join.service";
import { formatRemainingTime, buildParticipantSummaryText } from "@/utils/format";
import { logger } from "@/utils/logger";

type ChallengeWithChannels = Challenge & {
  requiredChannels: (ChallengeChannel & { channel: Channel })[];
};

function requiredChannelList(challenge: ChallengeWithChannels): Channel[] {
  return challenge.requiredChannels.map((rc) => rc.channel).filter((c) => !c.isDeleted);
}

function joinScreenText(challenge: ChallengeWithChannels, participantCount: number): string {
  const channels = requiredChannelList(challenge)
    .map((c) => (c.username ? `@${c.username}` : c.title ?? "کانال"))
    .join("\n");

  const lines = [
    challenge.type === "GIVEAWAY" ? "🎁 GIFT GIVEAWAY" : `🏆 ${challenge.name}`,
    "",
    ...(challenge.winnerEnabled && challenge.winnerCount
      ? [`🏆 Winner: ${challenge.winnerCount.toLocaleString("fa-IR")} نفر`]
      : ["🏆 Winner: ❌ ندارد"]),
    ...(challenge.prizeMode === "EQUAL" && challenge.prizeEqualAmount
      ? [`🎁 Prize: ${challenge.prizeEqualAmount.toLocaleString("fa-IR")} ⭐️`]
      : []),
    `⏱ زمان باقی‌مانده: ${formatRemainingTime(challenge.endAt)}`,
    `👥 Participants: ${participantCount.toLocaleString("fa-IR")}`,
    "",
    "📢 Required Channels:",
    channels || "—",
  ];

  if (challenge.ticketEnabled) {
    lines.push("", `🎟 هر Referral معتبر = +${challenge.ticketsPerReferral} Ticket`);
  }

  return lines.join("\n");
}

export async function showChallengeJoinScreen(ctx: BotContext, challenge: ChallengeWithChannels) {
  const existing = await findParticipant(challenge.id, ctx.dbUser.id);

  if (existing?.status === "ACTIVE") {
    await sendAlreadyJoinedSummary(ctx, challenge);
    return;
  }

  const participantCount = await countActiveParticipants(challenge.id);
  const text = joinScreenText(challenge, participantCount);
  await ctx.reply(
    text,
    Markup.inlineKeyboard([[Markup.button.callback("🎯 شرکت کردن", `join:${challenge.publicToken}`)]])
  );
}

async function sendAlreadyJoinedSummary(ctx: BotContext, challenge: ChallengeWithChannels) {
  const participant = await findParticipant(challenge.id, ctx.dbUser.id);
  const tickets = challenge.ticketEnabled ? await getActiveTicketTotal(challenge.id, ctx.dbUser.id) : 0;
  const rank = await getUserPointsRank(challenge.id, ctx.dbUser.id);

  const text = buildParticipantSummaryText({
    points: participant?.totalPoints ?? 0,
    referrals: participant?.verifiedReferrals ?? 0,
    tickets,
    rank,
    remaining: formatRemainingTime(challenge.endAt),
    alreadyJoined: true,
  });

  await ctx.reply(text, postJoinKeyboard(challenge));
}

function postJoinKeyboard(challenge: ChallengeWithChannels) {
  return Markup.inlineKeyboard([
    ...(challenge.ticketEnabled
      ? [[Markup.button.callback("🎟 افزایش شانس", `join:invite:${challenge.publicToken}`)]]
      : []),
    [Markup.button.callback("👥 دعوت دوستان", `join:invite:${challenge.publicToken}`)],
    [Markup.button.callback("👥 بیشترین Referral", `lb:ref:${challenge.publicToken}:0`)],
    [Markup.button.callback("🏆 لیدربورد", `lb:points:${challenge.publicToken}:0`)],
    [Markup.button.callback("📊 پروفایل", "profile:open")],
  ]);
}

export async function handleJoinButton(ctx: BotContext, publicToken: string) {
  const challenge = await findChallengeByPublicToken(publicToken);
  if (!challenge) {
    await ctx.answerCbQuery("این چالش دیگر در دسترس نیست", { show_alert: true });
    return;
  }

  const requiredChannels = requiredChannelList(challenge);
  const result = await attemptJoin(challenge, requiredChannels, ctx.dbUser);
  await handleJoinResult(ctx, challenge, requiredChannels, result);
}

export async function handleRecheckMembership(ctx: BotContext, publicToken: string) {
  const challenge = await findChallengeByPublicToken(publicToken);
  if (!challenge) {
    await ctx.answerCbQuery("این چالش دیگر در دسترس نیست", { show_alert: true });
    return;
  }
  const requiredChannels = requiredChannelList(challenge);
  const result = await recheckMembership(challenge, requiredChannels, ctx.dbUser);
  await handleJoinResult(ctx, challenge, requiredChannels, result, true);
}

async function handleJoinResult(
  ctx: BotContext,
  challenge: ChallengeWithChannels,
  requiredChannels: Channel[],
  result: Awaited<ReturnType<typeof attemptJoin>>,
  isRecheck = false
) {
  await ctx.answerCbQuery();

  if (result.status === "CHALLENGE_NOT_ACTIVE") {
    await ctx.reply("⚠️ این چالش در حال حاضر فعال نیست.");
    return;
  }

  if (result.status === "ALREADY_ACTIVE") {
    await sendAlreadyJoinedSummary(ctx, challenge);
    return;
  }

  if (result.status === "MISSING_CHANNELS") {
    const lines = ["⚠️ ابتدا عضو کانال‌های زیر شوید:", ""];
    const buttons = [];
    for (const c of result.missingChannels ?? []) {
      const label = c.username ? `@${c.username}` : c.title ?? "کانال";
      lines.push(`📢 ${label}`);
      const url = c.username ? `https://t.me/${c.username}` : undefined;
      if (url) buttons.push([Markup.button.url(`➕ عضویت ${label}`, url)]);
    }
    buttons.push([Markup.button.callback("🔄 بررسی عضویت", `join:recheck:${challenge.publicToken}`)]);

    const text = lines.join("\n");
    if (isRecheck) {
      await ctx.reply(text, Markup.inlineKeyboard(buttons));
    } else {
      await ctx.reply(text, Markup.inlineKeyboard(buttons));
    }
    return;
  }

  if (result.status === "JOINED_NOW") {
    const participant = await findParticipant(challenge.id, ctx.dbUser.id);
    const tickets = challenge.ticketEnabled ? await getActiveTicketTotal(challenge.id, ctx.dbUser.id) : 0;
    const rank = await getUserPointsRank(challenge.id, ctx.dbUser.id);
    const text = buildParticipantSummaryText({
      points: participant?.totalPoints ?? 0,
      referrals: participant?.verifiedReferrals ?? 0,
      tickets,
      rank,
      remaining: formatRemainingTime(challenge.endAt),
      alreadyJoined: false,
    });
    await ctx.reply(text, postJoinKeyboard(challenge));
  }
}

export function buildReferralLink(botUsername: string, challengePublicToken: string, referrerTelegramId: bigint) {
  return `https://t.me/${botUsername}?start=ref_${challengePublicToken}_${referrerTelegramId.toString()}`;
}

export async function handleInvite(ctx: BotContext, publicToken: string) {
  const challenge = await findChallengeByPublicToken(publicToken);
  if (!challenge) {
    await ctx.answerCbQuery("این چالش دیگر در دسترس نیست", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();
  const link = buildReferralLink(env.BOT_USERNAME, publicToken, ctx.dbUser.telegramUserId);
  await ctx.reply(
    [
      "👥 لینک اختصاصی دعوت شما:",
      "",
      link,
      "",
      "هر دوستی که با این لینک عضو شود و شرایط را کامل کند، برای شما امتیاز/Ticket ثبت می‌شود.",
    ].join("\n")
  );
}
