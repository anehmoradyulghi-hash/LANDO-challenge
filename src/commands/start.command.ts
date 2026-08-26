import type { BotContext } from "@/types/context";
import { MAIN_MENU_TEXT, mainMenuKeyboard } from "@/bot/menus";
import { findChallengeByPublicToken } from "@/repositories/challenge.repository";
import { registerPendingReferral } from "@/services/referral.service";
import { findUserByTelegramId } from "@/repositories/user.repository";
import { showChallengeJoinScreen } from "@/handlers/join.handler";
import { logger } from "@/utils/logger";

type DeepLinkPayload =
  | { kind: "challenge"; token: string }
  | { kind: "referral"; token: string; referrerTelegramId: bigint }
  | null;

function parseDeepLink(payload: string | undefined): DeepLinkPayload {
  if (!payload) return null;
  if (payload.startsWith("challenge_")) {
    return { kind: "challenge", token: payload.slice("challenge_".length) };
  }
  if (payload.startsWith("ref_")) {
    const rest = payload.slice("ref_".length);
    const lastUnderscore = rest.lastIndexOf("_");
    if (lastUnderscore === -1) return null;
    const token = rest.slice(0, lastUnderscore);
    const referrerTelegramIdRaw = rest.slice(lastUnderscore + 1);
    if (!/^\d+$/.test(referrerTelegramIdRaw)) return null;
    return { kind: "referral", token, referrerTelegramId: BigInt(referrerTelegramIdRaw) };
  }
  return null;
}

export async function handleStart(ctx: BotContext) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const payload = text.split(" ").slice(1).join(" ").trim() || undefined;
  const deepLink = parseDeepLink(payload);

  if (!deepLink) {
    await ctx.reply(MAIN_MENU_TEXT, mainMenuKeyboard);
    return;
  }

  try {
    if (deepLink.kind === "challenge") {
      const challenge = await findChallengeByPublicToken(deepLink.token);
      if (!challenge) {
        await ctx.reply("⚠️ این چالش دیگر در دسترس نیست.", mainMenuKeyboard);
        return;
      }
      await showChallengeJoinScreen(ctx, challenge);
      return;
    }

    if (deepLink.kind === "referral") {
      const challenge = await findChallengeByPublicToken(deepLink.token);
      const referrer = await findUserByTelegramId(deepLink.referrerTelegramId);
      if (challenge && referrer && referrer.id !== ctx.dbUser.id) {
        // section 6: deep link never grants management access on its own, only records intent.
        await registerPendingReferral(challenge.id, referrer.id, ctx.dbUser.id);
      }
      if (challenge) {
        await showChallengeJoinScreen(ctx, challenge);
        return;
      }
    }
  } catch (err) {
    logger.error({ err, payload }, "Failed to handle deep link");
  }

  await ctx.reply(MAIN_MENU_TEXT, mainMenuKeyboard);
}
