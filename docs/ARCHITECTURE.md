# Manch — architecture

Manch is one Next.js 14 (App Router) + Supabase + Razorpay app that combines four
products, previously built as separate apps, into a single product with one
account, one plan, one database and one WhatsApp number:

| Module | Was | What it does | URL prefix | API prefix |
|---|---|---|---|---|
| **Post** | Folio AI | Voice note → LinkedIn posts in your voice, profile audit, scheduler, teams | `/post/*` | `/api/post/*` |
| **Reels** | Bhasha Studio | Reel scripts, captions, hashtags, trending audio in 8 Indian languages | `/reels/*` | `/api/reels/*` |
| **Deals** | CreatorStack AI | Media kit, brand match, rates, pitches, deal pipeline + 5% commission | `/deals/*` | `/api/deals/*` |
| **Check** | TrustCheck | Fact-check forwards / photos / videos; newsroom JSON API | `/check/*` | `/api/check/*` |

## Directory layout

```
app/
  page.tsx                    public landing
  login/, auth/callback/      one sign-in for everything
  (app)/layout.tsx            auth guard + <ModuleFrame> + <Nav>
  (app)/home/                 cross-module dashboard
  (app)/settings/billing/     one pricing page (all plans + one-time boosts)
  (app)/settings/team/        team seats (Post Team / Reels Agency) + /accept for invites
  (app)/{post,reels,deals,check}/...   module pages
  api/billing/checkout/       ONE checkout (subscriptions + one-time orders)
  api/razorpay/webhook/       ONE webhook (plans, credits, deal commissions)
  api/whatsapp/webhook/       ONE WhatsApp number, routed per message
  api/team/*                  team invites (shared)
  api/{post,reels,deals,check}/...     module APIs, crons and queue workers
  score/[shareId], kit/[shareId]       public share pages (Post audit, Deals media kit)
  styles/<module>.css         module palette + component styles, scoped by [data-module]
components/                   shared shell: Nav, ModuleFrame, Paywall, BillingClient, ui/*
components/<module>/          module components
lib/                          shared core (see below)
lib/modules/<module>/         module domain code (AI prompts, services, queries, …)
supabase/migrations/          0001_core.sql, 0002_post … 0005_check, run in order
tests/core, tests/<module>/   vitest suites; tests/e2e playwright
```

## Shared core (`lib/`)

| File | Purpose |
|---|---|
| `env.ts` | Every env var, lazily read; `requireEnv()` at point of use |
| `plans.ts` | **Manch plans** and the plan → module-tier mapping (`MODULE_TIERS`) |
| `pricing.ts` | Tiers shown on landing/billing/paywall; one-time prices; commission % |
| `nav.ts` | Module switcher + sub-tabs registry |
| `db/types.ts` | Hand-written `Database` type for all migrations |
| `db/queries.ts` | `getProfile`, `getPlan`, `getProfileByWhatsapp`, `getUsage(userId, metric)`, `incrementUsage(userId, metric, by)` |
| `billing.ts` | Subscription lifecycle + one-time purchase completion (webhook-driven) |
| `payments/razorpay.ts` | Razorpay client, plan ids, subscription + order creation, signature check |
| `whatsapp/*` | Shared 360Dialog client, verification, inbound parser, router, dispatcher |
| `supabase/*`, `ai/claude.ts`, `queue.ts`, `ratelimit.ts`, `analytics.ts`, `events.ts`, `observability.ts`, `utils.ts` | Infrastructure shared by every module |

## Plans

One subscription (`profiles.plan`) unlocks every module. Plans: `free`, `plus`,
`pro`, `team` (consumer, self-serve), `brand` (B2B, self-serve) and `newsroom`,
`telco`, `grant` (sales-led). Each module keeps its own limits table keyed by a
module-local *tier*, and `lib/plans.ts` maps a plan to one tier per module:

| Plan | Post | Reels | Deals | Check |
|---|---|---|---|---|
| free | free | free | free | free |
| plus | solo | bharat | creator | personal |
| pro | pro | creator | pro | personal |
| team | team | agency | pro | personal |
| brand | free | free | brand | personal |
| newsroom / telco / grant | free | free | free | same name |

**Rule:** every module entitlement function takes the Manch `Plan` and maps it
with `postTier()` / `reelsTier()` / `dealsTier()` / `checkTier()` internally.

## Metering

`usage_counters(user_id, period, metric, used)` with `metric ∈ posts | pieces |
media_kits | pitches`, incremented atomically by `increment_usage(...)` via
`lib/db/queries.ts`. Check meters per WhatsApp bot user in `check_usage`
(most fact-checkers never create an account).

## WhatsApp routing (one number)

`app/api/whatsapp/webhook` → `lib/whatsapp/inbound.ts` (parse) →
`lib/whatsapp/dispatch.ts` (dedupe on `whatsapp_messages`, load session) →
`lib/whatsapp/router.ts` `decideRoute()`:

0. `LINK 123456` links the sending number to the account that requested that code.
1. Keywords `menu` / `post` / `reel` / `check` (and `1`/`2`/`3` right after the menu) switch mode.
2. Forwarded messages, photos and videos → **Check**.
3. Unknown numbers → **Check** (public utility; Post/Reels need an account).
4. Otherwise the sender's saved mode (`whatsapp_sessions.state.mode`), else the menu.

Post and Reels receive a `VoiceJob` (`lib/jobs.ts`) on their QStash workers
(`/api/post/jobs/generate`, `/api/reels/jobs/generate`); Check is handed the
message directly (`lib/modules/check/whatsapp/handler.ts`).

### Linking a WhatsApp number

A typed phone number is never trusted. `POST /api/post/whatsapp-number` issues a
single-use 6-digit code (15 min, `whatsapp_link_codes`); the user sends
`LINK <code>` **from** that number and the dispatcher links it. The
`guard_profile_plan` trigger blocks non-service-role writes to both
`profiles.plan` and `profiles.whatsapp_e164`.

## Billing

`POST /api/billing/checkout` creates Razorpay subscriptions (`plus|pro|team|brand`)
or one-time orders (`makeover`, `content_pack`). `POST /api/razorpay/webhook` is the
only place entitlements change: `subscription.*` → `lib/billing.ts`;
`payment.captured` → one-time purchase (content packs grant Reels credits);
`payment_link.paid` / `payment.captured` with `notes.deal_id` → Deals commission.
A DB trigger (`guard_profile_plan`) stops users changing their own plan.

## Styling

`app/globals.css` is the shared design system (Manch palette). Each module's
`app/styles/<module>.css` re-tints the palette and holds its component classes,
all scoped under `[data-module="<module>"]`, which `<ModuleFrame>` sets from the URL.
