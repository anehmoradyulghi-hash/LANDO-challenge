# TeleChallenge Bot

A public, multi-tenant Telegram bot for running **Challenges, Leaderboards, and Giveaways**
across creator-owned channels — entirely via Inline Keyboards, no Mini App.

Stack: **Node.js + TypeScript + Telegraf + PostgreSQL (Prisma) + Fastify (webhook) + node-cron**.

---

## 1. Setup

```bash
npm install
cp .env.example .env   # fill in real values, see below
npx prisma migrate dev --name init
npm run dev             # local development (tsx, hot reload)
```

Production:

```bash
npm run build
npx prisma migrate deploy
npm start
```

### Required `.env` values

| Var | Notes |
|---|---|
| `BOT_TOKEN` | from @BotFather |
| `BOT_USERNAME` | bot's `@username` without `@`, used to build deep links |
| `WEBHOOK_DOMAIN` | public HTTPS URL Telegram will call |
| `WEBHOOK_SECRET` | random string; verified on every incoming webhook call |
| `DATABASE_URL` | PostgreSQL only — SQLite is intentionally not supported |
| `MAX_REQUIRED_CHANNELS`, `MAX_CHANNELS_PER_CREATOR`, etc. | all business limits are env-driven, never hard-coded |

No token, secret, or channel ID is ever hard-coded in source — see `src/config/env.ts`.

---

## 2. Architecture

```
src/
  bot/          Telegraf instance, main-menu keyboard, bootstrap (middleware + routers)
  commands/     /start (incl. deep-link parsing), /help
  callbacks/    single router dispatching every inline-button callback_data
  handlers/     one file per feature area (channels, wizard, join flow, leaderboards,
                profile, creator's challenge management, main menu, text router)
  services/     business logic: channel verification, membership checks, join flow,
                referral verification, winner selection, publishing, live post refresh,
                winner announcement, authorization, wizard state machine
  repositories/ all Prisma queries, one file per entity — no raw Prisma calls in handlers
  database/     Prisma client singleton
  jobs/         node-cron scheduler: activate → end → settle → announce, live count refresh
  middleware/   per-update user upsert (auth.middleware.ts)
  validators/   Zod schemas + the "prize table must match winner count" business rule
  utils/        logger, secure random (winner selection), public token generator, formatting
  types/        wizard draft/step types, augmented Telegraf context
  config/       Zod-validated environment loading
```

Every layer only talks to the layer below it: handlers call services, services call
repositories, repositories call Prisma. Telegram API calls live in `bot/`, `services/`
(verification, membership, publish, announce) — never directly inside a handler.

### Server-side authorization (section 2)

`services/authorization.service.ts` re-checks channel/challenge ownership on **every**
management action, regardless of what the inline button claims. A Creator A can never
reach Creator B's management screens even if they guess a callback payload.

### Real Telegram API only (section 3)

There is no Bot API method to list "all channels a user administers" — the bot cannot
fabricate this. Creators paste their channel handle themselves; the bot then verifies it
with real calls only: `getChat`, `getChatMember` (bot), `getChatMember` (creator).
See `services/channel-verification.service.ts`.

### Winner/Prize business rule (sections 15–23, 46–48)

Enforced in two places so it can never drift:
- `services/wizard.service.ts` → `validateDraftForPublish` blocks Publish if the draft is
  inconsistent (e.g. a ranked prize table that doesn't match the winner count).
- `repositories/challenge.repository.ts` → `createChallengeFromDraft` forces
  `prizeMode = NONE` whenever `winnerEnabled = false`, as a hard DB-level guarantee.

### Idempotent points & tickets (sections 28, 38)

`challenge_points` and `giveaway_tickets` both carry unique constraints
(`(challengeId, userId, type, referenceId)` and `(referralId)` respectively). Awarding is
therefore **exactly-once by construction** — a retried webhook or a double-tap can never
double-credit a user.

### Secure randomness (section 39)

`utils/random.ts` uses `node:crypto` (`randomInt`, `randomBytes`) for both uniform
shuffles and ticket-weighted draws. `Math.random()` is never used for winner selection.

### Per-channel publish isolation (sections 49, 53)

`services/publish.service.ts` publishes to every required channel in parallel and records
each channel's own `PENDING/PUBLISHED/FAILED` status independently, so one bad channel
never blocks the rest. `🔄 انتشار مجدد` only retries the channels currently `FAILED`.

### Debounced live participant counts (section 51)

`services/post-refresh.service.ts` is called every scheduler tick but only actually calls
`editMessageText` when **both** enough time has passed (`PARTICIPANT_COUNT_UPDATE_DEBOUNCE_MS`)
**and** the count moved by a meaningful amount (`PARTICIPANT_COUNT_UPDATE_MIN_DELTA`).

### Challenge lifecycle (section 26)

`jobs/scheduler.ts` runs on `SCHEDULER_TICK_CRON` and drives:
`draft → scheduled/active → ended → settled`, calling winner selection and channel
announcement exactly once per challenge, with each challenge's failure isolated from
the others.

---

## 3. Known simplifications / things to review before a real launch

This is a large spec (54 sections). Everything above is implemented and wired end-to-end,
but a few areas were deliberately kept simple and deserve a second pass:

1. **Custom date/time input** (`📅 زمان دلخواه`) expects `YYYY-MM-DD HH:mm` and is
   interpreted as UTC. A real launch should use a proper date picker or at least
   validate/convert the creator's own timezone (`languageCode` is stored but not yet
   used for this).
2. **Bonus points** (section 27's `+50` example) are stored on the challenge
   (`pointsBonus`) but there's no UI trigger wired up yet to actually award them to a
   specific user (e.g. a manual "🎁 اعطای Bonus" admin action) — the ledger and column
   exist and are ready for it.
3. **Fraud detection** — the `fraud_status` column on `challenge_participants` exists
   but nothing currently sets it away from `CLEAN`. Section 36 asks for "re-verify
   membership if needed"; a stricter implementation would periodically re-run
   `checkAllRequiredChannels` on ACTIVE participants (via the scheduler) and flag/
   disqualify anyone who left a required channel mid-challenge.
4. **Rate limiting / flood control** on Telegram API calls (especially membership
   checks and publish fan-out) is not implemented — for large channels you'll want to
   wrap `bot.telegram.*` calls with a queue (e.g. `bottleneck`) to respect Telegram's
   per-second limits.
5. **i18n** — all strings are Persian, matching the spec. If you need multi-language
   support, `languageCode` is already captured per user; string literals would need to
   move into a small dictionary keyed by that field.
6. **Wizard session vs. main-menu interruption**: tapping a main-menu button mid-wizard
   does not explicitly cancel the wizard session (by design — section 12 asks for
   resume/cancel choice on next `/start`), but it does clear any pending free-text
   capture, so a stray text message afterwards won't be misinterpreted as a wizard answer.
7. **Tests** — none included. The repository/service split was chosen specifically to
   make unit-testing the business rules (points dedup, prize validation, winner
   selection) straightforward to add with e.g. `vitest` + a test Postgres schema.

---

## 4. Deep link formats (section 6)

- `https://t.me/<bot>?start=challenge_<publicToken>` — opens a challenge directly.
- `https://t.me/<bot>?start=ref_<publicToken>_<referrerTelegramId>` — opens the same
  challenge and records the referral relationship (never grants any management access).

Internal database IDs (cuids) are never exposed in a link — every public reference uses
the opaque, unguessable `publicToken` (`utils/token.ts`, 14 chars, ~83 bits of entropy).
