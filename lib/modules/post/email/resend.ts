import { Resend } from 'resend';
import { env, requireEnv } from '@/lib/env';
import { log, captureException } from '@/lib/observability';

// Transactional email via Resend (SERVER ONLY).
//
// Designed to NEVER hard-fail a request flow: if the API key is missing we log a
// warning and return (the caller still succeeds — the invite token is shown in
// the UI so the owner can share the link manually). Real delivery happens once
// RESEND_API_KEY + RESEND_FROM_EMAIL are configured.

/**
 * Send a team-seat invite email containing the accept link.
 * @param to        recipient email address
 * @param inviteUrl absolute URL the invitee opens to accept the seat
 */
export async function sendInviteEmail(to: string, inviteUrl: string): Promise<void> {
  let apiKey: string;
  try {
    apiKey = requireEnv(env.resendApiKey, 'RESEND_API_KEY');
  } catch {
    // No key configured — degrade gracefully instead of throwing.
    log.warn('Resend not configured; skipping invite email', { to });
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: env.resendFromEmail,
      to,
      subject: 'You have been invited to a Manch team',
      html: inviteHtml(inviteUrl),
      text: inviteText(inviteUrl),
    });
    if (error) {
      // Resend returns errors in-band rather than throwing.
      log.warn('Resend invite email failed', { to, error: String(error) });
      return;
    }
    log.info('invite email sent', { to });
  } catch (err) {
    // Network/SDK failure: log but do not break the invite flow.
    captureException(err, { where: 'sendInviteEmail', to });
  }
}

function inviteHtml(inviteUrl: string): string {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1b1f23">
    <h2 style="margin:0 0 8px">You've been invited to Manch</h2>
    <p style="margin:0 0 16px;color:#5b6b7b">
      A teammate added you to their Manch team. Click below to accept your seat
      and start turning your work week into your LinkedIn brand.
    </p>
    <p style="margin:0 0 20px">
      <a href="${inviteUrl}"
         style="display:inline-block;background:#5b8cff;color:#fff;font-weight:700;
                text-decoration:none;padding:11px 18px;border-radius:11px">
        Accept your seat
      </a>
    </p>
    <p style="margin:0;color:#9bb0d6;font-size:12px">
      If the button doesn't work, paste this link into your browser:<br />${inviteUrl}
    </p>
  </div>`;
}

function inviteText(inviteUrl: string): string {
  return `You've been invited to a Manch team.\n\nAccept your seat: ${inviteUrl}`;
}
