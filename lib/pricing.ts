import type { Plan } from '@/lib/plans';

// Single source of truth for Manch pricing — the landing page, billing page and
// every module's Paywall render from here. What each plan unlocks inside a
// module is defined in lib/plans.ts (MODULE_TIERS); Razorpay plan IDs come from
// env at checkout time (lib/payments/razorpay.ts).
//
// NOTE: prices are launch placeholders combining the four original price
// ladders (Folio ₹249–₹3,999, Bhasha ₹79–₹799, CreatorStack ₹149–₹299,
// TrustCheck ₹49). Validate before launch.

export interface Tier {
  plan: Plan;
  name: string;
  priceMonthly: string;
  priceYearly?: string;
  sub: string;
  tagline: string;
  feats: string[];
  featured?: boolean;
  /** B2B/B2G — shown in the "For organisations" row. */
  b2b?: boolean;
  /** Sales-led: no self-serve checkout, show "Talk to us" instead. */
  contactSales?: boolean;
}

export const TIERS: Tier[] = [
  {
    plan: 'free',
    name: 'Free',
    priceMonthly: '₹0',
    sub: 'forever',
    tagline: 'Try every tool on the stage',
    feats: [
      '4 LinkedIn posts / month',
      '5 Reel scripts in 8 Indian languages',
      '1 media kit + 3 brand pitches',
      '10 fact-checks (text, English & Hindi)',
      '“Made with Manch” watermark',
    ],
  },
  {
    plan: 'plus',
    name: 'Plus',
    priceMonthly: '₹149',
    priceYearly: '₹1,499/yr',
    sub: '/month',
    tagline: 'Less than one chai a week per tool',
    feats: [
      '20 LinkedIn posts + scheduler',
      '30 Reel pieces + trending audio & hashtags',
      'Brand match, rate calculator, deal tracker',
      'Unlimited fact-checks — photos, videos, all languages',
      'No watermark',
    ],
    featured: true,
  },
  {
    plan: 'pro',
    name: 'Pro',
    priceMonthly: '₹449',
    priceYearly: '₹4,499/yr',
    sub: '/month',
    tagline: 'One brand deal pays for a year',
    feats: [
      'Unlimited posts, X threads, meeting notes → post',
      'Unlimited Reels + repurpose engine + content calendar',
      'Unlimited pitches + contract AI review',
      'Everything in Plus',
    ],
  },
  {
    plan: 'team',
    name: 'Team',
    priceMonthly: '₹2,999',
    priceYearly: '₹29,999/yr',
    sub: '/month',
    tagline: 'For agencies and founder-led teams',
    feats: [
      '10 seats with a shared brand voice',
      'Agency mode: bulk, white-label, brand presets',
      'Approval workflow + team analytics',
      'Everything in Pro',
    ],
  },
  {
    plan: 'brand',
    name: 'Brand Dashboard',
    priceMonthly: '₹15,000',
    priceYearly: '₹1,50,000/yr',
    sub: '/month',
    tagline: 'Brief once, evaluate creators at scale',
    feats: ['Post campaign briefs', 'AI-shortlisted creators', 'Match scores + fair rates', 'Direct messaging'],
    b2b: true,
  },
  {
    plan: 'newsroom',
    name: 'Newsroom API',
    priceMonthly: '₹20,000',
    sub: '/month',
    tagline: 'Fact-check at volume in your CMS',
    feats: ['10,000 API calls / month', 'Structured JSON verdicts', 'Webhook support', 'Dedicated support'],
    b2b: true,
    contactSales: true,
  },
  {
    plan: 'telco',
    name: 'Telco Bundle',
    priceMonthly: '₹2–5',
    sub: '/user/month',
    tagline: 'Protect your whole subscriber base',
    feats: ['White-label fact-checking', 'Bundled with the plan', 'All media + languages', 'Revenue share'],
    b2b: true,
    contactSales: true,
  },
];

export const CONSUMER_TIERS = TIERS.filter((t) => !t.b2b);
export const B2B_TIERS = TIERS.filter((t) => t.b2b);

export function tierForPlan(plan: Plan): Tier {
  return TIERS.find((t) => t.plan === plan) ?? TIERS[0];
}

/** One-time Profile Makeover (Post) — amount in paise. */
export const MAKEOVER_PRICE_PAISE = 19900;

/** One-time content pack (Reels): ₹49 → 10 credits. */
export const CONTENT_PACK_PRICE_PAISE = 4900;
export const CONTENT_PACK_CREDITS = 10;

/** Deal commission (Deals), in percent — applies on every plan. */
export const COMMISSION_PCT = 5;
