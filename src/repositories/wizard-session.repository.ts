import { prisma } from "@/database/prisma";
import { env } from "@/config/env";
import type { ChallengeDraft, WizardStep } from "@/types/wizard";

export async function getActiveWizardSession(userId: string) {
  const session = await prisma.wizardSession.findUnique({ where: { userId } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.wizardSession.delete({ where: { userId } });
    return null;
  }
  return session;
}

export async function startWizardSession(userId: string) {
  const expiresAt = new Date(Date.now() + env.WIZARD_SESSION_TTL_HOURS * 60 * 60 * 1000);
  return prisma.wizardSession.upsert({
    where: { userId },
    create: {
      userId,
      step: "SELECT_CHANNEL" satisfies WizardStep,
      draft: {},
      expiresAt,
    },
    update: {
      step: "SELECT_CHANNEL" satisfies WizardStep,
      draft: {},
      challengeId: null,
      expiresAt,
    },
  });
}

export async function updateWizardSession(
  userId: string,
  step: WizardStep,
  draft: ChallengeDraft
) {
  const expiresAt = new Date(Date.now() + env.WIZARD_SESSION_TTL_HOURS * 60 * 60 * 1000);
  return prisma.wizardSession.update({
    where: { userId },
    data: { step, draft: draft as any, expiresAt },
  });
}

export async function cancelWizardSession(userId: string) {
  await prisma.wizardSession.deleteMany({ where: { userId } });
}
