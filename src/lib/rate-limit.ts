/**
 * Rate limiting utility with an in-memory store.
 *
 * Designed with a pluggable store interface so the in-memory backend can be
 * swapped for Redis (ioredis / Upstash) in production without changing call sites.
 *
 * Usage:
 *   const result = await rateLimit({ key: `login:${ip}`, limit: 10, windowSeconds: 900 });
 *   if (!result.success) return rateLimitResponse(result);
 */

export interface RateLimitResult {
  success: boolean;
  /** Remaining allowed calls in the current window */
  remaining: number;
  /** Seconds until the window resets (only set when limit is exceeded) */
  retryAfter?: number;
}

// ---------------------------------------------------------------------------
// Store interface — swap this out for Redis without touching call sites
// ---------------------------------------------------------------------------

interface RateLimitStore {
  increment(key: string, windowSeconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

interface MemoryEntry {
  count: number;
  resetAt: number; // Unix ms
}

class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, MemoryEntry>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Sweep expired entries every 5 minutes to prevent unbounded growth
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    // Allow Node process to exit even if this timer is alive
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  async increment(key: string, windowSeconds: number): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return 1;
    }

    entry.count += 1;
    return entry.count;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    const remaining = Math.ceil((entry.resetAt - Date.now()) / 1000);
    return Math.max(0, remaining);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetAt) this.store.delete(key);
    }
  }
}

// Module-level singleton — shared across requests in the same Node.js process
const defaultStore: RateLimitStore = new InMemoryRateLimitStore();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RateLimitOptions {
  /** Unique key for this limit bucket (e.g. `login:${ip}` or `reset:${email}`) */
  key: string;
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Override the default store (e.g. pass a Redis-backed store) */
  store?: RateLimitStore;
}

/**
 * Increments the counter for `key` and returns whether the request is allowed.
 */
export async function rateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const store = options.store ?? defaultStore;
  const count = await store.increment(options.key, options.windowSeconds);

  if (count > options.limit) {
    const retryAfter = await store.ttl(options.key);
    return { success: false, remaining: 0, retryAfter };
  }

  return { success: true, remaining: options.limit - count };
}

/**
 * Extracts the best-available client IP from Next.js request headers.
 * Falls back to 'unknown' when running behind a proxy without x-forwarded-for.
 */
export function getClientIp(request: Request | { headers: Headers }): string {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
