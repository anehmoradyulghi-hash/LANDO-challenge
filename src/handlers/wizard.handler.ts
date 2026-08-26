import { Markup } from "telegraf";
import type { BotContext } from "@/types/context";
import { env } from "@/config/env";
import { ChallengeType, PrizeMode } from "@prisma/client";
import type { ChallengeDraft, WizardStep } from "@/types/wizard";
import { nextStep, previousStep } from "@/types/wizard";
import {
  resumeOrStartWizard,
  forceRestartWizard,
  readDraft,
  saveDraft,
  validateDraftForPublish,
  finalizeChallenge,
} from "@/services/wizard.service";
import { cancelWizardSession, getActiveWizardSession } from "@/repositories/wizard-session.repository";
import { listChannelsForOwner, findChannelById, createOrRestoreChannel } from "@/repositories/channel.repository";
import { findChallengeById } from "@/repositories/challenge.repository";
import { verifyChannelForRequirement } from "@/services/channel-verification.service";
import { setPendingInput, clearPendingInput } from "@/repositories/pending-input.repository";
import { parseRankedPrizeTable, ChallengeNameSchema } from "@/validators/challenge.validator";
import { publishChallengeToAllChannels } from "@/services/publish.service";
import { ChannelAccessStatus } from "@prisma/client";

const TYPE_LABELS: Record<ChallengeType, string> = {
  LEADERBOARD: "🏆 Leaderboard",
  GIVEAWAY: "🎁 Giveaway",
  REFERRAL: "👥 Referral",
  ACTIVITY: "⚡ Activity",
};

const END_PRESETS: [string, string][] = [
  ["۱ ساعت", "1h"],
  ["۳ ساعت", "3h"],
  ["۶ ساعت", "6h"],
  ["۱۲ ساعت", "12h"],
  ["۲۴ ساعت", "24h"],
  ["۲ روز", "2d"],
  ["۳ روز", "3d"],
  ["۷ روز", "7d"],
];

function usesPoints(type?: ChallengeType) {
  return type === ChallengeType.LEADERBOARD || type === ChallengeType.ACTIVITY || type === ChallengeType.REFERRAL;
}

export async function startWizard(ctx: BotContext) {
  const { session, isResume } = await resumeOrStartWizard(ctx.dbUser.id);
  if (isResume) {
    await ctx.reply(
      "یک ساخت چالش ناتمام دارید. می‌خواهید ادامه دهید یا از نو شروع کنید؟",
      Markup.inlineKeyboard([
        [Markup.button.callback("▶️ ادامه ساخت قبلی", "wz:continue")],
        [Markup.button.callback("🆕 لغو و شروع دوباره", "wz:restart")],
      ])
    );
    return;
  }
  await renderStep(ctx, session.step as WizardStep, readDraft(session));
}

export async function continueWizard(ctx: BotContext) {
  await ctx.answerCbQuery();
  const session = await getActiveWizardSession(ctx.dbUser.id);
  if (!session) {
    await startWizard(ctx);
    return;
  }
  await renderStep(ctx, session.step as WizardStep, readDraft(session));
}

export async function restartWizard(ctx: BotContext) {
  await ctx.answerCbQuery();
  const session = await forceRestartWizard(ctx.dbUser.id);
  await renderStep(ctx, session.step as WizardStep, readDraft(session));
}

export async function cancelWizard(ctx: BotContext) {
  await ctx.answerCbQuery("❌ ساخت چالش لغو شد");
  await cancelWizardSession(ctx.dbUser.id);
  await clearPendingInput(ctx.dbUser.id);
}

export async function goBack(ctx: BotContext) {
  await ctx.answerCbQuery();
  const session = await getActiveWizardSession(ctx.dbUser.id);
  if (!session) return;
  const prev = previousStep(session.step as WizardStep);
  if (!prev) return;
  await saveDraft(ctx.dbUser.id, prev, readDraft(session));
  await renderStep(ctx, prev, readDraft(session));
}

