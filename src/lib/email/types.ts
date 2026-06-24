/**
 * Core email abstractions.
 *
 * Keep provider-specific code out of this file.
 * Route handlers and services only import from `@/lib/email` (the index).
 */

export interface EmailPayload {
  /** Recipient address */
  to: string;
  subject: string;
  /** Full HTML body */
  html: string;
  /** Plain-text fallback (for clients that don't render HTML) */
  text: string;
}

export interface EmailProvider {
  send(payload: EmailPayload): Promise<void>;
}

export interface SendEmailResult {
  success: boolean;
  /** Internal error message — safe to log server-side, never sent to clients */
  error?: string;
}
