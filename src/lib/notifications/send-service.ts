/**
 * Send service — provider-based delivery pipeline for whatsapp_api batches.
 *
 * This module is the only place where NotificationItems are sent to an
 * external provider. It is deliberately NOT wired to whatsapp_manual — that
 * channel continues to work exactly as before via the manual click-to-chat UI.
 *
 * Key guarantees:
 *  - Only items with channel = 'whatsapp_api' and status = 'pending' are sent
 *  - Already-sent/delivered/read items are skipped (idempotent)
 *  - Items are marked 'queued' before the provider call, 'sent' on success,
 *    and 'failed' on error — no item is left in an ambiguous state
 *  - whatsapp_api batches MUST have a configured WhatsApp Business template —
 *    the send is blocked (not silently degraded) if the template is missing
 *  - Residents who have explicitly opted out (whatsappOptIn === false) are
 *    skipped with skipReason = 'no_consent'
 *  - The batch status is updated after all items are processed
 *  - All errors are caught per-item; one failure does not abort the batch
 *
 * Phase 2.6 additions:
 *  - Template validation at batch level (blocks if no whatsappTemplateName)
 *  - Per-item consent check (skips if resident.whatsappOptIn === false)
 *  - Builds Meta template component parameters from item.metadata.renderContext
 *  - Passes template params to provider.send() for API-compliant delivery
 */

import dbConnect from '@/lib/db';
import { createAuditLog } from '@/lib/api-utils';
import NotificationItem from '@/models/NotificationItem';
import NotificationBatch from '@/models/NotificationBatch';
import NotificationTemplate from '@/models/NotificationTemplate';
import Resident from '@/models/Resident';
import { refreshBatchStats } from './batch-service';
import { getProviderForChannel } from './providers';
import { buildWhatsAppComponents, type TemplateRenderContext } from './template-renderer';
import type { MetaTemplateComponent } from './providers/types';
import { Types } from 'mongoose';

