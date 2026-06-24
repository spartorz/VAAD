/**
 * WhatsApp Business Cloud API provider (Meta Graph API).
 *
 * Implements the NotificationProvider interface for channel = 'whatsapp_api'.
 *
 * ── Setup ─────────────────────────────────────────────────────────────────────
 *
 * Required environment variables:
 *   WHATSAPP_API_TOKEN          System user permanent access token
 *   WHATSAPP_PHONE_NUMBER_ID    Phone number ID from Meta Business Manager
 *
 * Optional:
 *   WHATSAPP_API_VERSION        Graph API version (default: 'v18.0')
 *   NOTIFICATIONS_PROVIDER_ENABLED  Set to 'false' to disable all sends
 *
 * Webhook (handled separately in /api/webhooks/whatsapp):
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN   Random string for subscription handshake
 *   WHATSAPP_WEBHOOK_SECRET         App secret for HMAC-SHA256 signature validation
 *
 * ── Meta Cloud API reference ──────────────────────────────────────────────────
 *
 * Send message:
 *   POST https://graph.facebook.com/{version}/{phoneNumberId}/messages
 *   Authorization: Bearer {token}
 *
 * Delivery events arrive via webhook POST to /api/webhooks/whatsapp and contain
 * a `statuses[]` array with provider message IDs (wamid) and status strings.
 */

import type {
  NotificationProvider,
  ProviderSendParams,
  ProviderSendResult,
  ProviderDeliveryEvent,
  MetaTemplateComponent,
} from './types';

// ─── Meta API response shapes (internal) ─────────────────────────────────────

interface MetaSendSuccess {
  messaging_product: 'whatsapp';
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// Meta webhook payload shapes
interface MetaWebhookStatus {
  id: string;           // wamid
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;    // Unix epoch string
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

interface MetaWebhookValue {
  messaging_product: string;
  statuses?: MetaWebhookStatus[];
}

interface MetaWebhookChange {
  value: MetaWebhookValue;
  field: string;
}

interface MetaWebhookEntry {
  id: string;
  changes: MetaWebhookChange[];
}

interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

// ─── Permanent-failure error codes from Meta ──────────────────────────────────
// See: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes

const PERMANENT_FAILURE_CODES = new Set([
  131026, // Number not on WhatsApp
  131047, // Re-engagement message
  131051, // Unsupported message type
  131052, // Media download error (permanent)
  131053, // Media upload error (permanent)
  132000, // Template param count mismatch
  132001, // Template does not exist
  132005, // Template hydration error
  133000, // Incomplete deletion
]);

// ─── Provider implementation ──────────────────────────────────────────────────

export class WhatsAppBusinessProvider implements NotificationProvider {
  readonly name = 'whatsapp_business' as const;

  private readonly token: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  constructor(config: {
    token: string;
    phoneNumberId: string;
    apiVersion?: string;
  }) {
    this.token = config.token;
    this.phoneNumberId = config.phoneNumberId;
    this.apiVersion = config.apiVersion ?? 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
  }

  /**
   * Build a provider instance from environment variables.
   * Returns null (not throws) when required config is missing.
   */
  static fromEnv(): WhatsAppBusinessProvider | null {
    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      console.warn(
        '[WhatsAppBusinessProvider] WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set — provider disabled'
      );
      return null;
    }

    return new WhatsAppBusinessProvider({
      token,
      phoneNumberId,
      apiVersion: process.env.WHATSAPP_API_VERSION,
    });
  }

  // ── send ──────────────────────────────────────────────────────────────────

  async send(params: ProviderSendParams): Promise<ProviderSendResult> {
    try {
      // Build the request body based on whether a WhatsApp Business template is specified.
      // Template sends are required for all business-initiated outbound messages.
      // Free-text sends are only valid within the 24-hour customer-initiated window.
      const requestBody = params.template
        ? this.buildTemplatePayload(params.to, params.template)
        : this.buildTextPayload(params.to, params.message);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const body: MetaSendSuccess | MetaApiError = await response.json();

      if (!response.ok || 'error' in body) {
        const err = (body as MetaApiError).error;
        const isPermanent =
          PERMANENT_FAILURE_CODES.has(err?.code) ||
          PERMANENT_FAILURE_CODES.has(err?.error_subcode ?? -1);

        // Sanitize: include code and type only, not the full message that might
        // contain phone numbers or tokens
        return {
          outcome: 'failed',
          failureReason: `Meta error ${err?.code ?? response.status}: ${err?.type ?? 'unknown'}`,
          permanent: isPermanent,
        };
      }

      const success = body as MetaSendSuccess;
      const wamid = success.messages?.[0]?.id;

      if (!wamid) {
        return {
          outcome: 'failed',
          failureReason: 'Meta response missing message ID',
          permanent: false,
        };
      }

      return {
        outcome: 'accepted',
        providerMessageId: wamid,
      };
    } catch (err) {
      // Network error, timeout, JSON parse failure
      const message = err instanceof Error ? err.message : 'Network error';
      return {
        outcome: 'failed',
        failureReason: `Provider request failed: ${message}`,
        permanent: false,
      };
    }
  }

  // ── Payload builders ──────────────────────────────────────────────────────

  private buildTextPayload(to: string, message: string) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: message,
      },
    };
  }

  private buildTemplatePayload(
    to: string,
    template: { name: string; languageCode: string; components: MetaTemplateComponent[] }
  ) {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.languageCode },
      },
    };

    // Only include components array when there are actual parameters to pass
    if (template.components.length > 0) {
      (payload.template as Record<string, unknown>).components = template.components;
    }

    return payload;
  }

  // ── parseWebhookEvents ────────────────────────────────────────────────────

  parseWebhookEvents(payload: unknown): ProviderDeliveryEvent[] {
    const events: ProviderDeliveryEvent[] = [];

    try {
      const meta = payload as MetaWebhookPayload;
      if (meta?.object !== 'whatsapp_business_account') return events;

      for (const entry of meta.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if (change.field !== 'messages') continue;

          for (const status of change.value?.statuses ?? []) {
            const targetStatus = this.mapProviderStatus(status.status);
            if (!targetStatus) continue; // 'sent' events don't need item updates

            const eventAt = new Date(parseInt(status.timestamp, 10) * 1000);

            const event: ProviderDeliveryEvent = {
              providerMessageId: status.id,
              targetStatus,
              eventAt: isNaN(eventAt.getTime()) ? new Date() : eventAt,
            };

            if (status.status === 'failed' && status.errors?.length) {
              event.failureReason = `Provider error ${status.errors[0].code}: ${status.errors[0].title}`;
            }

            events.push(event);
          }
        }
      }
    } catch (err) {
      console.error('[WhatsAppBusinessProvider] Failed to parse webhook payload', err);
    }

    return events;
  }

  // ── Status mapping ─────────────────────────────────────────────────────────

  private mapProviderStatus(
    providerStatus: string
  ): ProviderDeliveryEvent['targetStatus'] | null {
    switch (providerStatus) {
      // 'sent' from Meta means "accepted by Meta infrastructure" — we already set
      // status = 'sent' when the send call returned a wamid, so no update needed.
      case 'sent':
        return null;
      case 'delivered':
        return 'delivered';
      case 'read':
        return 'read';
      case 'failed':
        return 'failed';
      default:
        return null;
    }
  }
}