async function advance(ctx: BotContext, draft: ChallengeDraft) {
  const session = await getActiveWizardSession(ctx.dbUser.id);
  if (!session) return;
  let step = session.step as WizardStep;

  // Skip steps that don't apply to the chosen type (sections 24, 27, 37)
  let next = nextStep(step);
  while (next) {
    if (next === "SCORING" && !usesPoints(draft.type)) { next = nextStep(next); continue; }
    if (next === "TICKET" && draft.type !== ChallengeType.GIVEAWAY) {
      draft.ticketEnabled = false;
      next = nextStep(next);
      continue;
    }
    if (next === "PRIZE" && !draft.winnerEnabled) {
      draft.prizeMode = PrizeMode.NONE; // section 23
      next = nextStep(next);
      continue;
    }
    break;
  }

  if (!next) {
    await saveDraft(ctx.dbUser.id, "PREVIEW", draft);
    await renderStep(ctx, "PREVIEW", draft);
    return;
  }
  await saveDraft(ctx.dbUser.id, next, draft);
  await renderStep(ctx, next, draft);
}

async function renderStep(ctx: BotContext, step: WizardStep, draft: ChallengeDraft) {
  switch (step) {
    case "SELECT_CHANNEL":
      return renderSelectChannel(ctx);
    case "REQUIRED_CHANNELS":
      return renderRequiredChannels(ctx, draft);
    case "NAME":
      await setPendingInput(ctx.dbUser.id, "WIZARD_NAME");
      return ctx.reply("📝 نام چالش را ارسال کنید:", backCancel());
    case "DESCRIPTION":
      await setPendingInput(ctx.dbUser.id, "WIZARD_DESCRIPTION");
      return ctx.reply("📄 توضیحات چالش را ارسال کنید (یا رد کنید):", Markup.inlineKeyboard([
        [Markup.button.callback("⏭ رد کردن", "wz:skip")],
        ...backCancel().reply_markup.inline_keyboard,
      ]));
    case "TYPE":
      return ctx.reply(
        "🎯 نوع چالش را انتخاب کنید:",
        Markup.inlineKeyboard([
          [Markup.button.callback(TYPE_LABELS.LEADERBOARD, "wz:type:LEADERBOARD")],
          [Markup.button.callback(TYPE_LABELS.GIVEAWAY, "wz:type:GIVEAWAY")],
          [Markup.button.callback(TYPE_LABELS.REFERRAL, "wz:type:REFERRAL")],
          [Markup.button.callback(TYPE_LABELS.ACTIVITY, "wz:type:ACTIVITY")],
          ...backCancel().reply_markup.inline_keyboard,
        ])
      );
    case "START_TIME":
      return ctx.reply(
        "▶️ زمان شروع را انتخاب کنید:",
        Markup.inlineKeyboard([
          [Markup.button.callback("▶️ همین الان", "wz:start:now")],
          [Markup.button.callback("📅 زمان دلخواه", "wz:start:custom")],
          ...backCancel().reply_markup.inline_keyboard,
        ])
      );
    case "END_TIME":
      return ctx.reply(
        "⏱ زمان پایان را انتخاب کنید:",
        Markup.inlineKeyboard([
          ...END_PRESETS.map(([label, code]) => [Markup.button.callback(label, `wz:end:${code}`)]),
          [Markup.button.callback("📅 زمان دلخواه", "wz:end:custom")],
          ...backCancel().reply_markup.inline_keyboard,
        ])
      );
    case "SCORING":
      return ctx.reply(
        [
          "⭐ سیستم امتیاز (پیش‌فرض):",
          "",
          `Join Challenge: +${draft.pointsJoin ?? 10}`,
          `Verified Referral: +${draft.pointsVerifiedReferral ?? 20}`,
          `Bonus: +${draft.pointsBonus ?? 0}`,
        ].join("\n"),
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ ادامه با مقادیر پیش‌فرض", "wz:score:continue")],
          [Markup.button.callback("✏️ تغییر Join", "wz:score:edit:join")],
          [Markup.button.callback("✏️ تغییر Referral", "wz:score:edit:referral")],
          [Markup.button.callback("✏️ تغییر Bonus", "wz:score:edit:bonus")],
          ...backCancel().reply_markup.inline_keyboard,
        ])
      );
    case "REFERRAL":
      return ctx.reply(
        "👥 آیا Referral برای این چالش فعال باشد؟",
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ فعال", "wz:referral:on")],
          [Markup.button.callback("❌ غیرفعال", "wz:referral:off")],
          ...backCancel().reply_markup.inline_keyboard,
        ])
      );
    case "TICKET":
      return ctx.reply(
        "🎟 Ticket با Referral فعال باشد؟",
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ فعال (+1)", "wz:ticket:on:1")],
          [Markup.button.callback("✅ فعال (+2)", "wz:ticket:on:2")],
          [Markup.button.callback("✅ فعال (+3)", "wz:ticket:on:3")],
          [Markup.button.callback("✅ فعال (+5)", "wz:ticket:on:5")],
          [Markup.button.callback("❌ غیرفعال", "wz:ticket:off")],
          ...backCancel().reply_markup.inline_keyboard,
        ])
      );
    case "WINNER": {
      const label = draft.type === ChallengeType.GIVEAWAY ? "🎁 Winner Settings" : "🏆 Winner Settings";
      return ctx.reply(
        label,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ با برنده", "wz:winner:on")],
          [Markup.button.callback("❌ بدون برنده", "wz:winner:off")],
          ...backCancel().reply_markup.inline_keyboard,
        ])
      );
    }
    case "PRIZE":
      return ctx.reply(
        "🎁 نوع جایزه را انتخاب کنید:",
        Markup.inlineKeyboard([
          [Markup.button.callback("💰 جایزه یکسان", "wz:prize:equal")],
          [Markup.button.callback("🏆 جایزه بر اساس رتبه", "wz:prize:ranked")],
          [Markup.button.callback("❌ بدون جایزه", "wz:prize:none")],
          ...backCancel().reply_markup.inline_keyboard,
        ])
      );
    case "RULES":
      await setPendingInput(ctx.dbUser.id, "WIZARD_RULES");
      return ctx.reply("📜 قوانین چالش را ارسال کنید (یا رد کنید):", Markup.inlineKeyboard([
        [Markup.button.callback("⏭ رد کردن", "wz:skip")],
        ...backCancel().reply_markup.inline_keyboard,
      ]));
    case "PREVIEW":
      return renderPreview(ctx, draft);
  }
}

