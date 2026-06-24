/**
 * Notification cron service — monthly reminder scheduling logic.
 *
 * Designed as a pure, dependency-injected module with no HTTP concerns so it
 * can be tested in isolation and called from any transport layer (API route,
 * Vercel Cron, queue worker, etc.).
 *
 * Key design choices:
 *  - Idempotent: safe to call multiple times per day — skips buildings whose
 *    batch already exists for the current month / channel.
 *  - Timezone-aware: compares the day-of-month in the building's own timezone
 *    using the native Intl API (no extra dependencies).
 *  - Non-sending: batches are created and optionally auto-approved, but NO
 *    messages are dispatched.
 *  - Auditable: every outcome (created / skipped / already_exists / error)
 *    emits an audit log entry.
 */

import dbConnect from '@/lib/db';
import { createAuditLog } from '@/lib/api-utils';
import Building from '@/models/Building';
import NotificationSettings from '@/models/NotificationSettings';
import NotificationBatch from '@/models/NotificationBatch';
import { jobGeneratePaymentReminderBatch } from './job-service';
import { Types } from 'mongoose';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Sentinel ObjectId used as the actor for all system-initiated actions.
 * All-zeros is a valid 24-char hex ObjectId that cannot belong to a real user.
 */
export const SYSTEM_ACTOR_ID = '000000000000000000000000';
export const SYSTEM_ACTOR_NAME = 'system_cron';

// ─── Result types ─────────────────────────────────────────────────────────────

export type CronBuildingStatus = 'generated' | 'skipped' | 'already_exists' | 'error';

export type CronSkipReason =
  | 'reminders_disabled'
  | 'manual_mode'
  | 'not_reminder_day'
  | 'dry_run';

export interface CronBuildingResult {
  buildingId: string;
  buildingName: string;
  status: CronBuildingStatus;
  /** Populated when status is 'skipped' */
  skipReason?: CronSkipReason;
  /** Month the batch was (or would have been) created for (YYYY-MM) */
  month?: string;
  batchId?: string;
  itemCount?: number;
  /** True when mode is fully_automatic and the batch was auto-approved */
  autoApproved?: boolean;
  error?: string;
}

export interface CronRunSummary {
  total: number;
  generated: number;
  skipped: number;
  alreadyExists: number;
  errors: number;
}

export interface MonthlyRemindersRunResult {
  runAt: Date;
  month: string;
  dryRun: boolean;
  results: CronBuildingResult[];
  summary: CronRunSummary;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface RunMonthlyRemindersOptions {
  /**
   * When true, the cron logic is simulated in full (skip checks, date checks)
   * but no batches are created and no audit logs are emitted.
   */
  dryRun?: boolean;

  /**
   * If provided, only this building is processed (useful for targeted testing).
   * Must be a valid ObjectId string.
   */
  buildingId?: string;

  /**
   * Override the target month (YYYY-MM). When set, the day-of-month check is
   * bypassed so you can trigger a run for any month on any day.
   */
  overrideMonth?: string;
}

// ─── Timezone helpers ─────────────────────────────────────────────────────────

interface DateParts {
  year: number;
  month: number; // 1-based
  day: number;
}

/**
 * Returns the current year / month / day in the given IANA timezone string.
 * Falls back to UTC if the timezone identifier is invalid.
 */
function getCurrentDateInTimezone(tz: string): DateParts {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const get = (type: string) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

    return { year: get('year'), month: get('month'), day: get('day') };
  } catch {
    // Invalid timezone — fall back to Israel time
    const fallbackParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type: string) =>
      parseInt(fallbackParts.find((p) => p.type === type)?.value ?? '0', 10);
    return { year: get('year'), month: get('month'), day: get('day') };
  }
}

function toMonthString({ year, month }: DateParts): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// ─── Auto-approve helper ──────────────────────────────────────────────────────

