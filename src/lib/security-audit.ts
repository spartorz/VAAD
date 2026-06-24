/**
 * Security-specific audit logging.
 *
 * Kept separate from api-utils.ts to prevent circular imports:
 *   auth.ts → security-audit.ts ✓
 *   api-utils.ts → auth.ts (existing, unchanged)
 *
 * Security events may not always have a valid buildingId or actorUserId
 * (e.g. failed login with an unknown email). In those cases the caller
 * passes undefined and a zero ObjectId sentinel is stored so the schema
 * required constraint is satisfied while making the intent clear.
 */

import { Types } from 'mongoose';
import dbConnect from './db';
import AuditLog from '@/models/AuditLog';
import { AuditAction } from './types';

/** All-zeros ObjectId used as a "system / unknown actor" sentinel */
const SYSTEM_OID = new Types.ObjectId('000000000000000000000000');

export interface SecurityAuditParams {
  action: AuditAction;
  /** User's building — undefined for events where building is unknown */
  buildingId?: string;
  /** Authenticated user id — undefined for pre-auth events */
  actorUserId?: string;
  actorName?: string;
  /** Free-form metadata: IP, user-agent, email hint, etc. Never raw tokens/passwords */
  metadata?: Record<string, unknown>;
}

/**
 * Writes a security-category audit entry.
 * Never throws — audit failures must not interrupt the main request flow.
 */
export async function createSecurityAuditLog(params: SecurityAuditParams): Promise<void> {
  try {
    await dbConnect();

    const buildingOid = params.buildingId
      ? new Types.ObjectId(params.buildingId)
      : SYSTEM_OID;

    const actorOid = params.actorUserId
      ? new Types.ObjectId(params.actorUserId)
      : SYSTEM_OID;

    const doc = new AuditLog({
      buildingId: buildingOid,
      actorUserId: actorOid,
      actorName: params.actorName ?? 'system',
      action: params.action,
      entityType: 'security_event',
      // entityId is optional in schema; use sentinel to satisfy Mongoose
      entityId: actorOid,
      metadata: params.metadata,
    });

    await doc.save();
  } catch (err) {
    // Log to server console only — never surface to client
    console.error('[security-audit] Failed to write security audit log:', err);
  }
}