function backCancel() {
  return Markup.inlineKeyboard([[Markup.button.callback("🔙 بازگشت", "wz:back"), Markup.button.callback("❌ لغو", "wz:cancel")]]);
}

async function renderSelectChannel(ctx: BotContext) {
  const channels = (await listChannelsForOwner(ctx.dbUser.id)).filter((c) => c.accessStatus === ChannelAccessStatus.OK);
  if (channels.length === 0) {
    await ctx.reply(
      "⚠️ ابتدا باید حداقل یک کانال معتبر ثبت کنید.",
      Markup.inlineKeyboard([[Markup.button.callback("➕ افزودن کانال", "ch:add")], [Markup.button.callback("❌ لغو", "wz:cancel")]])
    );
    return;
  }
  await ctx.reply(
    "📢 کانال چالش را انتخاب کنید:",
    Markup.inlineKeyboard([
      ...channels.map((c) => [Markup.button.callback(c.username ? "@" + c.username : c.title ?? "کانال", `wz:selectchannel:${c.id}`)]),
      [Markup.button.callback("❌ لغو", "wz:cancel")],
    ])
  );
}

async function renderRequiredChannels(ctx: BotContext, draft: ChallengeDraft) {
  const ids = draft.requiredChannelIds ?? [];
  const channels = await Promise.all(ids.map((id) => findChannelById(id)));
  const lines = channels.filter(Boolean).map((c) => (c!.username ? `@${c!.username}` : c!.title ?? "کانال"));

  const atMax = ids.length >= env.MAX_REQUIRED_CHANNELS;
  await ctx.reply(
    ["📢 کانال‌های اجباری:", "", ...(lines.length ? lines : ["(هنوز کانالی اضافه نشده)"])].join("\n"),
    Markup.inlineKeyboard([
      ...(atMax ? [] : [[Markup.button.callback("➕ افزودن کانال", "wz:reqch:add")]]),
      ...(ids.length ? [[Markup.button.callback("🗑 حذف کانال", "wz:reqch:removemenu")]] : []),
      [Markup.button.callback("🔄 بررسی کانال‌ها", "wz:reqch:recheck")],
      ...(ids.length ? [[Markup.button.callback("✅ ادامه", "wz:reqch:continue")]] : []),
      [Markup.button.callback("🔙 بازگشت", "wz:back"), Markup.button.callback("❌ لغو", "wz:cancel")],
    ])
  );
}

