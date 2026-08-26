import { bot } from "@/bot/bot";
import { logger } from "@/utils/logger";
import {
  startWizard,
  continueWizard,
  restartWizard,
  cancelWizard,
  goBack,
  handleWizardCallback,
  handlePublishChallenge,
} from "@/handlers/wizard.handler";
import {
  showMyChannels,
  showChannelDetail,
  beginAddChannel,
  handleRecheckChannel,
  handleDeleteChannel,
} from "@/handlers/channel.handler";
import { showChannelChallenges } from "@/handlers/channel-challenges.handler";
import { handleJoinButton, handleRecheckMembership, handleInvite } from "@/handlers/join.handler";
import { showPointsLeaderboard, showReferralLeaderboard, showReferralDetails } from "@/handlers/leaderboard.handler";
import { showProfile, showMyWins } from "@/handlers/profile.handler";
import {
  showChallengeManagement,
  showChallengeStats,
  showChallengePosts,
  handleRepublish,
  showChallengeWinners,
  showMyChallenges,
} from "@/handlers/creator-challenges.handler";

/**
 * All inline-keyboard callback_data values in this bot follow a "namespace:action:...args"
 * shape (see section 12 & the various handler files for the exact grammar of each namespace).
 * This router only does prefix dispatch - all authorization/ownership checks happen inside
 * the handlers themselves (section 2: every authorization check is server-side).
 */
export function registerCallbackRouter() {
  bot.on("callback_query", async (ctx, next) => {
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
    if (!data) return next();

    try {
      // ---- Wizard (section 11-23, 45-48) ----
      if (data === "wz:start") return void (await startWizard(ctx));
      if (data === "wz:continue") return void (await continueWizard(ctx));
      if (data === "wz:restart") return void (await restartWizard(ctx));
      if (data === "wz:cancel") return void (await cancelWizard(ctx));
      if (data === "wz:back") return void (await goBack(ctx));
      if (data.startsWith("wz:publish:")) return void (await handlePublishChallenge(ctx, data.slice("wz:publish:".length)));
      if (data.startsWith("wz:")) return void (await handleWizardCallback(ctx, data.slice("wz:".length)));

      // ---- Channels (sections 7-10) ----
      if (data === "ch:list") return void (await showMyChannels(ctx));
      if (data === "ch:add") return void (await beginAddChannel(ctx));
      if (data.startsWith("ch:view:")) return void (await showChannelDetail(ctx, data.slice("ch:view:".length)));
      if (data.startsWith("ch:recheck:")) return void (await handleRecheckChannel(ctx, data.slice("ch:recheck:".length)));
      if (data.startsWith("ch:delete:")) return void (await handleDeleteChannel(ctx, data.slice("ch:delete:".length)));
      if (data.startsWith("ch:challenges:")) return void (await showChannelChallenges(ctx, data.slice("ch:challenges:".length)));

      // ---- Join flow (sections 30-33) ----
      if (data.startsWith("join:recheck:")) return void (await handleRecheckMembership(ctx, data.slice("join:recheck:".length)));
      if (data.startsWith("join:invite:")) return void (await handleInvite(ctx, data.slice("join:invite:".length)));
      if (data.startsWith("join:")) return void (await handleJoinButton(ctx, data.slice("join:".length)));

      // ---- Leaderboards (sections 40-42) ----
      if (data.startsWith("lb:points:")) {
        const [, , token, page] = data.split(":");
        return void (await showPointsLeaderboard(ctx, token, Number(page)));
      }
      if (data.startsWith("lb:refuser:")) {
        const [, , token, userId, page] = data.split(":");
        return void (await showReferralDetails(ctx, token, userId, Number(page)));
      }
      if (data.startsWith("lb:ref:")) {
        const [, , token, page] = data.split(":");
        return void (await showReferralLeaderboard(ctx, token, Number(page)));
      }

      // ---- Profile (section 43) ----
      if (data === "profile:open") return void (await showProfile(ctx));
      if (data === "profile:wins") return void (await showMyWins(ctx));

      // ---- Creator challenge management (sections 44, 52-54) ----
      if (data === "cc:mychallenges") return void (await showMyChallenges(ctx));
      if (data.startsWith("cc:view:")) return void (await showChallengeManagement(ctx, data.slice("cc:view:".length)));
      if (data.startsWith("cc:stats:")) return void (await showChallengeStats(ctx, data.slice("cc:stats:".length)));
      if (data.startsWith("cc:posts:")) return void (await showChallengePosts(ctx, data.slice("cc:posts:".length)));
      if (data.startsWith("cc:republish:")) return void (await handleRepublish(ctx, data.slice("cc:republish:".length)));
      if (data.startsWith("cc:winners:")) return void (await showChallengeWinners(ctx, data.slice("cc:winners:".length)));

      // Unknown callback - acknowledge silently so Telegram doesn't show a loading spinner forever.
      await ctx.answerCbQuery();
    } catch (err) {
      logger.error({ err, data }, "Unhandled error in callback router");
      try {
        await ctx.answerCbQuery("⚠️ خطایی رخ داد. دوباره تلاش کنید.", { show_alert: true });
      } catch {
        /* ignore secondary failure */
      }
    }
  });
}
