/**
 * Provider abstraction for notification delivery.
 *
 * Designed to support multiple transport backends (WhatsApp Business API,
 * SMS, Email) without leaking provider-specific logic into routes or services.
 *
 * Current implementations: whatsapp_business
 * Planned:                 resend (email), vonage (sms)
 */

import type { NotificationItemStatus } from '@/lib/types';

// ─── Provider identity ────────────────────────────────────────────────────────

export type ProviderName = 'manual' | 'whatsapp_business' | 'resend' | 'vonage';

// ─── Meta template component (shared by types.ts and the provider) ────────────

/**
 * A single component parameter in a Meta WhatsApp Business template message.
 * Currently only text parameters are needed for payment reminder templates.
 */
export interface MetaTemplateParameter {
  type: 'text';
  text: string;
}

/**
 * A component in a Meta WhatsApp Business template message.
 * Corresponds directly to the `components[]` field in the Meta Graph API payload.
 */
export interface MetaTemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: MetaTemplateParameter[];
}

// ─── Send params ──────────────────────────────────────────────────────────────

export interface ProviderSendParams {
  /** E.164 phone number without leading '+', e.g. '972501234567' */
  to: string;
  /**
   * Fully-rendered message body (used for free-text sends and as a fallback
   * for logging). For whatsapp_api template sends, `template` takes precedence.
   */
  message: string;
  /**
   * When present, the provider sends a WhatsApp Business template message
   * instead of free text. Required for all business-initiated outbound sends
   * on the whatsapp_api channel.
   */
  template?: {
    /** Exact template name registered in Meta Business Manager */
    name: string;
    /** IETF language code, e.g. 'he' */
    languageCode: string;
    /** Pre-built Meta component array — may be empty for templates with no variables */
    components: MetaTemplateComponent[];
  };
  /** Opaque reference ID used for correlating delivery events (e.g. itemId) */
  referenceId?: string;
}

// ─── Send result ──────────────────────────────────────────────────────────────

export type ProviderSendOutcome = 'accepted' | 'failed' | 'invalid';

export interface ProviderSendResult {
  outcome: ProviderSendOutcome;
  /** Provider-assigned message ID (e.g. Meta wamid) — present on success */
  providerMessageId?: string;
  /**
   * Human-readable failure reason — must NOT contain personal data or raw
   * provider responses. Strip or summarize before storing.
   */
  failureReason?: string;
  /**
   * When true, the failure is permanent (bad number, policy rejection).
   * Retry logic should not attempt this item again automatically.
   */
  permanent?: boolean;
}

// ─── Delivery event (from webhooks) ──────────────────────────────────────────

/**
 * Normalized delivery event emitted by a provider webhook and mapped to
 * internal NotificationItem status updates.
 */
export interface ProviderDeliveryEvent {
  /** Provider-assigned message ID — used to find the matching NotificationItem */
  providerMessageId: string;
  /** Internal status the item should be transitioned to */
  targetStatus: Extract<NotificationItemStatus, 'delivered' | 'read' | 'failed'>;
  /** UTC timestamp from the provider */
  eventAt: Date;
  /** Sanitized failure detail (for targetStatus = 'failed' only) */
  failureReason?: string;
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface NotificationProvider {
  readonly name: ProviderName;
  /**
   * Send a single message and return a normalized result.
   * Must never throw — all errors must be caught and returned as ProviderSendResult.
   */
  send(params: ProviderSendParams): Promise<ProviderSendResult>;
  /**
   * Parse a raw webhook payload (already verified) and extract delivery events.
   * Returns an empty array if the payload contains no relevant events.
   */
  parseWebhookEvents(payload: unknown): ProviderDeliveryEvent[];
}
