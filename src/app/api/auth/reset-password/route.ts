import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import PasswordResetToken from '@/models/PasswordResetToken';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createSecurityAuditLog } from '@/lib/security-audit';
import { resetPasswordSchema } from '@/lib/validations';

const INVALID_RESPONSE = NextResponse.json(
  { success: false, error: 'This reset link is invalid or has expired. Please request a new one.' },
  { status: 400 }
);

export async function POST(req: NextRequest) {
  // Rate limit: 5 attempts per 15 minutes per IP
  const ip = getClientIp(req);
  const limit = await rateLimit({ key: `pwd-reset-confirm:${ip}`, limit: 5, windowSeconds: 900 });

  if (!limit.success) {
    createSecurityAuditLog({
      action: 'rate_limit_triggered',
      metadata: { ip, route: 'reset-password', retryAfter: limit.retryAfter },
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

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? 'Validation error';
    return NextResponse.json({ success: false, error: issue }, { status: 400 });
  }

  const { token, password } = parsed.data;

  await dbConnect();

  // Hash the incoming raw token and look it up
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const resetRecord = await PasswordResetToken.findOne({
    tokenHash,
    usedAt: { $exists: false }, // single-use: reject already-consumed tokens
    expiresAt: { $gt: new Date() }, // reject expired tokens
  });

  if (!resetRecord) {
    return INVALID_RESPONSE;
  }

  const user = await User.findOne({ _id: resetRecord.userId, isActive: true });

  if (!user) {
    // Account was deactivated between request and confirm
    return INVALID_RESPONSE;
  }

  // Update password — the pre-save hook in User.ts will hash it
  user.passwordHash = password;
  await user.save();

  // Mark token as used (single-use enforcement)
  resetRecord.usedAt = new Date();
  await resetRecord.save();

  createSecurityAuditLog({
    action: 'password_reset_completed',
    buildingId: user.buildingId.toString(),
    actorUserId: user._id.toString(),
    actorName: user.name,
    metadata: { ip },
  });

  return NextResponse.json(
    { success: true, message: 'Your password has been reset successfully. You can now sign in.' },
    { status: 200 }
  );
}
