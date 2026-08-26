import { ChallengeType, PrizeMode, WinnerSelectionMode } from "@prisma/client";

/**
 * Steps of the creation wizard (section 11-12, 45).
 * Kept as a linear list so "back" / "cancel" / "resume" are trivial to implement.
 */
export const WIZARD_STEPS = [
  "SELECT_CHANNEL",
  "REQUIRED_CHANNELS",
  "NAME",
  "DESCRIPTION",
  "TYPE",
  "START_TIME",
  "END_TIME",
  "SCORING",
  "REFERRAL",
  "TICKET",
  "WINNER",
  "PRIZE",
  "RULES",
  "PREVIEW",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface PrizeRankedEntry {
  rank: number;
  amount: number;
}

/** Partial challenge being assembled across wizard steps. Persisted as JSON (WizardSession.draft). */
export interface ChallengeDraft {
  channelId?: string; // internal Channel.id (home channel)
  requiredChannelIds?: string[]; // internal Channel.id[]

  name?: string;
  description?: string;
  rules?: string;

  type?: ChallengeType;

  startMode?: "NOW" | "CUSTOM";
  startAt?: string; // ISO, UTC (section 25)
  endAt?: string; // ISO, UTC

  pointsJoin?: number;
  pointsVerifiedReferral?: number;
  pointsBonus?: number;

  referralEnabled?: boolean;

  ticketEnabled?: boolean;
  ticketsPerReferral?: number;

  winnerEnabled?: boolean;
  winnerCount?: number;

  prizeMode?: PrizeMode;
  prizeEqualAmount?: number;
  prizeRankedTable?: PrizeRankedEntry[];

  selectionMode?: WinnerSelectionMode;
}

export function nextStep(current: WizardStep): WizardStep | null {
  const idx = WIZARD_STEPS.indexOf(current);
  return idx >= 0 && idx < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[idx + 1] : null;
}

export function previousStep(current: WizardStep): WizardStep | null {
  const idx = WIZARD_STEPS.indexOf(current);
  return idx > 0 ? WIZARD_STEPS[idx - 1] : null;
}
