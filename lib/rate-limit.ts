import type { AuditAction } from "./audit";
import { getRedis } from "./redis";

interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
}

const ACTION_LIMITS: Partial<Record<AuditAction, RateLimitPolicy>> = {
  RESEARCH_GENERATE: { limit: 10, windowSeconds: 60 * 60 },
  COMPARE_GENERATE: { limit: 10, windowSeconds: 60 * 60 },
  AGENT_CHAT_SEND: { limit: 40, windowSeconds: 60 * 60 },
  PROPOSAL_CREATE: { limit: 25, windowSeconds: 60 * 60 },
  APPROVAL_DECISION: { limit: 50, windowSeconds: 60 * 60 },
  ALERT_CREATE: { limit: 50, windowSeconds: 60 * 60 },
  ALERT_DELETE: { limit: 100, windowSeconds: 60 * 60 },
  REPORT_EXPORT: { limit: 30, windowSeconds: 60 * 60 },
};

function rateLimitsAreEnforced(): boolean {
  return process.env.RATE_LIMIT_ENFORCE === "true" || process.env.VERCEL_ENV === "production";
}

export function getRateLimitPolicy(action: AuditAction): RateLimitPolicy | null {
  return ACTION_LIMITS[action] ?? null;
}

export function buildRateLimitKey(userId: string, action: AuditAction, now = Date.now()): string | null {
  const policy = getRateLimitPolicy(action);
  if (!policy) return null;
  const bucket = Math.floor(now / (policy.windowSeconds * 1000));
  return `pm:rate:${action}:${userId}:${bucket}`;
}

export async function enforceRateLimit({
  userId,
  action,
}: {
  userId: string;
  action: AuditAction;
}): Promise<{ ok: true } | { ok: false; status: 429 | 503; message: string; retryAfterSeconds?: number }> {
  const policy = getRateLimitPolicy(action);
  if (!policy) return { ok: true };

  const redis = getRedis();
  if (!redis) {
    if (rateLimitsAreEnforced()) {
      return { ok: false, status: 503, message: "Rate limiting is not configured." };
    }
    return { ok: true };
  }

  const key = buildRateLimitKey(userId, action);
  if (!key) return { ok: true };

  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, policy.windowSeconds);

  if (count > policy.limit) {
    return {
      ok: false,
      status: 429,
      message: "Too many requests for this action. Try again later.",
      retryAfterSeconds: policy.windowSeconds,
    };
  }

  return { ok: true };
}
