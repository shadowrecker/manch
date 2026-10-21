# Manch — your stage, in your language

**Manch** (मंच, "stage") is one AI app for India's creators and professionals. One
account, one plan and one WhatsApp number cover the whole creator journey:

| | Module | What it does |
|---|---|---|
| ✍️ | **Manch Post** | Send a WhatsApp voice note → 3 LinkedIn posts in your voice. Profile audit + shareable score, scheduler, team seats. |
| 🎬 | **Manch Reels** | Reel scripts (3 styles), captions, 30 hashtags and trending audio in Hindi, Tamil, Telugu, Marathi, Bengali, Kannada, Gujarati and Punjabi. Agency mode. |
| ₹ | **Manch Deals** | Instagram-backed media kit, AI brand matching, fair-rate benchmarks, pitches and a deal pipeline paid through Razorpay (5% commission on wins). |
| ✅ | **Manch Check** | Forward any message, photo or video → a trust score, sources and a plain-language verdict in your language. Newsroom JSON API. |

**Create** (Post, Reels) → **Earn** (Deals) → **Stay credible** (Check).

Manch merges four earlier prototypes (Folio AI, Bhasha Studio, CreatorStack AI and
TrustCheck) into one product. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for
how the pieces fit together.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres + pgvector, Auth,
Storage, RLS) · Anthropic Claude · OpenAI Whisper + embeddings · Sarvam / Bhashini ·
360Dialog WhatsApp · Razorpay (subscriptions, orders, Route) · Upstash QStash + Redis ·
PostHog · Resend · Vitest + Testing Library + Playwright.

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in what you need — the app boots with none of it
npm run dev                    # http://localhost:3000
```

Without keys the app builds and runs; each feature switches on when its keys exist.

### Database

Create a Supabase project, then run in order (SQL editor or `supabase db push`):

```
supabase/migrations/0001_core.sql    accounts, teams, billing, metering, WhatsApp, languages
supabase/migrations/0002_post.sql
supabase/migrations/0003_reels.sql
supabase/migrations/0004_deals.sql
supabase/migrations/0005_check.sql
supabase/migrations/0006_avatars.sql  profile pictures (column + public `avatars` bucket)
supabase/seed.sql                    demo hashtags + trending audio for Reels
```

Optional catalogue seeds: `npm run seed:brands`, `npm run seed:rates`, `npm run seed:sources`.

### Integrations

| Integration | Env vars | Notes |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` | Email + password auth with "Confirm email" on; add `<app-url>/**` to Auth → Redirect URLs. Optional Google: set `NEXT_PUBLIC_AUTH_GOOGLE=true` |
| Claude | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | All generation |
| OpenAI | `OPENAI_API_KEY` | Whisper (voice notes) + embeddings (brand match, fact corpus) |
| WhatsApp | `DIALOG360_*` | Point the number's webhook at `/api/whatsapp/webhook` |
| Razorpay | `RAZORPAY_*`, `RZP_PLAN_*` | Create Plus/Pro/Team/Brand plans; webhook → `/api/razorpay/webhook` |
| LinkedIn | `LINKEDIN_*` | Redirect URI `/api/post/linkedin/callback` |
| Instagram | `META_*` | Redirect URI `/api/deals/instagram/callback` |
| QStash / Redis | `QSTASH_*`, `UPSTASH_*` | Background AI jobs, rate limits |
| Cron | `CRON_SECRET` | Schedules in `vercel.json` |

## Plans

One subscription unlocks every module (prices are launch placeholders in `lib/pricing.ts`):

| Plan | Price | Includes |
|---|---|---|
| Free | ₹0 | 4 posts, 5 Reel pieces, 1 media kit + 3 pitches, 10 text fact-checks / month |
| Plus | ₹149/mo | 20 posts + scheduler, 30 Reel pieces, brand match + deal tracker, unlimited checks |
| Pro | ₹449/mo | Unlimited posts/Reels/pitches, threads, repurpose, contract review |
| Team | ₹2,999/mo | 10 seats, shared voice, agency tools |
| Brand / Newsroom / Telco | B2B | Brand dashboard, fact-check API, telco bundle |

What each plan unlocks inside a module is a one-line mapping in `lib/plans.ts`.

## Scripts

```bash
npm run dev            # local dev server
npm run build          # production build
npm run typecheck      # tsc --noEmit
npm run lint           # next lint
npm test               # all unit / route / component tests
npm run test:coverage  # with coverage
npm run test:e2e       # Playwright (public pages)
```

Tests live in `tests/core` (shared billing, WhatsApp routing, auth) and
`tests/<module>`. AI golden evals run only when `ANTHROPIC_API_KEY` is set.

## Security notes

- Secrets live only in `.env.local` / your host's env settings — never in git.
- Every webhook (Razorpay, WhatsApp, QStash, cron) is signature- or secret-verified and fails closed.
- Plans change only via the verified Razorpay webhook; a DB trigger stops users editing their own plan.
- RLS is enabled on every table; privileged tables are service-role only.