function buildPreviewText(draft: ChallengeDraft): string {
  const lines: string[] = [];
  if (draft.type === ChallengeType.GIVEAWAY) {
    lines.push("🎁 GIFT GIVEAWAY", "", `📝 ${draft.name}`);
    if (draft.description) lines.push(draft.description);
    lines.push("", `🎲 انتخاب برندگان:\n${draft.ticketEnabled ? "Weighted Random" : "Random"}`);
  } else {
    lines.push(`🏆 ${draft.name}`, "");
    if (draft.description) lines.push(draft.description, "");
    lines.push(`⭐ Join = +${draft.pointsJoin ?? 10}`);
    if (draft.referralEnabled) lines.push(`⭐ Referral = +${draft.pointsVerifiedReferral ?? 20}`);
  }

  lines.push("");
  if (!draft.winnerEnabled) {
    lines.push("🏆 Winner:\n❌ ندارد", "🎁 Prize:\n❌ ندارد");
  } else {
    lines.push(`🏆 Winner:\n${draft.winnerCount} نفر`);
    if (draft.prizeMode === PrizeMode.EQUAL && draft.prizeEqualAmount) {
      lines.push(`🎁 Prize:\nهر Winner = ${draft.prizeEqualAmount} ⭐️`);
    } else if (draft.prizeMode === PrizeMode.RANKED && draft.prizeRankedTable) {
      const medals = ["🥇", "🥈", "🥉"];
      lines.push(
        "🎁 Prize:\n" +
          draft.prizeRankedTable
            .sort((a, b) => a.rank - b.rank)
            .map((e) => `${medals[e.rank - 1] ?? e.rank + "️⃣"} ${e.amount} ⭐️`)
            .join("\n")
      );
    } else {
      lines.push("🎁 Prize:\n❌ ندارد");
    }
  }

  if (draft.ticketEnabled) lines.push("", `🎟 Referral:\nهر Referral معتبر = +${draft.ticketsPerReferral} Ticket`);
  if (draft.startAt && draft.endAt) {
    const hours = Math.round((new Date(draft.endAt).getTime() - new Date(draft.startAt).getTime()) / 3_600_000);
    lines.push("", `⏱ ${hours} ساعت`);
  }
  return lines.join("\n");
}

async function renderPreview(ctx: BotContext, draft: ChallengeDraft) {
  const errors = validateDraftForPublish(draft);
  const text = buildPreviewText(draft);
  if (errors.length > 0) {
    await ctx.reply(
      [text, "", "⚠️ خطاهای زیر باید برطرف شود:", ...errors.map((e) => `• ${e.message}`)].join("\n"),
      backCancel()
    );
    return;
  }
  await ctx.reply(
    text,
    Markup.inlineKeyboard([[Markup.button.callback("✅ Confirm", "wz:confirm")], ...backCancel().reply_markup.inline_keyboard])
  );
}

