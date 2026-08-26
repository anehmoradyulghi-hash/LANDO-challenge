import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  BOT_USERNAME: z.string().min(1, "BOT_USERNAME is required"),
  WEBHOOK_DOMAIN: z.string().url(),
  WEBHOOK_PATH: z.string().default("/telegram/webhook"),
  WEBHOOK_SECRET: z.string().min(8),

  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  MAX_REQUIRED_CHANNELS: z.coerce.number().int().positive().default(20),
  MAX_CHANNELS_PER_CREATOR: z.coerce.number().int().positive().default(50),
  MAX_ACTIVE_CHALLENGES_PER_CREATOR: z.coerce.number().int().positive().default(10),
  WIZARD_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(48),
  PARTICIPANT_COUNT_UPDATE_DEBOUNCE_MS: z.coerce.number().int().positive().default(180_000),
  PARTICIPANT_COUNT_UPDATE_MIN_DELTA: z.coerce.number().int().positive().default(5),
  MEMBERSHIP_RECHECK_TTL_MINUTES: z.coerce.number().int().positive().default(10),

  SCHEDULER_TICK_CRON: z.string().default("*/30 * * * * *"),

  LOG_LEVEL: z.string().default("info"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loud - never run with a broken/insecure config.
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
