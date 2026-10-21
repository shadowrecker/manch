import type { ModuleKey } from '@/lib/plans';

// Client-safe navigation registry: the module switcher, each module's sub-tabs
// and the Home dashboard all render from here. Adding a page to a module = one
// entry below.

export interface ModuleNav {
  key: ModuleKey;
  label: string;
  icon: string;
  /** One-line promise shown on Home and the landing page. */
  pitch: string;
  /** Who it is for / where it publishes. */
  channel: string;
  home: string;
  tabs: { href: string; label: string; exact?: boolean }[];
}

export const MODULE_NAV: ModuleNav[] = [
  {
    key: 'post',
    label: 'Post',
    icon: '✍️',
    pitch: 'Turn your work week into LinkedIn posts in your voice — from a WhatsApp voice note.',
    channel: 'LinkedIn · X',
    home: '/post/generate',
    tabs: [
      { href: '/post/generate', label: 'Generate' },
      { href: '/post/audit', label: 'Profile Audit' },
      { href: '/post/drafts', label: 'My Drafts' },
    ],
  },
  {
    key: 'reels',
    label: 'Reels',
    icon: '🎬',
    pitch: 'Reel scripts, captions, hashtags and trending audio in 8 Indian languages.',
    channel: 'Instagram · Moj · Josh · ShareChat · YouTube',
    home: '/reels/studio',
    tabs: [
      { href: '/reels/studio', label: 'Studio' },
      { href: '/reels/hashtags', label: 'Hashtags' },
      { href: '/reels/audio', label: 'Trending Audio' },
      { href: '/reels/library', label: 'Library' },
      { href: '/reels/agency', label: 'Agency' },
    ],
  },
  {
    key: 'deals',
    label: 'Deals',
    icon: '₹',
    pitch: 'Media kit, brand matches, fair rates and paid deals — from Reels to revenue.',
    channel: 'Instagram creators · Brands',
    home: '/deals',
    tabs: [
      { href: '/deals', label: 'Dashboard', exact: true },
      { href: '/deals/media-kit', label: 'Media Kit' },
      { href: '/deals/matches', label: 'Brand Matches' },
      { href: '/deals/rates', label: 'Rates' },
      { href: '/deals/pipeline', label: 'Pipeline' },
    ],
  },
  {
    key: 'check',
    label: 'Check',
    icon: '✅',
    pitch: 'Before you share that forward — know if it’s real, in your language, in 10 seconds.',
    channel: 'WhatsApp · Web · Newsroom API',
    home: '/check',
    tabs: [
      { href: '/check', label: 'Check', exact: true },
      { href: '/check/history', label: 'History' },
      { href: '/check/api-console', label: 'Newsroom API' },
    ],
  },
];

export const SETTINGS_TABS = [
  { href: '/home', label: 'Home', exact: true },
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/billing', label: 'Plans & Billing' },
  { href: '/settings/team', label: 'Team' },
];

/** The module a pathname belongs to (null for Home / Settings / public pages). */
export function moduleForPath(pathname: string): ModuleKey | null {
  const seg = pathname.split('/')[1] ?? '';
  return (MODULE_NAV.find((m) => m.key === seg)?.key ?? null) as ModuleKey | null;
}

export function isTabActive(pathname: string, tab: { href: string; exact?: boolean }): boolean {
  return tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}
