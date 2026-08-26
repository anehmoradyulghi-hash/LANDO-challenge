import { ChallengeType, PrizeMode, WinnerSelectionMode } from "@prisma/client";
import { env } from "@/config/env";
import type { ChallengeDraft } from "@/types/wizard";
import { parseRankedPrizeTable } from "@/validators/challenge.validator";
import {
  getActiveWizardSession,
  startWizardSession,
  updateWizardSession,
  cancelWizardSession,
} from "@/repositories/wizard-session.repository";
import { createChallengeFromDraft } from "@/repositories/challenge.repository";
import type { WizardStep } from "@/types/wizard";

export async function resumeOrStartWizard(userId: string) {
  const existing = await getActiveWizardSession(userId);
  if (existing) return { session: existing, isResume: true };
  const created = await startWizardSession(userId);
  return { session: created, isResume: false };
}

export async function forceRestartWizard(userId: string) {
  await cancelWizardSession(userId);
  return startWizardSession(userId);
}

export function readDraft(session: { draft: unknown }): ChallengeDraft {
  return (session.draft ?? {}) as ChallengeDraft;
}

export async function saveDraft(userId: string, step: WizardStep, draft: ChallengeDraft) {
  return updateWizardSession(userId, step, draft);
}

/**
 * Section 24/46: choose the correct WinnerSelectionMode automatically from the
 * challenge type + ticket setting, so the creator never has to pick it manually.
 */
export function inferSelectionMode(draft: ChallengeDraft): WinnerSelectionMode | undefined {
  if (!draft.winnerEnabled) return undefined;
  if (draft.type === ChallengeType.GIVEAWAY) {
    return draft.ticketEnabled ? WinnerSelectionMode.WEIGHTED : WinnerSelectionMode.RANDOM;
  }
  // LEADERBOARD, ACTIVITY, REFERRAL: winners come from the point ranking.
  return WinnerSelectionMode.RANKED;
}

export interface DraftValidationError {
  code: string;
  message: string;
}

/**
 * Final validation gate before Publish (section 11 step 15 "Confirm").
 * Enforces the hard business rules from sections 17, 22, 23, 25.
 */
export function validateDraftForPublish(draft: ChallengeDraft): DraftValidationError[] {
  const errors: DraftValidationError[] = [];

  if (!draft.channelId) errors.push({ code: "NO_CHANNEL", message: "کانال اصلی انتخاب نشده" });
  if (!draft.requiredChannelIds || draft.requiredChannelIds.length === 0) {
    errors.push({ code: "NO_REQUIRED_CHANNELS", message: "حداقل یک کانال اجباری لازم است" });
  }
  if (draft.requiredChannelIds && draft.requiredChannelIds.length > env.MAX_REQUIRED_CHANNELS) {
    errors.push({ code: "TOO_MANY_CHANNELS", message: "تعداد کانال‌های اجباری بیش از حد مجاز است" });
  }
  if (!draft.name) errors.push({ code: "NO_NAME", message: "نام چالش الزامی است" });
  if (!draft.type) errors.push({ code: "NO_TYPE", message: "نوع چالش انتخاب نشده" });
  if (!draft.startAt || !draft.endAt) {
    errors.push({ code: "NO_TIME_RANGE", message: "زمان شروع و پایان الزامی است" });
  } else if (new Date(draft.endAt) <= new Date(draft.startAt)) {
    // section 25: End must be after Start
    errors.push({ code: "END_BEFORE_START", message: "زمان پایان باید بعد از زمان شروع باشد" });
  }

  // section 23: Winner OFF forces Prize to NONE - never let an inconsistent draft through.
  if (!draft.winnerEnabled) {
    if (draft.prizeMode && draft.prizeMode !== PrizeMode.NONE) {
      errors.push({ code: "PRIZE_WITHOUT_WINNER", message: "بدون Winner، Prize باید NONE باشد" });
    }
  } else {
    if (!draft.winnerCount || draft.winnerCount < 1) {
      errors.push({ code: "NO_WINNER_COUNT", message: "تعداد Winner مشخص نشده" });
    }
    if (draft.prizeMode === PrizeMode.RANKED && draft.winnerCount) {
      const table = draft.prizeRankedTable ?? [];
      const check = parseRankedPrizeTable(table, draft.winnerCount);
      if (!check.ok) {
        errors.push({ code: check.error, message: "توزیع جایزه رتبه‌ای نامعتبر است" }); // section 17
      }
    }
    if (draft.prizeMode === PrizeMode.EQUAL && !draft.prizeEqualAmount) {
      errors.push({ code: "NO_EQUAL_PRIZE_AMOUNT", message: "مبلغ جایزه یکسان مشخص نشده" });
    }
  }

  return errors;
}

/** Normalizes the draft so DB rules (section 23) are enforced even if a UI bug slipped one through. */
export function normalizeDraftBeforeSave(draft: ChallengeDraft): ChallengeDraft {
  if (!draft.winnerEnabled) {
    return { ...draft, winnerCount: undefined, prizeMode: PrizeMode.NONE, prizeEqualAmount: undefined, prizeRankedTable: undefined, selectionMode: undefined };
  }
  return { ...draft, selectionMode: inferSelectionMode(draft) };
}

export async function finalizeChallenge(creatorId: string, draft: ChallengeDraft) {
  const errors = validateDraftForPublish(draft);
  if (errors.length > 0) {
    throw Object.assign(new Error("DRAFT_INVALID"), { errors });
  }
  const normalized = normalizeDraftBeforeSave(draft);
  const challenge = await createChallengeFromDraft(creatorId, normalized);
  await cancelWizardSession(creatorId);
  return challenge;
}
