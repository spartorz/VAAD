/**
 * Email service — public entry point.
 *
 * Route handlers import ONLY from here, never from providers/ directly.
 * To add a new provider:
 *   1. Create providers/<name>.ts implementing EmailProvider
 *   2. Add a branch in getEmailProvider() below
 *   3. Set the corresponding env vars
 */

import type { EmailProvider, SendEmailResult } from './types';
import { buildPasswordResetEmail } from './templates/password-reset';

// ── Provider factory ──────────────────────────────────────────────────────────

/**
 * Returns the configured email provider.
 * Falls back to the console logger when no provider env vars are set.
 */
function getEmailProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM;

  if (apiKey && fromAddress) {
    // Dynamic require so the Resend module is only loaded when configured
    const { ResendEmailProvider } = require('./providers/resend') as typeof import('./providers/resend');
    return new ResendEmailProvider(apiKey, fromAddress);
  }

  // No provider configured — use the safe console fallback
  if (process.env.NODE_ENV === 'production') {
    // Warn loudly in production so operators notice immediately
    console.warn(
      '[email] WARNING: RESEND_API_KEY or EMAIL_FROM is not set. ' +
        'Password reset emails will NOT be delivered. ' +
        'Set the env vars and redeploy.'
    );
  }

  const { ConsoleEmailProvider } = require('./providers/console') as typeof import('./providers/console');
  return new ConsoleEmailProvider();
}

// ── Public send functions ─────────────────────────────────────────────────────

export interface SendPasswordResetEmailParams {
  /** Recipient's email address */
  to: string;
  /** Recipient's display name (used in greeting) */
  userName: string;
  /** Full reset URL including the raw token */
  resetUrl: string;
  /** Token expiry timestamp */
  expiresAt: Date;
}

/**
 * Sends a password-reset email.
 *
 * Always returns { success, error? } — never throws.
 * The caller decides how to handle failures (log, audit, etc.).
 */
export async function sendPasswordResetEmail(
  params: SendPasswordResetEmailParams
): Promise<SendEmailResult> {
  try {
    const provider = getEmailProvider();
    const content = buildPasswordResetEmail({
      userName: params.userName,
      resetUrl: params.resetUrl,
      expiresAt: params.expiresAt,
    });

    await provider.send({
      to: params.to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Never include the resetUrl or any token in the error log
    console.error(`[email] sendPasswordResetEmail failed for recipient (redacted): ${message}`);
    return { success: false, error: message };
  }
}

// Re-export types for callers that need them
export type { SendEmailResult } from './types';
