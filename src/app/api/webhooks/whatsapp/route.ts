/**
 * GET  /api/webhooks/whatsapp — Meta webhook subscription verification
 * POST /api/webhooks/whatsapp — WhatsApp delivery status events
 *
 * ── Verification flow (GET) ───────────────────────────────────────────────────
 * When you register a webhook in Meta Business Manager, Meta sends a GET with:
 *   ?hub.mode=subscribe&hub.verify_token=<your_token>&hub.challenge=<nonce>
 * Respond with the raw challenge string to confirm ownership.
 *
 * Requires: WHATSAPP_WEBHOOK_VERIFY_TOKEN env var
 *
 * ── Delivery events (POST) ────────────────────────────────────────────────────
 * Meta sends POST requests with delivery status updates (delivered, read, failed).
 * This handler:
 *   1. Validates the HMAC-SHA256 signature (optional, requires WHATSAPP_WEBHOOK_SECRET)
 *   2. Parses the payload using the provider's parseWebhookEvents()
 *   3. For each event, finds the matching NotificationItem by providerMessageId
 *   4. Applies the status transition (only forward: sent→delivered→read)
 *   5. Emits an audit log entry
 *   6. Always returns 200 — Meta will retry on non-2xx responses
 *
 * Idempotency: status transitions are guard-checked (no backward transitions).
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/db';
import { createAuditLog } from '@/lib/api-utils';
import NotificationItem from '@/models/NotificationItem';
import { refreshBatchStats } from '@/lib/notifications/batch-service';
import { WhatsAppBusinessProvider } from '@/lib/notifications/providers/whatsapp-business';
import type { ProviderDeliveryEvent } from '@/lib/notifications/providers/types';
import type { NotificationItemStatus } from '@/lib/types';

// ─── Status progression order (forward only) ─────────────────────────────────

const STATUS_ORDER: Record<NotificationItemStatus, number> = {
  pending: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  opened_manual: 5,
  failed: 5,
  cancelled: 5,
};

function isForwardTransition(
  current: NotificationItemStatus,
  next: NotificationItemStatus
): boolean {
  // Always allow failed (failure can come at any stage)
  if (next === 'failed') return true;
  return STATUS_ORDER[next] > STATUS_ORDER[current];
}

// ─── HMAC signature validation ────────────────────────────────────────────────

function validateSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) {
    // Signature validation not configured — skip (acceptable for development)
    return true;
  }
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const received = signatureHeader.slice('sha256='.length);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

// ─── GET — webhook verification ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error('[webhook:whatsapp] WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set');
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('[webhook:whatsapp] Webhook subscription verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// ─── POST — delivery status events ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Always return 200 to prevent Meta from retrying endlessly
  const alwaysOk = () => NextResponse.json({ received: true }, { status: 200 });

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return alwaysOk();
  }

  // Validate signature if secret is configured
  const signature = request.headers.get('x-hub-signature-256');
  if (!validateSignature(rawBody, signature)) {
    console.warn('[webhook:whatsapp] Invalid signature — payload rejected');
    return alwaysOk(); // Still 200 to avoid log spam from Meta retries
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return alwaysOk();
  }

  try {
    await dbConnect();

    const provider = new WhatsAppBusinessProvider({
      token: process.env.WHATSAPP_API_TOKEN ?? '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    });

    const events: ProviderDeliveryEvent[] = provider.parseWebhookEvents(payload);

    if (events.length === 0) return alwaysOk();

    // Minimal audit entry for the batch of events (avoid per-event overhead)
    const uniqueBatchIds = new Set<string>();

    for (const event of events) {
      await processDeliveryEvent(event, uniqueBatchIds);
    }

    // Refresh stats for all affected batches
    await Promise.all(
      Array.from(uniqueBatchIds).map((bid) =>
        refreshBatchStats(bid).catch((e) =>
          console.error('[webhook:whatsapp] Failed to refresh batch stats', e)
        )
      )
    );

    await createAuditLog({
      buildingId: '000000000000000000000000', // system-level event (no single building)
      actorUserId: '000000000000000000000000',
      actorName: 'whatsapp_webhook',
      action: 'notification_webhook_received',
      entityType: 'notification_item',
      entityId: '000000000000000000000000',
      metadata: {
        eventCount: events.length,
        provider: 'whatsapp_business',
      },
    });
  } catch (err) {
    console.error('[webhook:whatsapp] Unhandled error', err);
    // Still return 200 — we'll surface the error through logs/monitoring
  }

  return alwaysOk();
}

// ─── Per-event processor ──────────────────────────────────────────────────────

async function processDeliveryEvent(
  event: ProviderDeliveryEvent,
  affectedBatchIds: Set<string>
): Promise<void> {
  const item = await NotificationItem.findOne({
    providerMessageId: event.providerMessageId,
  });

  if (!item) {
    // Normal for messages sent outside VAAD — log at debug level only
    return;
  }

  const currentStatus = item.status as NotificationItemStatus;

  // Guard: only allow forward status transitions
  if (!isForwardTransition(currentStatus, event.targetStatus)) {
    return;
  }

  item.status = event.targetStatus;

  if (event.targetStatus === 'delivered') {
    item.deliveredAt = event.eventAt;
  } else if (event.targetStatus === 'read') {
    item.deliveredAt = item.deliveredAt ?? event.eventAt; // ensure deliveredAt is set
    item.readAt = event.eventAt;
  } else if (event.targetStatus === 'failed') {
    item.failureReason = event.failureReason ?? 'Delivery failed';
    item.retryCount += 1;
  }

  await item.save();
  affectedBatchIds.add(item.batchId.toString());

  await createAuditLog({
    buildingId: item.buildingId.toString(),
    actorUserId: '000000000000000000000000',
    actorName: 'whatsapp_webhook',
    action: 'notification_delivery_updated',
    entityType: 'notification_item',
    entityId: item._id.toString(),
    metadata: {
      batchId: item.batchId.toString(),
      providerMessageId: event.providerMessageId,
      fromStatus: currentStatus,
      toStatus: event.targetStatus,
      eventAt: event.eventAt.toISOString(),
    },
  });
}