/**
 * Transitions a batch from ready_for_review → ready, marking it as
 * system-approved. Used only when reminderMode === 'fully_automatic'.
 * Does NOT dispatch any messages.
 *
 * Returns true when the batch was actually transitioned; false if it was
 * already in a non-review state (idempotent).
 */
async function autoApproveBatch(batchId: string): Promise<boolean> {
  const batch = await NotificationBatch.findById(batchId);
  if (!batch || batch.status !== 'ready_for_review') return false;

  batch.status = 'ready';
  batch.approvedBy = new Types.ObjectId(SYSTEM_ACTOR_ID);
  batch.approvedAt = new Date();
  await batch.save();
  return true;
}

// ─── Core scheduling logic ────────────────────────────────────────────────────

/**
 * Runs the monthly reminder cron for all buildings (or a single building when
 * `buildingId` is provided). Returns a detailed per-building result plus an
 * aggregated summary.
 *
 * This function is safe to call multiple times — all operations are idempotent.
 */
export async function runMonthlyReminders(
  options: RunMonthlyRemindersOptions = {}
): Promise<MonthlyRemindersRunResult> {
  const { dryRun = false, buildingId, overrideMonth } = options;
  const runAt = new Date();

  await dbConnect();

  // ── Load buildings ────────────────────────────────────────────────────────

  const buildingQuery = buildingId ? { _id: new Types.ObjectId(buildingId) } : {};
  const buildings = await Building.find(buildingQuery).lean();

  const results: CronBuildingResult[] = [];

  // ── Per-building loop ─────────────────────────────────────────────────────

  for (const building of buildings) {
    const bid = building._id.toString();
    const bname = building.name;

    // Load settings (may not exist for newly created buildings)
    const settings = await NotificationSettings.findOne({
      buildingId: building._id,
    }).lean();

    // ── Guard: master switch ──────────────────────────────────────────────

    if (!settings || !settings.paymentRemindersEnabled) {
      results.push({
        buildingId: bid,
        buildingName: bname,
        status: 'skipped',
        skipReason: 'reminders_disabled',
      });

      if (!dryRun) {
        await createAuditLog({
          buildingId: bid,
          actorUserId: SYSTEM_ACTOR_ID,
          actorName: SYSTEM_ACTOR_NAME,
          action: 'notification_batch_auto_skipped',
          entityType: 'notification_settings',
          entityId: bid,
          metadata: { reason: 'reminders_disabled', buildingName: bname },
        });
      }
      continue;
    }

    // ── Guard: mode must be automated ─────────────────────────────────────

    if (settings.reminderMode === 'manual_only') {
      results.push({
        buildingId: bid,
        buildingName: bname,
        status: 'skipped',
        skipReason: 'manual_mode',
      });

      if (!dryRun) {
        await createAuditLog({
          buildingId: bid,
          actorUserId: SYSTEM_ACTOR_ID,
          actorName: SYSTEM_ACTOR_NAME,
          action: 'notification_batch_auto_skipped',
          entityType: 'notification_settings',
          entityId: bid,
          metadata: { reason: 'manual_mode', buildingName: bname },
        });
      }
      continue;
    }

    // ── Resolve target month and day check ────────────────────────────────

    const tz = building.timezone ?? 'Asia/Jerusalem';
    const dateInTz = getCurrentDateInTimezone(tz);
    const month = overrideMonth ?? toMonthString(dateInTz);

    // Skip the day check only when an explicit month override is provided
    if (!overrideMonth && dateInTz.day !== settings.reminderDayOfMonth) {
      results.push({
        buildingId: bid,
        buildingName: bname,
        status: 'skipped',
        skipReason: 'not_reminder_day',
        month,
      });
      // No audit log for this — it is the normal state on non-trigger days
      continue;
    }

    // ── Dry-run path ──────────────────────────────────────────────────────

    if (dryRun) {
      results.push({
        buildingId: bid,
        buildingName: bname,
        status: 'generated', // what would happen
        skipReason: 'dry_run',
        month,
      });
      continue;
    }

    // ── Generate batch (idempotent via job-service) ───────────────────────

    let jobResult;
    try {
      jobResult = await jobGeneratePaymentReminderBatch({
        buildingId: bid,
        buildingName: bname,
        month,
        createdBy: SYSTEM_ACTOR_ID,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      results.push({
        buildingId: bid,
        buildingName: bname,
        status: 'error',
        month,
        error: errorMsg,
      });
      // Errors are notable but shouldn't abort the run for other buildings
      continue;
    }

    // ── Handle: batch already exists ──────────────────────────────────────

    if (jobResult.status === 'skipped') {
      const batchId = jobResult.data?.batchId as string | undefined;
      results.push({
        buildingId: bid,
        buildingName: bname,
        status: 'already_exists',
        month,
        batchId,
      });

      await createAuditLog({
        buildingId: bid,
        actorUserId: SYSTEM_ACTOR_ID,
        actorName: SYSTEM_ACTOR_NAME,
        action: 'notification_batch_already_exists',
        entityType: 'notification_batch',
        entityId: batchId ?? bid,
        metadata: {
          buildingName: bname,
          month,
          reminderMode: settings.reminderMode,
        },
      });
      continue;
    }

    // ── Handle: job error ─────────────────────────────────────────────────

    if (jobResult.status === 'error') {
      results.push({
        buildingId: bid,
        buildingName: bname,
        status: 'error',
        month,
        error: jobResult.message,
      });
      continue;
    }

    // ── Success: batch created ────────────────────────────────────────────

    const batchId = jobResult.data!.batchId as string;
    const itemCount = jobResult.data!.itemCount as number;
    let autoApproved = false;

    // For fully_automatic mode: simulate the approval step so the batch moves
    // from ready_for_review → ready. Still does NOT send messages.
    if (settings.reminderMode === 'fully_automatic') {
      autoApproved = await autoApproveBatch(batchId);

      if (autoApproved) {
        await createAuditLog({
          buildingId: bid,
          actorUserId: SYSTEM_ACTOR_ID,
          actorName: SYSTEM_ACTOR_NAME,
          action: 'notification_batch_approved',
          entityType: 'notification_batch',
          entityId: batchId,
          metadata: {
            buildingName: bname,
            month,
            trigger: 'cron_auto_approve',
          },
        });
      }
    }

    results.push({
      buildingId: bid,
      buildingName: bname,
      status: 'generated',
      month,
      batchId,
      itemCount,
      autoApproved,
    });

    await createAuditLog({
      buildingId: bid,
      actorUserId: SYSTEM_ACTOR_ID,
      actorName: SYSTEM_ACTOR_NAME,
      action: 'notification_batch_auto_created',
      entityType: 'notification_batch',
      entityId: batchId,
      metadata: {
        buildingName: bname,
        month,
        reminderMode: settings.reminderMode,
        itemCount,
        autoApproved,
      },
    });
  }

  // ── Build summary ─────────────────────────────────────────────────────────

  const summary: CronRunSummary = results.reduce(
    (acc, r) => {
      acc.total++;
      if (r.status === 'generated') acc.generated++;
      else if (r.status === 'skipped') acc.skipped++;
      else if (r.status === 'already_exists') acc.alreadyExists++;
      else if (r.status === 'error') acc.errors++;
      return acc;
    },
    { total: 0, generated: 0, skipped: 0, alreadyExists: 0, errors: 0 }
  );

  // Derive the canonical "run month" — prefer the override or the first
  // resolved month from the results, falling back to UTC current month.
  const resolvedMonth =
    overrideMonth ??
    results.find((r) => r.month)?.month ??
    toMonthString(getCurrentDateInTimezone('Asia/Jerusalem'));

  return { runAt, month: resolvedMonth, dryRun, results, summary };
}
