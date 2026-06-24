import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createSecurityAuditLog } from '@/lib/security-audit';

const authHandler = NextAuth(authOptions);

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (authHandler as any)(req, ctx);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> }
) {
  const { nextauth } = await ctx.params;
  const route = nextauth.join('/');

  // Rate-limit credential sign-in attempts only
  if (route === 'callback/credentials') {
    const ip = getClientIp(req);
    const result = await rateLimit({
      key: `auth:login:${ip}`,
      limit: 10,
      windowSeconds: 900, // 15 minutes
    });

    if (!result.success) {
      // Fire-and-forget audit event — do not await to keep response fast
      createSecurityAuditLog({
        action: 'rate_limit_triggered',
        metadata: { ip, route: 'login', retryAfter: result.retryAfter },
      });

      return NextResponse.json(
        { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
        {
          status: 429,
          headers: { 'Retry-After': String(result.retryAfter ?? 900) },
        }
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (authHandler as any)(req, ctx);
}
