import { env } from "../env.js";

type InvitationEmailInput = {
  to: string;
  orgName: string;
  inviterName: string | null;
  inviterEmail: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
};

type Logger = { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

/**
 * Send an invitation email via the proark1/emailservice
 * (https://mailnowapi.com). If MAILNOW_API_KEY is unset we log the payload
 * + accept URL to stdout — useful for dev and for environments where
 * a different integrator drives the email sending themselves.
 *
 * Failures don't propagate — invitation creation already succeeded by the
 * time we get here, and we don't want a downstream email outage to fail
 * an HTTP request the caller already considers complete.
 */
export async function sendInvitationEmail(
  input: InvitationEmailInput,
  log: Logger,
): Promise<void> {
  const inviter = input.inviterName ?? input.inviterEmail;
  const subject = `You've been invited to ${input.orgName} on OurTeamManagement`;
  const text = [
    `Hi,`,
    ``,
    `${inviter} invited you to join ${input.orgName} on OurTeamManagement as ${input.role}.`,
    ``,
    `Accept the invitation:`,
    input.acceptUrl,
    ``,
    `This link expires on ${input.expiresAt.toUTCString()}.`,
    ``,
    `— OurTeamManagement`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 20px; margin: 0 0 16px;">You've been invited to ${escapeHtml(input.orgName)}</h1>
      <p style="font-size: 15px; line-height: 1.5; color: #333;">
        ${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(input.orgName)}</strong>
        on OurTeamManagement as a <strong>${escapeHtml(input.role)}</strong>.
      </p>
      <p style="margin: 24px 0;">
        <a href="${input.acceptUrl}"
           style="background:#3a7afe;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:500;">
          Accept invitation
        </a>
      </p>
      <p style="font-size: 13px; color: #666;">
        Or copy this link into your browser:<br />
        <code style="word-break: break-all;">${input.acceptUrl}</code>
      </p>
      <p style="font-size: 12px; color: #999; margin-top: 24px;">
        This invitation expires on ${escapeHtml(input.expiresAt.toUTCString())}.
        If you weren't expecting this, you can safely ignore the email.
      </p>
    </div>
  `;

  if (!env.MAILNOW_API_KEY || !env.EMAIL_FROM) {
    log.info(
      { to: input.to, subject, acceptUrl: input.acceptUrl },
      "[email] MAILNOW_API_KEY not set — invitation email skipped (would have sent)",
    );
    return;
  }

  try {
    const res = await fetch(`${env.MAILNOW_API_URL.replace(/\/$/, "")}/v1/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MAILNOW_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [input.to],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.error({ status: res.status, body, to: input.to }, "[email] mailnow API rejected send");
    }
  } catch (err) {
    log.error({ err, to: input.to }, "[email] failed to send invitation email");
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
