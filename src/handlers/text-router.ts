import { bot } from "@/bot/bot";
import { logger } from "@/utils/logger";
import { handleMainMenuText } from "@/handlers/menu.handler";
import { getPendingInput } from "@/repositories/pending-input.repository";
import { handleAddChannelText } from "@/handlers/channel.handler";
import { handleWizardText } from "@/handlers/wizard.handler";
import { MAIN_MENU_TEXT, mainMenuKeyboard } from "@/bot/menus";

export function registerTextRouter() {
  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return next(); // let command handlers deal with it

    try {
      // 1) Fixed reply-keyboard buttons always win (section 5) - if the user is mid-wizard
      //    and taps a menu button, that intentionally aborts free-text capture; the wizard
      //    session itself is left untouched so they can resume via "➕ ساخت چالش" (section 12).
      if (await handleMainMenuText(ctx, text)) return;

      // 2) Is the bot currently waiting for a specific free-text reply from this user?
      const pending = await getPendingInput(ctx.dbUser.id);
      if (pending) {
        if (pending.purpose === "ADD_CHANNEL") {
          await handleAddChannelText(ctx, text);
          return;
        }
        if (pending.purpose.startsWith("WIZARD_")) {
          const handled = await handleWizardText(ctx, pending.purpose, text);
          if (handled) return;
        }
      }

      // 3) Nothing matched - fall back to the main menu.
      await ctx.reply(MAIN_MENU_TEXT, mainMenuKeyboard);
    } catch (err) {
      logger.error({ err }, "Unhandled error in text router");
      await ctx.reply("⚠️ خطایی رخ داد. لطفاً دوباره تلاش کنید.");
    }
  });
}
