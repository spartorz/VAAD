import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import PasswordResetToken from '@/models/PasswordResetToken';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createSecurityAuditLog } from '@/lib/security-audit';
import { forgotPasswordSchema } from '@/lib/validations';
import { sendPasswordResetEmail } from '@/lib/email';

/** Generic response — never reveals whether the email exists in the system */
const GENERIC_OK = NextResponse.json(
  { success: true, message: 'If an account with that email exists, a reset link has been sent.' },
  { status: 200 }
);

export async function POST(req: NextRequest) {
  // Rate limit: 5 requests per 15 minutes per IP
  const ip = getClientIp(req);
  const limit = await rateLimit({ key: `pwd-reset-req:${ip}`, limit: 5, windowSeconds: 900 });

  if (!limit.success) {
    createSecurityAuditLog({
      action: 'rate_limit_triggered',
      metadata: { ip, route: 'forgot-password', retryAfter: limit.retryAfter },
    });
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 900) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid email address.' }, { status: 400 });
  }

  const { email } = parsed.data;

  await dbConnect();

  const user = await User.findOne({ email: email.toLowerCase() });

  // Always return the generic response — never reveal whether the email exists
  if (!user || !user.isActive) {
    createSecurityAuditLog({
      action: 'password_reset_requested',
      metadata: { found: false, emailHint: email.slice(0, 3) + '***', ip },
    });
    return GENERIC_OK;
  }

  // Invalidate any existing unused tokens for this user before creating a new one
  await PasswordResetToken.deleteMany({ userId: user._id, usedAt: { $exists: false } });

  // Generate a cryptographically secure random token
  const rawToken = crypto.randomBytes(32).toString('hex'); // 64-char hex string
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  await PasswordResetToken.create({
    userId: user._id,
    buildingId: user.buildingId,
    tokenHash,
    expiresAt,
  });

  // Build the reset URL.
  // APP_BASE_URL is preferred (explicit production URL).
  // Falls back to NEXTAUTH_URL for backward compatibility, then localhost.
  const baseUrl =
    process.env.APP_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000';

  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

  // ── Email delivery ─────────────────────────────────────────────────────────
  // sendPasswordResetEmail never throws; it returns { success, error? }.
  // On failure we log and audit but still return the generic 200 to the client
  // so that the response cannot be used to probe whether an address is registered.
  const emailResult = await sendPasswordResetEmail({
    to: user.email,
    userName: user.name,
    resetUrl,
    expiresAt,
  });

  if (!emailResult.success) {
    // Structured log — safe (no tokens, no raw email content)
    console.error('[forgot-password] Email dispatch failed:', {
      userId: user._id.toString(),
      buildingId: user.buildingId.toString(),
      error: emailResult.error,
    });

    createSecurityAuditLog({
      action: 'password_reset_requested',
      buildingId: user.buildingId.toString(),
      actorUserId: user._id.toString(),
      actorName: user.name,
      metadata: { found: true, emailDispatched: false, ip },
    });
  } else {
    createSecurityAuditLog({
      action: 'password_reset_requested',
      buildingId: user.buildingId.toString(),
      actorUserId: user._id.toString(),
      actorName: user.name,
      metadata: { found: true, emailDispatched: true, ip },
    });
  }

  // Always return the same generic 200 — even if email delivery failed.
  // The token is still valid; the user can retry the forgot-password flow.
  return GENERIC_OK;
}