// ---------------- callback handlers ----------------

export async function handleWizardCallback(ctx: BotContext, action: string) {
  const session = await getActiveWizardSession(ctx.dbUser.id);
  if (!session) {
    await ctx.answerCbQuery("جلسه ساخت چالش یافت نشد. دوباره شروع کنید.", { show_alert: true });
    return;
  }
  const draft = readDraft(session);
  await ctx.answerCbQuery();

  const [ns, ...rest] = action.split(":"); // action already excludes leading "wz:"
  const parts = [ns, ...rest];

  if (parts[0] === "selectchannel") {
    draft.channelId = parts[1];
    draft.requiredChannelIds = draft.requiredChannelIds ?? [];
    if (!draft.requiredChannelIds.includes(parts[1])) draft.requiredChannelIds.push(parts[1]); // section 9: primary counts as required too, no dup
    await advance(ctx, draft);
    return;
  }

  if (parts[0] === "reqch") {
    return handleRequiredChannelsAction(ctx, session, draft, parts.slice(1));
  }

  if (parts[0] === "type") {
    draft.type = parts[1] as ChallengeType;
    await advance(ctx, draft);
    return;
  }

  if (parts[0] === "start") {
    if (parts[1] === "now") {
      draft.startMode = "NOW";
      draft.startAt = new Date().toISOString();
      await advance(ctx, draft);
    } else {
      await setPendingInput(ctx.dbUser.id, "WIZARD_CUSTOM_START");
      await ctx.reply("📅 زمان شروع را به فرمت YYYY-MM-DD HH:mm (به وقت UTC) ارسال کنید:");
    }
    return;
  }

  if (parts[0] === "end") {
    if (parts[1] === "custom") {
      await setPendingInput(ctx.dbUser.id, "WIZARD_CUSTOM_END");
      await ctx.reply("📅 زمان پایان را به فرمت YYYY-MM-DD HH:mm (به وقت UTC) ارسال کنید:");
      return;
    }
    const base = draft.startAt ? new Date(draft.startAt) : new Date();
    draft.endAt = addDuration(base, parts[1]).toISOString();
    await advance(ctx, draft);
    return;
  }

  if (parts[0] === "score") {
    if (parts[1] === "continue") {
      await advance(ctx, draft);
      return;
    }
    if (parts[1] === "edit") {
      await setPendingInput(ctx.dbUser.id, `WIZARD_SCORE_${parts[2].toUpperCase()}`);
      await ctx.reply("عدد جدید را ارسال کنید:");
    }
    return;
  }

  if (parts[0] === "referral") {
    draft.referralEnabled = parts[1] === "on";
    await advance(ctx, draft);
    return;
  }

  if (parts[0] === "ticket") {
    if (parts[1] === "off") {
      draft.ticketEnabled = false;
    } else {
      draft.ticketEnabled = true;
      draft.ticketsPerReferral = Number(parts[2]);
    }
    await advance(ctx, draft);
    return;
  }

  if (parts[0] === "winner") {
    if (parts[1] === "off") {
      draft.winnerEnabled = false;
      await advance(ctx, draft);
      return;
    }
    draft.winnerEnabled = true;
    await saveDraft(ctx.dbUser.id, session.step as WizardStep, draft);
    const presets = draft.type === ChallengeType.GIVEAWAY ? [1, 3, 5, 10, 20, 50] : [1, 3, 5, 10, 20];
    await ctx.reply(
      "تعداد Winner را انتخاب کنید:",
      Markup.inlineKeyboard([
        ...presets.map((n) => [Markup.button.callback(String(n), `wz:winnercount:${n}`)]),
        [Markup.button.callback("🔢 تعداد دلخواه", "wz:winnercount:custom")],
      ])
    );
    return;
  }

  if (parts[0] === "winnercount") {
    if (parts[1] === "custom") {
      await setPendingInput(ctx.dbUser.id, "WIZARD_WINNER_COUNT_CUSTOM");
      await ctx.reply("تعداد Winner دلخواه را ارسال کنید:");
      return;
    }
    draft.winnerCount = Number(parts[1]);
    await advance(ctx, draft);
    return;
  }

  if (parts[0] === "prize") {
    if (parts[1] === "none") {
      draft.prizeMode = PrizeMode.NONE;
      await advance(ctx, draft);
      return;
    }
    if (parts[1] === "equal") {
      draft.prizeMode = PrizeMode.EQUAL;
      await saveDraft(ctx.dbUser.id, session.step as WizardStep, draft);
      await setPendingInput(ctx.dbUser.id, "WIZARD_PRIZE_EQUAL");
      await ctx.reply("💰 مبلغ جایزه هر نفر (⭐️) را ارسال کنید:");
      return;
    }
    if (parts[1] === "ranked") {
      draft.prizeMode = PrizeMode.RANKED;
      await saveDraft(ctx.dbUser.id, session.step as WizardStep, draft);
      await setPendingInput(ctx.dbUser.id, "WIZARD_PRIZE_RANKED");
      await ctx.reply(
        `🏆 مقادیر جایزه را به ترتیب رتبه، جدا شده با کاما ارسال کنید (${draft.winnerCount} عدد).\nمثال: 200,150,100,75,50`
      );
      return;
    }
    return;
  }

  if (parts[0] === "skip") {
    // DESCRIPTION or RULES step, skipped
    await clearPendingInput(ctx.dbUser.id);
    await advance(ctx, draft);
    return;
  }

  if (parts[0] === "confirm") {
    await handleConfirm(ctx, draft);
    return;
  }
}

