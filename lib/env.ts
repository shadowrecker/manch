// Centralised, lazy environment access.
//
// Importing this module NEVER throws, so the app builds and boots without
// secrets. Call requireEnv() at the point of use to fail loudly only when a
// feature that needs a key is actually exercised. NEXT_PUBLIC_* values are the
// only ones safe to read in client components.

function get(name: string, fallback = ''): string {
  // `||` (not `??`) so an empty-string env var also falls back to the default —
  // an accidentally-blank config var should behave the same as an unset one.
  return process.env[name] || fallback;
}

// NEXT_PUBLIC_* values MUST be read with literal `process.env.NEXT_PUBLIC_X`
// expressions: Next.js inlines only those into browser bundles. Reading them
// via get(name) works on the server but leaves the browser with the fallback
// (e.g. the Supabase client would call a placeholder URL → "Failed to fetch").
const PUBLIC = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  razorpayKeyIdPublic: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || '',
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
};

export const env = {
  appUrl: PUBLIC.appUrl,
  nodeEnv: get('NODE_ENV', 'development'),

  // Supabase (one project for every module)
  supabaseUrl: PUBLIC.supabaseUrl,
  supabaseAnonKey: PUBLIC.supabaseAnonKey,
  supabaseServiceKey: get('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseAudioBucket: get('SUPABASE_STORAGE_BUCKET_AUDIO', 'audio'),
  kitsBucket: get('SUPABASE_STORAGE_BUCKET_KITS', 'media-kits'),

  // Anthropic
  anthropicApiKey: get('ANTHROPIC_API_KEY'),
  anthropicModel: get('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
  promptVersion: get('PROMPT_VERSION', 'dev'),

  // OpenAI — Whisper (Post/Reels voice notes) + embeddings (Deals match, Check corpus)
  openaiApiKey: get('OPENAI_API_KEY'),
  whisperModel: get('OPENAI_WHISPER_MODEL', 'whisper-1'),
  embeddingModel: get('EMBEDDING_MODEL', 'text-embedding-3-small'),

  // Vernacular NLP (Reels generation, Check verdict translation)
  sarvamApiKey: get('SARVAM_API_KEY'),
  sarvamBaseUrl: get('SARVAM_BASE_URL', 'https://api.sarvam.ai'),
  bhashiniApiKey: get('BHASHINI_API_KEY'),
  bhashiniUserId: get('BHASHINI_USER_ID'),

  // WhatsApp (360Dialog) — ONE number for the whole product; the webhook routes
  // each message to Post, Reels or Check (lib/whatsapp/router.ts).
  dialog360ApiKey: get('DIALOG360_API_KEY'),
  dialog360BaseUrl: get('DIALOG360_BASE_URL', 'https://waba-v2.360dialog.io'),
  dialog360WebhookSecret: get('DIALOG360_WEBHOOK_SECRET'),
  whatsappBotNumber: get('WHATSAPP_BOT_NUMBER'),
  whatsappTemplateDraftDelivery: get('WHATSAPP_TEMPLATE_DRAFT_DELIVERY', 'draft_delivery_v1'),
  whatsappTemplateDelivery: get('WHATSAPP_TEMPLATE_REELS_DELIVERY', 'reels_script_v1'),

  // Razorpay — one account; unified Manch plans (lib/plans.ts)
  razorpayKeyIdPublic: PUBLIC.razorpayKeyIdPublic,
  razorpayKeyId: get('RAZORPAY_KEY_ID'),
  razorpayKeySecret: get('RAZORPAY_KEY_SECRET'),
  razorpayWebhookSecret: get('RAZORPAY_WEBHOOK_SECRET'),
  razorpayRouteEnabled: get('RAZORPAY_ROUTE_ENABLED', 'false') === 'true',
  razorpayPlatformAccountId: get('RZP_PLATFORM_ACCOUNT_ID'),
  razorpayPlans: {
    plusMonthly: get('RZP_PLAN_PLUS_MONTHLY'),
    plusYearly: get('RZP_PLAN_PLUS_YEARLY'),
    proMonthly: get('RZP_PLAN_PRO_MONTHLY'),
    proYearly: get('RZP_PLAN_PRO_YEARLY'),
    teamMonthly: get('RZP_PLAN_TEAM_MONTHLY'),
    teamYearly: get('RZP_PLAN_TEAM_YEARLY'),
    brandMonthly: get('RZP_PLAN_BRAND_MONTHLY'),
    brandYearly: get('RZP_PLAN_BRAND_YEARLY'),
  },
  contentPackAmountPaise: Number(get('RZP_CONTENT_PACK_AMOUNT_PAISE', '4900')),
  commissionBps: Number(get('COMMISSION_BPS', '500')), // 5.00%

  // LinkedIn (Post)
  linkedinClientId: get('LINKEDIN_CLIENT_ID'),
  linkedinClientSecret: get('LINKEDIN_CLIENT_SECRET'),
  linkedinRedirectUri: get('LINKEDIN_REDIRECT_URI', 'http://localhost:3000/api/post/linkedin/callback'),
  proxycurlApiKey: get('PROXYCURL_API_KEY'),

  // Instagram / Meta Graph (Deals)
  metaAppId: get('META_APP_ID'),
  metaAppSecret: get('META_APP_SECRET'),
  instagramRedirectUri: get('INSTAGRAM_REDIRECT_URI', 'http://localhost:3000/api/deals/instagram/callback'),
  mediakitRenderMode: get('MEDIAKIT_RENDER_MODE', 'client'),
  brandDataProviderKey: get('BRAND_DATA_PROVIDER_KEY'),

  // Fact-check corpus + media authenticity (Check)
  pibRssUrl: get('PIB_RSS_URL'),
  boomApiKey: get('BOOM_API_KEY'),
  altnewsFeedUrl: get('ALTNEWS_FEED_URL'),
  googleVideoIntelligenceKey: get('GOOGLE_VIDEO_INTELLIGENCE_KEY'),
  googleVisionApiKey: get('GOOGLE_VISION_API_KEY'),
  tineyeApiKey: get('TINEYE_API_KEY'),
  newsroomApiDefaultQuota: Number(get('NEWSROOM_API_DEFAULT_QUOTA', '10000')),
  verdictCacheTtlHours: Number(get('VERDICT_CACHE_TTL_HOURS', '72')),

  // Trend layer (Reels)
  trendDataProviderKey: get('TREND_DATA_PROVIDER_KEY'),

  // Upstash (queue + cache + rate limit)
  qstashUrl: get('QSTASH_URL', 'https://qstash.upstash.io'),
  qstashToken: get('QSTASH_TOKEN'),
  qstashCurrentSigningKey: get('QSTASH_CURRENT_SIGNING_KEY'),
  qstashNextSigningKey: get('QSTASH_NEXT_SIGNING_KEY'),
  upstashRedisUrl: get('UPSTASH_REDIS_REST_URL'),
  upstashRedisToken: get('UPSTASH_REDIS_REST_TOKEN'),

  // Cron (Vercel cron sends `Authorization: Bearer $CRON_SECRET`)
  cronSecret: get('CRON_SECRET'),
  corpusRefreshCronSecret: get('CORPUS_REFRESH_CRON_SECRET'),

  // Analytics / errors / email
  posthogKey: PUBLIC.posthogKey,
  posthogHost: PUBLIC.posthogHost,
  sentryDsn: get('SENTRY_DSN'),
  resendApiKey: get('RESEND_API_KEY'),
  resendFromEmail: get('RESEND_FROM_EMAIL', 'Manch <hello@manch.app>'),
} as const;

/** True only if every named raw env var is present and non-empty. */
export function hasEnv(...names: string[]): boolean {
  return names.every((n) => !!process.env[n]);
}

/** Returns `value` if truthy, otherwise throws a clear, actionable error. */
export function requireEnv(value: string, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See .env.example.`);
  }
  return value;
}
