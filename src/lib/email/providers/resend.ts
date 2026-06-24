/**
 * Resend email provider (https://resend.com).
 *
 * Resend is imported lazily so the module only loads when this provider is
 * actually used.  This keeps cold-start cost zero when email is not configured.
 */

import type { EmailPayload, EmailProvider } from '../types';

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string
  ) {}

  async send(payload: EmailPayload): Promise<void> {
    // Dynamic import keeps the Resend SDK out of the initial bundle for
    // routes that never send email (billing, tickets, etc.)
    const { Resend } = await import('resend');
    const client = new Resend(this.apiKey);

    const { error } = await client.emails.send({
      from: this.fromAddress,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    if (error) {
      // Resend returns a typed error object; surface the message for server-side logging
      throw new Error(`Resend delivery error: ${error.message}`);
    }
  }
}
