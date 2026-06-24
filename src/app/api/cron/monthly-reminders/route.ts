import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/api-utils';
import { hasPermission } from '@/lib/auth';
import { runMonthlyReminders } from '@/lib/notifications/cron-service';
import { Types } from 'mongoose';

/**
 * GET /api/cron/monthly-reminders
 *
 * Generates monthly payment reminder batches for all eligible buildings.
 * Safe to call multiple times — all operations are fully idempotent.
 *
 * ── Authentication ────────────────────────────────────────────────────────────
 *
 * Three modes are supported:
 *
 *   1. CRON_SECRET (production):
 *      Set the CRON_SECRET environment variable and pass it in the
 *      Authorization header: `Authorization: Bearer <CRON_SECRET>`
 *      This is the pattern recommended by Vercel Cron Jobs.
 *      Full power — can target any building.
 *
 *   2. ADMIN session:
 *      Full power — can use `?building_id=` to target any building.
 *
 *   3. BOARD / MANAGEMENT session (manual "Run Now" from the UI):
 *      Authorized but building-scoped — the run is automatically restricted
 *      to the session user's own building. Any `?building_id=` parameter is
 *      ignored for non-ADMIN session users.
 *
 * ── Query parameters ──────────────────────────────────────────────────────────
 *
 *   ?dry_run=true
 *      Simulate the full run — skip checks and mode checks are applied, but no
 *      batches are created and no audit logs are emitted. Use this to preview
 *      which buildings would be processed.
 *
 *   ?building_id=<ObjectId>
 *      Restrict the run to a single building. Only honoured for ADMIN sessions
 *      or CRON_SECRET callers. Ignored (session building is used instead) for
 *      BOARD / MANAGEMENT users.
 *
 *   ?month=YYYY-MM
 *      Override the target month. When provided, the day-of-month check is
 *      bypassed so you can trigger generation for any month on any day.
 *      Example: ?month=2026-04
 *
 * ── Response shape ────────────────────────────────────────────────────────────
 *
 *   {
 *     success: true,
 *     data: {
 *       runAt: string,          // ISO timestamp
 *       month: string,          // YYYY-MM resolved month
 *       dryRun: boolean,
 *       results: Array<{
 *         buildingId: string,
 *         buildingName: string,
 *         status: 'generated' | 'skipped' | 'already_exists' | 'error',
 *         skipReason?: string,
 *         month?: string,
 *         batchId?: string,
 *         itemCount?: number,
 *         autoApproved?: boolean,
 *         error?: string,
 *       }>,
 *       summary: {
 *         total: number,
 *         generated: number,
 *         skipped: number,
 *         alreadyExists: number,
 *         errors: number,
 *       }
 *     }
 *   }
 */
export async function GET(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  let authorized = false;
  /**
   * When set, the run is restricted to this building regardless of what the
   * caller passes in ?building_id=. Used to enforce building-level scope for
   * BOARD and MANAGEMENT users who must not process other buildings.
   */
  let scopedBuildingId: string | undefined;

  // 1. CRON_SECRET — production cron, full power
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    authorized = true;
  }

  // 2. Session auth — BOARD+ may call; ADMIN gets full power, others are scoped
  if (!authorized) {
    const session = await getSession();
    if (session && hasPermission(session.role, 'BOARD')) {
      authorized = true;
      // ADMIN: unrestricted. MANAGEMENT / BOARD: force their own building.
      if (!hasPermission(session.role, 'ADMIN')) {
        scopedBuildingId = session.buildingId;
      }
    }
  }

  if (!authorized) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // ── Parse options ───────────────────────────────────────────────────────────

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dry_run') === 'true';
  const overrideMonth = searchParams.get('month') ?? undefined;

  // Determine which building to process:
  //   - BOARD/MANAGEMENT: always their own building (scopedBuildingId wins)
  //   - ADMIN / CRON_SECRET: honour ?building_id= if provided
  const requestedBuildingId = searchParams.get('building_id') ?? undefined;
  const buildingId: string | undefined = scopedBuildingId ?? requestedBuildingId;

  // Reject nonsense ObjectIds early to avoid a confusing 500 later
  if (buildingId && !Types.ObjectId.isValid(buildingId)) {
    return NextResponse.json(
      { success: false, error: 'Invalid building_id format' },
      { status: 400 }
    );
  }

  // Validate month format if provided
  if (overrideMonth && !/^\d{4}-\d{2}$/.test(overrideMonth)) {
    return NextResponse.json(
      { success: false, error: 'Invalid month format — expected YYYY-MM' },
      { status: 400 }
    );
  }

  // ── Run ─────────────────────────────────────────────────────────────────────

  try {
    const result = await runMonthlyReminders({ dryRun, buildingId, overrideMonth });

    // Log to server console for observability in production logs
    console.log(
      `[cron:monthly-reminders] runAt=${result.runAt.toISOString()} ` +
        `month=${result.month} dryRun=${result.dryRun} ` +
        `generated=${result.summary.generated} skipped=${result.summary.skipped} ` +
        `alreadyExists=${result.summary.alreadyExists} errors=${result.summary.errors}`
    );

    const status = result.summary.errors > 0 && result.summary.generated === 0 ? 207 : 200;

    return NextResponse.json({ success: true, data: result }, { status });
  } catch (error) {
    console.error('[cron:monthly-reminders] fatal error', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
