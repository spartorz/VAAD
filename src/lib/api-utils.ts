import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, hasPermission, canAccessApartment } from './auth';
import { SessionUser, UserRole, ApiResponse, AuditAction, AuditEntityType } from './types';
import dbConnect from './db';
import AuditLog from '@/models/AuditLog';
import { Types } from 'mongoose';

// Get authenticated session
export async function getSession(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

// API response helpers
export function successResponse<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(error: string, status = 400): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

export function unauthorizedResponse(): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}

export function forbiddenResponse(): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
}

// Parse pagination params from URL
export function getPaginationParams(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return {
    page: parseInt(searchParams.get('page') || '1'),
    limit: Math.min(parseInt(searchParams.get('limit') || '20'), 100),
    search: searchParams.get('search') || undefined,
    sortBy: searchParams.get('sortBy') || 'createdAt',
    sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
  };
}

// Build sort object for MongoDB
export function buildSortObject(sortBy: string, sortOrder: 'asc' | 'desc'): Record<string, 1 | -1> {
  return { [sortBy]: sortOrder === 'asc' ? 1 : -1 } as Record<string, 1 | -1>;
}

// Auth middleware wrapper for API routes
interface AuthOptions {
  requiredRole?: UserRole;
  requireBuildingAccess?: boolean;
}

type AuthenticatedHandler = (
  request: NextRequest,
  context: { user: SessionUser; params?: Record<string, string> }
) => Promise<NextResponse>;

export function withAuth(handler: AuthenticatedHandler, options: AuthOptions = {}) {
  return async (request: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
    try {
      const user = await getSession();
      
      if (!user) {
        return unauthorizedResponse();
      }

      // Check role permission
      if (options.requiredRole && !hasPermission(user.role, options.requiredRole)) {
        return forbiddenResponse();
      }

      await dbConnect();
      
      // Await params if present
      const params = context?.params ? await context.params : undefined;
      
      return handler(request, { user, params });
    } catch (error) {
      console.error('API Error:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Internal server error',
        500
      );
    }
  };
}

// Audit logging helper
export async function createAuditLog({
  buildingId,
  actorUserId,
  actorName,
  action,
  entityType,
  entityId,
  before,
  after,
  metadata,
}: {
  buildingId: string;
  actorUserId: string;
  actorName?: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}) {
  try {
    const logDoc = new AuditLog({
      buildingId: new Types.ObjectId(buildingId),
      actorUserId: new Types.ObjectId(actorUserId),
      actorName,
      action,
      entityType,
      entityId: new Types.ObjectId(entityId),
      before,
      after,
      metadata,
    });
    await logDoc.save();
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit log failure shouldn't break the main operation
  }
}

// Building scope validation
export function validateBuildingScope(user: SessionUser, buildingId: string): boolean {
  return user.buildingId === buildingId;
}

// Apartment access validation
export function validateApartmentAccess(user: SessionUser, apartmentId: string): boolean {
  return canAccessApartment(user, apartmentId);
}

// Parse JSON body safely
export async function parseBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Get first error message from Zod validation result
export function getZodErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: Array<{ message: string }> }).issues;
    return issues[0]?.message || 'Validation error';
  }
  if (error && typeof error === 'object' && 'errors' in error) {
    const errors = (error as { errors: Array<{ message: string }> }).errors;
    return errors[0]?.message || 'Validation error';
  }
  return 'Validation error';
}

