import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getSession } from '@/lib/api-utils';
import { canManageFinances, hasPermission } from '@/lib/auth';
import dbConnect from '@/lib/db';
import AutoBillingSettings from '@/models/AutoBillingSettings';
import {
  auditAutoBillingEvent,
  maybeRunAutoBillingForBuilding,
} from '@/lib/billing/auto-billing-service';

// GET /api/cron/auto-billing
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  let authorized = false;
  let scopedBuildingId: string | undefined;
  let actorUserId = new Types.ObjectId().toString();
  let actorName = 'system:cron';

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    authorized = true;
  }

  if (!authorized) {
    const session = await getSession();
    if (session && canManageFinances(session.role)) {
      authorized = true;
      actorUserId = session.id;
      actorName = session.name;
      if (!hasPermission(session.role, 'ADMIN')) {
        scopedBuildingId = session.buildingId;
      }
    }
  }

  if (!authorized) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dry_run') === 'true';
  const overrideMonth = searchParams.get('month') || undefined;
  const requestedBuildingId = searchParams.get('building_id') || undefined;
  const buildingId = scopedBuildingId || requestedBuildingId;

  if (buildingId && !Types.ObjectId.isValid(buildingId)) {
    return NextResponse.json({ success: false, error: 'Invalid building_id format' }, { status: 400 });
  }
  if (overrideMonth && !/^\d{4}-\d{2}$/.test(overrideMonth)) {
    return NextResponse.json({ success: false, error: 'Invalid month format — expected YYYY-MM' }, { status: 400 });
  }

  await dbConnect();

  const settingsQuery: Record<string, unknown> = { autoBillingEnabled: true };
  if (buildingId) settingsQuery.buildingId = new Types.ObjectId(buildingId);

  const settings = await AutoBillingSettings.find(settingsQuery).select('buildingId').lean();
  const buildingIds = settings.map((s) => s.buildingId.toString());

  const results: Array<Record<string, unknown>> = [];
  for (const bId of buildingIds) {
    try {
      await auditAutoBillingEvent({
        buildingId: bId,
        actorUserId,
        actorName,
        action: 'auto_billing_run_started',
        metadata: { period: overrideMonth, mode: 'cron', dryRun },
      });

      const outcome = await maybeRunAutoBillingForBuilding({
        buildingId: bId,
        actorUserId,
        actorName,
        overrideMonth,
        dryRun,
      });

      if (outcome.status === 'executed') {
        const run = outcome.runResult;
        if (run.approvalRequired) {
          await auditAutoBillingEvent({
            buildingId: bId,
            actorUserId,
            actorName,
            action: 'auto_billing_skipped',
            metadata: {
              period: run.period,
              mode: 'cron',
              reason: 'approval_required',
              eligibleCount: run.eligibleCount,
              skippedCount: run.skippedCount,
            },
          });
          results.push({ buildingId: bId, status: 'skipped', reason: 'approval_required', period: run.period });
        } else {
          await auditAutoBillingEvent({
            buildingId: bId,
            actorUserId,
            actorName,
            action: 'auto_billing_charges_generated',
            metadata: {
              period: run.period,
              mode: 'cron',
              eligibleCount: run.eligibleCount,
              createdCount: run.createdCount,
              skippedCount: run.skippedCount,
              totalAmount: run.totalAmount,
            },
          });
          results.push({
            buildingId: bId,
            status: 'generated',
            period: run.period,
            createdCount: run.createdCount,
            skippedCount: run.skippedCount,
          });
        }
      } else if (outcome.status === 'preview') {
        results.push({
          buildingId: bId,
          status: 'preview',
          period: outcome.period,
          eligibleCount: outcome.preview.eligibleCount,
          skippedCount: outcome.preview.skippedCount,
        });
      } else {
        results.push({ buildingId: bId, status: 'skipped', reason: outcome.reason, period: outcome.period });
      }
    } catch (error) {
      await auditAutoBillingEvent({
        buildingId: bId,
        actorUserId,
        actorName,
        action: 'auto_billing_failed',
        metadata: {
          mode: 'cron',
          error: error instanceof Error ? error.message : 'Unknown error',
          period: overrideMonth,
        },
      });
      results.push({
        buildingId: bId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      runAt: new Date().toISOString(),
      dryRun,
      month: overrideMonth,
      total: buildingIds.length,
      results,
    },
  });
}
