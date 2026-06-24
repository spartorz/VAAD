/**
 * Console / dev fallback email provider.
 *
 * Used when no real provider is configured.
 * Logs the email payload to stdout so the full flow can be tested locally
 * without any external service.
 *
 * NEVER use this in production — it does not deliver email.
 */

import type { EmailPayload, EmailProvider } from '../types';

export class ConsoleEmailProvider implements EmailProvider {
  async send(payload: EmailPayload): Promise<void> {
    console.log('\n' + '═'.repeat(60));
    console.log('📧  [EMAIL — DEV CONSOLE FALLBACK]');
    console.log(`To      : ${payload.to}`);
    console.log(`Subject : ${payload.subject}`);
    console.log('─'.repeat(60));
    console.log(payload.text);
    console.log('═'.repeat(60) + '\n');
  }
}
