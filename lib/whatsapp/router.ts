import type { InboundMessage } from '@/lib/whatsapp/inbound';
import type { Json, WhatsappModule } from '@/lib/db/types';

// ONE WhatsApp number for all of Manch. Every inbound message is routed to
// exactly one module:
//
//   • Post  — voice note / text → 3 LinkedIn drafts            (needs an account)
//   • Reels — idea / voice note → regional-language Reel script (needs an account)
//   • Check — forwarded message, photo or video → fact-check    (open to everyone)
//
// Routing rules, in order:
//   0. "LINK 123456" links this number to the account that issued the code
//      (proof of ownership — see app/api/post/whatsapp-number).
//   1. A mode keyword ("post", "reel", "check", "menu") switches mode / shows the menu.
//      A bare number 1–3 only picks a mode right after we sent the menu, so it never
//      collides with Check's own "reply 1–8" language onboarding.
//   2. Anything WhatsApp marks as Forwarded, and every photo or video → Check.
//   3. Senders with no linked account → Check (the public utility).
//   4. Otherwise the sender's last chosen mode; no mode yet → show the menu.
//
// decideRoute() is pure so the rules are unit-testable without any I/O.

export interface SessionState {
  mode?: WhatsappModule;
  /** We just sent the menu — a bare "1/2/3" is a menu choice. */
  awaitingMenu?: boolean;
}

export type RouteDecision =
  | { action: 'route'; module: WhatsappModule }
  | { action: 'set_mode'; module: WhatsappModule }
  | { action: 'menu' }
  | { action: 'link'; code: string }
  | { action: 'needs_account'; module: 'post' | 'reels' };

const KEYWORDS: Record<string, WhatsappModule | 'menu'> = {
  menu: 'menu',
  help: 'menu',
  start: 'menu',
  hi: 'menu',
  hello: 'menu',
  namaste: 'menu',
  post: 'post',
  linkedin: 'post',
  reel: 'reels',
  reels: 'reels',
  script: 'reels',
  check: 'check',
  verify: 'check',
  'fact check': 'check',
  factcheck: 'check',
  'mode:post': 'post',
  'mode:reels': 'reels',
  'mode:check': 'check',
};

const MENU_NUMBERS: Record<string, WhatsappModule> = { '1': 'post', '2': 'reels', '3': 'check' };

export function asSession(state: Json | null | undefined): SessionState {
  return (state && typeof state === 'object' && !Array.isArray(state) ? state : {}) as SessionState;
}

export function decideRoute(input: {
  msg: Pick<InboundMessage, 'type' | 'text' | 'forwarded'>;
  hasAccount: boolean;
  session: SessionState;
}): RouteDecision {
  const { msg, hasAccount, session } = input;
  const word = (msg.text ?? '').trim().toLowerCase();

  // 0. Number-linking code (never from a forward — a forwarded code proves nothing).
  const link = msg.type === 'text' && !msg.forwarded ? /^link\s+(\d{6})$/.exec(word) : null;
  if (link) return { action: 'link', code: link[1] };

  // 1. Mode keywords (and menu numbers right after the menu).
  if ((msg.type === 'text' || msg.type === 'interactive') && !msg.forwarded) {
    const kw = KEYWORDS[word] ?? (session.awaitingMenu ? MENU_NUMBERS[word] : undefined);
    if (kw === 'menu') return { action: 'menu' };
    if (kw) {
      if (kw !== 'check' && !hasAccount) return { action: 'needs_account', module: kw };
      return { action: 'set_mode', module: kw };
    }
  }

  // 2. Forwards, photos and videos are always fact-checks.
  if (msg.forwarded || msg.type === 'image' || msg.type === 'video') return { action: 'route', module: 'check' };

  // 3. No account → the public fact-checker.
  if (!hasAccount) return { action: 'route', module: 'check' };

  // 4. The sender's chosen mode.
  if (session.mode) return { action: 'route', module: session.mode };
  return { action: 'menu' };
}

export const MENU_TEXT = [
  '🙏 Welcome to *Manch* — what would you like to do?',
  '',
  '1. ✍️ *Post* — turn a voice note into LinkedIn posts',
  '2. 🎬 *Reels* — get a Reel script in your language',
  '3. ✅ *Check* — fact-check a forward, photo or video',
  '',
  'Reply 1, 2 or 3. Type *menu* any time to switch.',
  'Tip: just forward any suspicious message and I’ll check it.',
].join('\n');

export const MODE_CONFIRM: Record<WhatsappModule, string> = {
  post: '✍️ *Post* mode. Send a voice note or a few lines about your week and I’ll draft 3 LinkedIn posts in your voice.',
  reels: '🎬 *Reels* mode. Send your Reel idea (voice or text) and I’ll write the script in your language.',
  check: '✅ *Check* mode. Forward me any message, photo or video and I’ll tell you if it’s real.',
};

export function needsAccountText(module: 'post' | 'reels', appUrl: string): string {
  const what = module === 'post' ? 'LinkedIn posts' : 'Reel scripts';
  return `To get ${what} here, create your free Manch account and add this WhatsApp number: ${appUrl}/login\n\nYou can fact-check forwards right now — just send one.`;
}