function classifyFailureReason(reason?: string): 'provider_error' | 'rate_limited' | 'blocked_by_user' | 'unknown' {
  const value = (reason || '').toLowerCase();
  if (!value) return 'unknown';
  if (value.includes('rate') || value.includes('429') || value.includes('limit')) return 'rate_limited';
  if (value.includes('blocked') || value.includes('opt') || value.includes('consent')) return 'blocked_by_user';
  if (value.includes('provider') || value.includes('meta') || value.includes('api')) return 'provider_error';
  return 'unknown';
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SendBatchOptions {
  batchId: string;
  buildingId: string;
  /** userId or 'system' */
  triggeredBy: string;
  triggeredByName?: string;
  /** When true, no API calls are made and no state is changed */
  dryRun?: boolean;
}

export interface SendBatchItemSummary {
  itemId: string;
  status: 'sent' | 'failed' | 'skipped';
  providerMessageId?: string;
  failureReason?: string;
}

export interface SendBatchResult {
  batchId: string;
  month: string;
  dryRun: boolean;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  consentSkipped: number;
  items: SendBatchItemSummary[];
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

/**
 * Send all eligible items in a batch via the configured provider.
 *
 * Eligibility criteria:
 *  - batch.channel === 'whatsapp_api'
 *  - batch.status === 'ready' (or 'approved')
 *  - item.status === 'pending'
 *  - item has a phone number
 *  - item.retryCount < item.maxRetries (for re-attempts)
 *
 * Pre-flight checks (batch-level, fail fast):
 *  - Template must exist and have whatsappTemplateName configured
 *  - Provider must be available (unless dryRun)
 *
 * Per-item checks:
 *  - Resident must not have whatsappOptIn === false
 */
export async function sendBatchItems(options: SendBatchOptions): Promise<SendBatchResult> {
  const { batchId, buildingId, triggeredBy, triggeredByName, dryRun = false } = options;

  await dbConnect();

  const batchOid = new Types.ObjectId(batchId);
  const buildingOid = new Types.ObjectId(buildingId);

  // ── Load and validate batch ───────────────────────────────────────────────

  const batch = await NotificationBatch.findOne({
    _id: batchOid,
    buildingId: buildingOid,
  });

  if (!batch) throw new Error(`Batch ${batchId} not found`);

  if (batch.channel !== 'whatsapp_api') {
    throw new Error(
      `Batch channel is '${batch.channel}' — provider sending only applies to whatsapp_api`
    );
  }

  if (!['ready', 'approved'].includes(batch.status)) {
    throw new Error(
      `Batch status is '${batch.status}' — must be 'ready' or 'approved' to send`
    );
  }

  // ── Template validation (batch-level pre-flight) ───────────────────────────
  //
  // Meta Cloud API requires approved message templates for business-initiated
  // conversations. Sending free text is not allowed. Block the entire send if
  // the template is not properly configured.

  let whatsappTemplateName: string | undefined;
  let whatsappLanguageCode: string | undefined;
  let whatsappComponentMappings: Array<{ type: 'header' | 'body' | 'button'; variableNames: string[] }> = [];

  if (batch.templateId) {
    const tpl = await NotificationTemplate.findOne({
      _id: batch.templateId,
      buildingId: buildingOid,
    }).lean();

    if (tpl) {
      whatsappTemplateName = tpl.whatsappTemplateName;
      whatsappLanguageCode = tpl.whatsappLanguageCode;
      whatsappComponentMappings = (tpl.whatsappComponents ?? []) as typeof whatsappComponentMappings;
    }
  }

  if (!whatsappTemplateName && !dryRun) {
    await createAuditLog({
      buildingId,
      actorUserId: triggeredBy,
      actorName: triggeredByName,
      action: 'notification_template_blocked',
      entityType: 'notification_batch',
      entityId: batchId,
      metadata: {
        month: batch.month,
        channel: batch.channel,
        templateId: batch.templateId?.toString(),
        reason: 'whatsappTemplateName not configured on template',
      },
    });

    throw new Error(
      'WhatsApp Business template not configured. ' +
      'Set "whatsappTemplateName" on the notification template before sending via whatsapp_api. ' +
      'This is required for Meta-compliant business-initiated messaging.'
    );
  }

  // ── Feature flag / provider check ─────────────────────────────────────────

  const provider = getProviderForChannel('whatsapp_api');

  if (!provider && !dryRun) {
    throw new Error(
      'WhatsApp provider is not configured. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID, ' +
      'or set NOTIFICATIONS_PROVIDER_ENABLED=false to suppress this error.'
    );
  }

  // ── Load eligible items ───────────────────────────────────────────────────

  const eligibleItems = await NotificationItem.find({
    batchId: batchOid,
    status: { $in: ['pending', 'retrying'] },
    $expr: { $lt: ['$retryCount', '$maxRetries'] },
  });

  const result: SendBatchResult = {
    batchId,
    month: batch.month,
    dryRun,
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    consentSkipped: 0,
    items: [],
  };

  if (eligibleItems.length === 0) {
    return result;
  }

  // ── Consent pre-check: batch-load resident opt-in status ──────────────────
  //
  // Load all relevant residents in one query to avoid N+1.
  // Missing residents (no residentId) are treated as consented (backward compat).

  const residentIds = eligibleItems
    .filter((item) => item.residentId)
    .map((item) => item.residentId!);

  const residents = residentIds.length > 0
    ? await Resident.find({ _id: { $in: residentIds } }).select('_id whatsappOptIn').lean()
    : [];

  const residentOptInMap = new Map<string, boolean | undefined>(
    residents.map((r) => [r._id.toString(), r.whatsappOptIn])
  );

  // ── Mark batch as processing ──────────────────────────────────────────────

  if (!dryRun) {
    batch.status = 'processing';
    await batch.save();

    await createAuditLog({
      buildingId,
      actorUserId: triggeredBy,
      actorName: triggeredByName,
      action: 'notification_provider_send_started',
      entityType: 'notification_batch',
      entityId: batchId,
      metadata: {
        month: batch.month,
        channel: batch.channel,
        eligibleCount: eligibleItems.length,
        provider: provider?.name ?? 'none',
        whatsappTemplateName: whatsappTemplateName ?? 'dry-run',
      },
    });
  }

  // ── Process each item ─────────────────────────────────────────────────────

  const now = new Date();

  for (const item of eligibleItems) {
    const itemId = item._id.toString();

    // Guard: phone required
    if (!item.phone) {
      result.skipped++;
      result.items.push({ itemId, status: 'skipped', failureReason: 'no_phone' });
      continue;
    }

    // Guard: consent check
    // whatsappOptIn === false → explicitly opted out.
    // undefined / true → consent assumed (backward compat).
    const residentOptIn = item.residentId
      ? residentOptInMap.get(item.residentId.toString())
      : undefined;

    if (residentOptIn === false) {
      result.skipped++;
      result.consentSkipped++;
      result.items.push({ itemId, status: 'skipped', failureReason: 'no_consent' });

      if (!dryRun) {
        item.status = 'cancelled';
        item.skipReason = 'no_consent';
        item.failureCode = 'blocked_by_user';
        await item.save();
      }
      continue;
    }

    result.attempted++;

    if (dryRun) {
      result.sent++;
      result.items.push({ itemId, status: 'sent' });
      continue;
    }

    // ── Build Meta template parameters from stored render context ─────────

    let templateParams: { name: string; languageCode: string; components: MetaTemplateComponent[] } | undefined;

    if (whatsappTemplateName) {
      const renderContext = (item.metadata?.renderContext as TemplateRenderContext | undefined);
      const builtComponents = renderContext && whatsappComponentMappings.length > 0
        ? buildWhatsAppComponents(whatsappComponentMappings, renderContext)
        : [];

      templateParams = {
        name: whatsappTemplateName,
        languageCode: whatsappLanguageCode ?? 'he',
        components: builtComponents as MetaTemplateComponent[],
      };
    }

    // Mark as queued before provider call (prevents double-send on retry)
    item.status = 'queued';
    item.lastAttemptAt = now;
    item.queuedAt = now;
    item.provider = provider!.name;
    if (whatsappTemplateName) {
      item.whatsappTemplateName = whatsappTemplateName;
    }
    await item.save();

    // Call provider with template params
    const sendResult = await provider!.send({
      to: item.phone,
      message: item.renderedMessage,
      template: templateParams,
      referenceId: itemId,
    });

    if (sendResult.outcome === 'accepted') {
      item.status = 'sent';
      item.providerMessageId = sendResult.providerMessageId;
      item.sentAt = now;
      item.failureReason = undefined;
      item.failureCode = undefined;
      await item.save();

      result.sent++;
      result.items.push({
        itemId,
        status: 'sent',
        providerMessageId: sendResult.providerMessageId,
      });

      await createAuditLog({
        buildingId,
        actorUserId: triggeredBy,
        actorName: triggeredByName,
        action: 'notification_provider_send_succeeded',
        entityType: 'notification_item',
        entityId: itemId,
        metadata: {
          batchId,
          month: batch.month,
          providerMessageId: sendResult.providerMessageId,
          provider: provider!.name,
          whatsappTemplateName: whatsappTemplateName,
        },
      });
    } else {
      item.status = 'failed';
      item.failureReason = sendResult.failureReason ?? 'Provider error';
      item.failureCode = classifyFailureReason(sendResult.failureReason);
      item.retryCount += 1;
      item.failedAt = now;
      item.retryHistory = [
        ...(item.retryHistory || []),
        {
          attempt: item.retryCount,
          timestamp: now,
          result: 'failed',
          reason: item.failureReason,
        },
      ];
      if (sendResult.permanent) {
        item.maxRetries = item.retryCount;
      }
      await item.save();

      await createAuditLog({
        buildingId,
        actorUserId: triggeredBy,
        actorName: triggeredByName,
        action: 'notification_failed',
        entityType: 'notification_item',
        entityId: itemId,
        metadata: {
          batchId,
          failureCode: item.failureCode,
          failureReason: item.failureReason,
          retryCount: item.retryCount,
        },
      });

      result.failed++;
      result.items.push({
        itemId,
        status: 'failed',
        failureReason: item.failureReason,
      });

      await createAuditLog({
        buildingId,
        actorUserId: triggeredBy,
        actorName: triggeredByName,
        action: 'notification_provider_send_failed',
        entityType: 'notification_item',
        entityId: itemId,
        metadata: {
          batchId,
          month: batch.month,
          failureReason: item.failureReason,
          permanent: sendResult.permanent ?? false,
          retryCount: item.retryCount,
          provider: provider!.name,
          whatsappTemplateName: whatsappTemplateName,
        },
      });
    }
  }

  // ── Refresh stats and update batch status ─────────────────────────────────

  if (!dryRun) {
    await refreshBatchStats(batchId);

    const updatedBatch = await NotificationBatch.findById(batchOid);
    if (updatedBatch) {
      const hasPendingItems = updatedBatch.stats.pending > 0;
      const hasRetryingItems = (updatedBatch.stats.retrying ?? 0) > 0;
      const hasFailedItems = updatedBatch.stats.failed > 0;

      if (!hasPendingItems && !hasRetryingItems && !hasFailedItems) {
        updatedBatch.status = 'completed';
      } else {
        updatedBatch.status = 'ready';
      }
      await updatedBatch.save();
    }
  }

  return result;
}