async function handleRequiredChannelsAction(
  ctx: BotContext,
  session: { step: string },
  draft: ChallengeDraft,
  parts: string[]
) {
  if (parts[0] === "add") {
    await setPendingInput(ctx.dbUser.id, "WIZARD_ADD_REQUIRED_CHANNEL");
    await ctx.reply("📢 آیدی یا Username کانال اجباری را ارسال کنید:");
    return;
  }
  if (parts[0] === "removemenu") {
    const ids = draft.requiredChannelIds ?? [];
    const channels = await Promise.all(ids.map((id) => findChannelById(id)));
    await ctx.reply(
      "کدام کانال حذف شود؟",
      Markup.inlineKeyboard(
        channels
          .filter(Boolean)
          .map((c) => [Markup.button.callback(c!.username ? "@" + c!.username : c!.title ?? "کانال", `wz:reqch:remove:${c!.id}`)])
      )
    );
    return;
  }
  if (parts[0] === "remove") {
    draft.requiredChannelIds = (draft.requiredChannelIds ?? []).filter((id) => id !== parts[1]);
    await saveDraft(ctx.dbUser.id, "REQUIRED_CHANNELS", draft);
    await renderRequiredChannels(ctx, draft);
    return;
  }
  if (parts[0] === "recheck") {
    const ids = draft.requiredChannelIds ?? [];
    const channels = await Promise.all(ids.map((id) => findChannelById(id)));
    for (const c of channels) {
      if (!c) continue;
      const result = await verifyChannelForRequirement(c.username ? "@" + c.username : c.telegramChatId.toString());
      await createOrRestoreChannel({
        ownerId: c.ownerId,
        telegramChatId: c.telegramChatId,
        username: c.username,
        title: c.title,
        accessStatus: result.ok ? ChannelAccessStatus.OK : result.status,
      });
    }
    await renderRequiredChannels(ctx, draft);
    return;
  }
  if (parts[0] === "continue") {
    await advance(ctx, draft);
    return;
  }
}

