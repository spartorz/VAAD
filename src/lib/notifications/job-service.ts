/**
 * Notification job service — scheduler abstraction.
 *
 * Each exported function is a pure, idempotent job that can be invoked from:
 *   1. The admin manual trigger endpoint (POST /api/notifications/jobs/trigger)
 *   2. A future cron handler (e.g. Vercel Cron, an external scheduler, or a
 *      long-running worker) — add without touching this file.
 *
 * All jobs are safe to call multiple times for the same parameters.
 */

import { generatePaymentReminderBatch, GenerateBatchResult } from './batch-service';
import dbConnect from '@/lib/db';
import NotificationItem from '@/models/NotificationItem';
import { refreshBatchStats } from './batch-service';
import { Types } from 'mongoose';

// ─── Job result type ──────────────────────────────────────────────────────

export type JobStatus = 'ok' | 'skipped' | 'error';

export interface JobResult {
  job: string;
  status: JobStatus;
  message: string;
  data?: Record<string, unknown>;
}

// ─── Job: generate monthly payment reminder batch ─────────────────────────

export interface GenerateReminderBatchJobParams {
  buildingId: string;
  buildingName: string;
  month: string;
  createdBy: string;
  force?: boolean;
}

export async function jobGeneratePaymentReminderBatch(
  params: GenerateReminderBatchJobParams
): Promise<JobResult> {
  const jobName = 'generate_payment_reminder_batch';
  try {
    const result: GenerateBatchResult = await generatePaymentReminderBatch({
      ...params,
      channel: 'whatsapp_manual',
    });

    if (!result.created) {
      return {
        job: jobName,
        status: 'skipped',
        message: 'Batch already exists for this building/month/channel.',
        data: { batchId: result.batch._id.toString() },
      };
    }

    return {
      job: jobName,
      status: 'ok',
      message: `Batch created with ${result.itemCount} recipients.`,
      data: {
        batchId: result.batch._id.toString(),
        itemCount: result.itemCount,
      },
    };
  } catch (error) {
    console.error(`[job:${jobName}] failed`, error);
    return {
      job: jobName,
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ─── Job: retry failed notification items in a batch ──────────────────────

export interface RetryFailedItemsJobParams {
  batchId: string;
}

export async function jobRetryFailedItems(
  params: RetryFailedItemsJobParams
): Promise<JobResult> {
  const jobName = 'retry_failed_items';
  try {
    await dbConnect();
    const batchOid = new Types.ObjectId(params.batchId);

    // Only retry items that have retries remaining
    const result = await NotificationItem.updateMany(
      {
        batchId: batchOid,
        status: 'failed',
        $expr: { $lt: ['$retryCount', '$maxRetries'] },
      },
      {
        $set: {
          status: 'retrying',
          lastRetryAt: new Date(),
        },
      }
    );

    await refreshBatchStats(params.batchId);

    return {
      job: jobName,
      status: 'ok',
      message: `Reset ${result.modifiedCount} failed item(s) to pending.`,
      data: { batchId: params.batchId, resetCount: result.modifiedCount },
    };
  } catch (error) {
    console.error(`[job:${jobName}] failed`, error);
    return {
      job: jobName,
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ─── Job registry ─────────────────────────────────────────────────────────

export type JobName = 'generate_payment_reminder_batch' | 'retry_failed_items';

export const JOB_NAMES: JobName[] = [
  'generate_payment_reminder_batch',
  'retry_failed_items',
];
