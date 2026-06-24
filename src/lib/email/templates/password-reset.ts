/**
 * Password-reset email template.
 * Returns both an HTML body and a plain-text fallback.
 *
 * The design is intentionally minimal so it works across all major email clients
 * (Gmail, Outlook, Apple Mail) without requiring an external CSS framework.
 */

export interface PasswordResetTemplateParams {
  /** Recipient's display name */
  userName: string;
  /** Full URL including raw token: https://app.example.com/reset-password?token=XXX */
  resetUrl: string;
  /** Token expiry time (shown to the user as a human-readable string) */
  expiresAt: Date;
}

interface PasswordResetEmailContent {
  subject: string;
  html: string;
  text: string;
}

export function buildPasswordResetEmail(
  params: PasswordResetTemplateParams
): PasswordResetEmailContent {
  const { userName, resetUrl, expiresAt } = params;

  // Format expiry in a locale-neutral way (e.g. "20 April 2026, 18:30 UTC")
  const expiryString = expiresAt.toUTCString();

  const subject = 'איפוס סיסמה – VAAD ועד בית';

  // ── HTML ──────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,0.15);
                          border-radius:12px;padding:12px 16px;margin-bottom:16px;">
                <span style="font-size:28px;">🏢</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">
                VAAD ועד בית
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 12px;color:#1e293b;font-size:18px;font-weight:700;">
                שלום, ${escapeHtml(userName)}
              </h2>
              <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
                קיבלנו בקשה לאיפוס הסיסמה עבור חשבונכם במערכת VAAD.
                לחצו על הכפתור הבא כדי לבחור סיסמה חדשה:
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${resetUrl}"
                       style="display:inline-block;background:#3b82f6;color:#ffffff;
                              font-size:15px;font-weight:600;text-decoration:none;
                              padding:14px 36px;border-radius:8px;
                              letter-spacing:0.3px;">
                      איפוס סיסמה
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;
                          padding:14px 16px;margin-bottom:24px;">
                <p style="margin:0;color:#713f12;font-size:13px;line-height:1.5;">
                  ⏱️ &nbsp;הקישור תקף למשך <strong>שעה אחת</strong>
                  (עד ${expiryString}).
                </p>
              </div>

              <!-- Security note -->
              <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
                <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">
                  🔒 &nbsp;אם לא ביקשתם לאפס את הסיסמה, ניתן להתעלם מהודעה זו.
                  חשבונכם בטוח ולא בוצע שום שינוי.
                </p>
              </div>

              <!-- Fallback link -->
              <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;">
                אם הכפתור אינו פועל, העתיקו את הקישור הבא לדפדפן:
              </p>
              <p style="margin:0;font-size:12px;word-break:break-all;">
                <a href="${resetUrl}" style="color:#3b82f6;text-decoration:underline;direction:ltr;
                                            display:inline-block;">${resetUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;
                       padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                הודעה זו נשלחה אוטומטית ממערכת VAAD לניהול ועד בית.
                אנא אל תשיבו להודעה זו.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;

  // ── Plain text ─────────────────────────────────────────────────────────────
  const text = `שלום, ${userName}

קיבלנו בקשה לאיפוס הסיסמה עבור חשבונכם במערכת VAAD.

לאיפוס הסיסמה, היכנסו לקישור הבא:
${resetUrl}

הקישור תקף למשך שעה אחת (עד ${expiryString}).

אם לא ביקשתם לאפס את הסיסמה, ניתן להתעלם מהודעה זו.
חשבונכם בטוח ולא בוצע שום שינוי.

---
VAAD – מערכת לניהול ועד בית
`;

  return { subject, html, text };
}

/** Minimal HTML escaping to prevent XSS via user-supplied name in the template */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