function addDuration(base: Date, code: string): Date {
  const unit = code.slice(-1);
  const amount = Number(code.slice(0, -1));
  const ms = unit === "h" ? amount * 3_600_000 : amount * 86_400_000;
  return new Date(base.getTime() + ms);
}

async function handleConfirm(ctx: BotContext, draft: ChallengeDraft) {
  try {
    const challenge = await finalizeChallenge(ctx.dbUser.id, draft);
    await ctx.reply(
      "✅ چالش با موفقیت ساخته شد!",
      Markup.inlineKeyboard([[Markup.button.callback("📢 انتشار در کانال‌ها", `wz:publish:${challenge.id}`)]])
    );
  } catch (err: any) {
    const errors = err?.errors ?? [{ message: "خطای نامشخص" }];
    await ctx.reply(["⚠️ ساخت چالش ناموفق بود:", ...errors.map((e: any) => `• ${e.message}`)].join("\n"));
  }
}

export async function handlePublishChallenge(ctx: BotContext, challengeId: string) {
  const challenge = await findChallengeById(challengeId);
  if (!challenge || challenge.creatorId !== ctx.dbUser.id) {
    await ctx.answerCbQuery("این چالش متعلق به شما نیست", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();
  const results = await publishChallengeToAllChannels(
    challenge,
    challenge.requiredChannels.map((rc) => rc.channel)
  );
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const lines = [`📢 انتشار در ${succeeded.toLocaleString("fa-IR")} از ${results.length.toLocaleString("fa-IR")} کانال انجام شد.`];
  if (failed.length > 0) {
    lines.push("", "کانال‌های ناموفق:", ...failed.map((f) => `❌ ${f.channel.username ? "@" + f.channel.username : f.channel.title}`));
  }
  await ctx.reply(lines.join("\n"));
}

// ---------------- text input handlers (see pending-input.repository) ----------------

export async function handleWizardText(ctx: BotContext, purpose: string, text: string): Promise<boolean> {
  const session = await getActiveWizardSession(ctx.dbUser.id);
  if (!session) return false;
  const draft = readDraft(session);

  switch (purpose) {
    case "WIZARD_NAME": {
      const parsed = ChallengeNameSchema.safeParse(text);
      if (!parsed.success) {
        await ctx.reply("⚠️ نام باید بین ۳ تا ۸۰ کاراکتر باشد. دوباره ارسال کنید:");
        return true;
      }
      draft.name = parsed.data;
      await clearPendingInput(ctx.dbUser.id);
      await advance(ctx, draft);
      return true;
    }
    case "WIZARD_DESCRIPTION":
      draft.description = text.trim();
      await clearPendingInput(ctx.dbUser.id);
      await advance(ctx, draft);
      return true;
    case "WIZARD_RULES":
      draft.rules = text.trim();
      await clearPendingInput(ctx.dbUser.id);
      await advance(ctx, draft);
      return true;
    case "WIZARD_CUSTOM_START": {
      const date = new Date(text.trim().replace(" ", "T") + "Z");
      if (Number.isNaN(date.getTime())) {
        await ctx.reply("⚠️ فرمت نامعتبر است. دوباره ارسال کنید (YYYY-MM-DD HH:mm):");
        return true;
      }
      draft.startMode = "CUSTOM";
      draft.startAt = date.toISOString();
      await clearPendingInput(ctx.dbUser.id);
      await advance(ctx, draft);
      return true;
    }
    case "WIZARD_CUSTOM_END": {
      const date = new Date(text.trim().replace(" ", "T") + "Z");
      if (Number.isNaN(date.getTime()) || (draft.startAt && date <= new Date(draft.startAt))) {
        await ctx.reply("⚠️ زمان پایان باید معتبر و بعد از زمان شروع باشد. دوباره ارسال کنید:");
        return true;
      }
      draft.endAt = date.toISOString();
      await clearPendingInput(ctx.dbUser.id);
      await advance(ctx, draft);
      return true;
    }
    case "WIZARD_SCORE_JOIN":
    case "WIZARD_SCORE_REFERRAL":
    case "WIZARD_SCORE_BONUS": {
      const n = Number(text.trim());
      if (!Number.isFinite(n) || n < 0) {
        await ctx.reply("⚠️ لطفاً یک عدد معتبر ارسال کنید:");
        return true;
      }
      if (purpose === "WIZARD_SCORE_JOIN") draft.pointsJoin = n;
      if (purpose === "WIZARD_SCORE_REFERRAL") draft.pointsVerifiedReferral = n;
      if (purpose === "WIZARD_SCORE_BONUS") draft.pointsBonus = n;
      await clearPendingInput(ctx.dbUser.id);
      await saveDraft(ctx.dbUser.id, "SCORING", draft);
      await renderStep(ctx, "SCORING", draft);
      return true;
    }
    case "WIZARD_WINNER_COUNT_CUSTOM": {
      const n = Number(text.trim());
      if (!Number.isInteger(n) || n < 1) {
        await ctx.reply("⚠️ لطفاً یک عدد صحیح مثبت ارسال کنید:");
        return true;
      }
      draft.winnerCount = n;
      await clearPendingInput(ctx.dbUser.id);
      await advance(ctx, draft);
      return true;
    }
    case "WIZARD_PRIZE_EQUAL": {
      const n = Number(text.trim());
      if (!Number.isInteger(n) || n < 1) {
        await ctx.reply("⚠️ لطفاً یک عدد صحیح مثبت ارسال کنید:");
        return true;
      }
      draft.prizeEqualAmount = n;
      await clearPendingInput(ctx.dbUser.id);
      await advance(ctx, draft);
      return true;
    }
    case "WIZARD_PRIZE_RANKED": {
      const nums = text.split(",").map((s) => Number(s.trim()));
      if (nums.some((n) => !Number.isInteger(n) || n < 1)) {
        await ctx.reply("⚠️ فقط اعداد صحیح مثبت، جدا شده با کاما ارسال کنید:");
        return true;
      }
      const table = nums.map((amount, idx) => ({ rank: idx + 1, amount }));
      const check = parseRankedPrizeTable(table, draft.winnerCount ?? 0);
      if (!check.ok) {
        // section 17: publish forbidden if distribution is wrong - ask again here directly
        await ctx.reply(`⚠️ باید دقیقاً ${draft.winnerCount} عدد ارسال کنید:`);
        return true;
      }
      draft.prizeRankedTable = table;
      await clearPendingInput(ctx.dbUser.id);
      await advance(ctx, draft);
      return true;
    }
    case "WIZARD_ADD_REQUIRED_CHANNEL": {
      const result = await verifyChannelForRequirement(text.trim());
      if (!result.ok) {
        await ctx.reply("❌ این کانال قابل تأیید نیست. لطفاً بررسی کنید Bot عضو کانال باشد و دوباره ارسال کنید.");
        return true;
      }
      const channel = await createOrRestoreChannel({
        ownerId: ctx.dbUser.id,
        telegramChatId: result.telegramChatId!,
        username: result.username ?? null,
        title: result.title ?? null,
        accessStatus: ChannelAccessStatus.OK,
      });
      const ids = draft.requiredChannelIds ?? [];
      if (ids.includes(channel.id)) {
        await ctx.reply("⚠️ این کانال قبلاً اضافه شده است."); // section 9: duplicate forbidden
      } else if (ids.length >= env.MAX_REQUIRED_CHANNELS) {
        await ctx.reply("⚠️ به حداکثر تعداد کانال مجاز رسیده‌اید."); // section 10
      } else {
        draft.requiredChannelIds = [...ids, channel.id];
        await saveDraft(ctx.dbUser.id, "REQUIRED_CHANNELS", draft);
      }
      await clearPendingInput(ctx.dbUser.id);
      await renderRequiredChannels(ctx, draft);
      return true;
    }
    default:
      return false;
  }
}
