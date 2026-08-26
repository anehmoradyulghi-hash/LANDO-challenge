import { Markup } from "telegraf";
import type { BotContext } from "@/types/context";
import { findChallengeByPublicToken } from "@/repositories/challenge.repository";
import {
  getLeaderboardPage,
  getReferralLeaderboardPage,
  getUserPointsRank,
  getUserReferralRank,
  findParticipant,
} from "@/repositories/participant.repository";
import { getReferralLeaderboardEntry } from "@/repositories/referral.repository";

const PAGE_SIZE = 10;
const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}️⃣`);
const displayName = (u: { username: string | null; firstName: string | null }) =>
  u.username ? `@${u.username}` : u.firstName ?? "کاربر";

export async function showPointsLeaderboard(ctx: BotContext, publicToken: string, page: number) {
  const challenge = await findChallengeByPublicToken(publicToken);
  if (!challenge) {
    await ctx.answerCbQuery("این چالش دیگر در دسترس نیست", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();

  const rows = await getLeaderboardPage(challenge.id, page * PAGE_SIZE, PAGE_SIZE);
  const myRank = await getUserPointsRank(challenge.id, ctx.dbUser.id);
  const me = await findParticipant(challenge.id, ctx.dbUser.id);

  const lines = ["🏆 Leaderboard", ""];
  rows.forEach((r, idx) => {
    const rank = page * PAGE_SIZE + idx + 1;
    lines.push(`${medal(rank)} ${displayName(r.user)} — ${r.totalPoints.toLocaleString("fa-IR")} امتیاز`);
  });
  if (rows.length === 0) lines.push("هنوز شرکت‌کننده‌ای وجود ندارد.");
  lines.push("", `👤 رتبه شما: ${myRank ? `#${myRank.toLocaleString("fa-IR")}` : "—"}${me ? ` (${me.totalPoints.toLocaleString("fa-IR")} امتیاز)` : ""}`);

  await ctx.reply(lines.join("\n"), paginationKeyboard("lb:points", publicToken, page, rows.length === PAGE_SIZE));
}

export async function showReferralLeaderboard(ctx: BotContext, publicToken: string, page: number) {
  const challenge = await findChallengeByPublicToken(publicToken);
  if (!challenge) {
    await ctx.answerCbQuery("این چالش دیگر در دسترس نیست", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();

  const rows = await getReferralLeaderboardPage(challenge.id, page * PAGE_SIZE, PAGE_SIZE);
  const myRank = await getUserReferralRank(challenge.id, ctx.dbUser.id);
  const me = await findParticipant(challenge.id, ctx.dbUser.id);

  const lines = ["👥 بیشترین Referral", ""];
  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
  rows.forEach((r, idx) => {
    const rank = page * PAGE_SIZE + idx + 1;
    lines.push(`${medal(rank)} ${displayName(r.user)} — ${r.verifiedReferrals.toLocaleString("fa-IR")} دعوت`);
    buttons.push([
      Markup.button.callback(`${displayName(r.user)} (${r.verifiedReferrals})`, `lb:refuser:${publicToken}:${r.userId}:0`),
    ]);
  });
  if (rows.length === 0) lines.push("هنوز رفرالی ثبت نشده است.");
  lines.push("", `👤 شما: ${me?.verifiedReferrals.toLocaleString("fa-IR") ?? 0} دعوت`, `🏆 رتبه: ${myRank ? `#${myRank.toLocaleString("fa-IR")}` : "—"}`);

  const navRow = paginationRow("lb:ref", publicToken, page, rows.length === PAGE_SIZE);
  await ctx.reply(lines.join("\n"), Markup.inlineKeyboard([...buttons, navRow].filter((r) => r.length > 0)));
}

/** Section 42: only public info (username) is shown - no phone numbers, no internal ids, etc. */
export async function showReferralDetails(ctx: BotContext, publicToken: string, referrerUserId: string, page: number) {
  const challenge = await findChallengeByPublicToken(publicToken);
  if (!challenge) {
    await ctx.answerCbQuery("این چالش دیگر در دسترس نیست", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();

  const all = await getReferralLeaderboardEntry(challenge.id, referrerUserId);
  const pageItems = all.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const lines = [`👥 Referralهای Verified:`, ""];
  pageItems.forEach((r, idx) => {
    lines.push(`${page * PAGE_SIZE + idx + 1}. ${displayName(r.referred)}`);
  });
  if (pageItems.length === 0) lines.push("موردی یافت نشد.");

  const hasNext = all.length > (page + 1) * PAGE_SIZE;
  const navRow = [];
  if (page > 0) navRow.push(Markup.button.callback("⬅️ قبلی", `lb:refuser:${publicToken}:${referrerUserId}:${page - 1}`));
  if (hasNext) navRow.push(Markup.button.callback("➡️ بعدی", `lb:refuser:${publicToken}:${referrerUserId}:${page + 1}`));

  await ctx.reply(lines.join("\n"), Markup.inlineKeyboard(navRow.length > 0 ? [navRow] : []));
}

function paginationRow(prefix: string, publicToken: string, page: number, hasNext: boolean) {
  const row = [];
  if (page > 0) row.push(Markup.button.callback("⬅️ قبلی", `${prefix}:${publicToken}:${page - 1}`));
  if (hasNext) row.push(Markup.button.callback("➡️ بعدی", `${prefix}:${publicToken}:${page + 1}`));
  return row;
}

function paginationKeyboard(prefix: string, publicToken: string, page: number, hasNext: boolean) {
  return Markup.inlineKeyboard([paginationRow(prefix, publicToken, page, hasNext)].filter((r) => r.length > 0));
}
