import { test } from "node:test";
import assert from "node:assert/strict";
import { getAuditConfigError } from "../lib/audit";
import { buildRateLimitKey, getRateLimitPolicy } from "../lib/rate-limit";

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("audit config is optional outside enforced environments", () => {
  const previous = {
    audit: process.env.AUDIT_ENFORCE,
    vercel: process.env.VERCEL_ENV,
    secret: process.env.AUDIT_HMAC_SECRET,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  delete process.env.AUDIT_ENFORCE;
  delete process.env.VERCEL_ENV;
  delete process.env.AUDIT_HMAC_SECRET;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  try {
    assert.equal(getAuditConfigError(), null);
  } finally {
    restoreEnv("AUDIT_ENFORCE", previous.audit);
    restoreEnv("VERCEL_ENV", previous.vercel);
    restoreEnv("AUDIT_HMAC_SECRET", previous.secret);
    restoreEnv("UPSTASH_REDIS_REST_URL", previous.redisUrl);
    restoreEnv("UPSTASH_REDIS_REST_TOKEN", previous.redisToken);
  }
});

test("audit config fails closed when enforcement is enabled", () => {
  const previous = {
    audit: process.env.AUDIT_ENFORCE,
    secret: process.env.AUDIT_HMAC_SECRET,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  process.env.AUDIT_ENFORCE = "true";
  delete process.env.AUDIT_HMAC_SECRET;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  try {
    assert.match(getAuditConfigError() ?? "", /AUDIT_HMAC_SECRET/);
  } finally {
    restoreEnv("AUDIT_ENFORCE", previous.audit);
    restoreEnv("AUDIT_HMAC_SECRET", previous.secret);
    restoreEnv("UPSTASH_REDIS_REST_URL", previous.redisUrl);
    restoreEnv("UPSTASH_REDIS_REST_TOKEN", previous.redisToken);
  }
});

test("costly manager actions have stable per-user rate-limit keys", () => {
  assert.deepEqual(getRateLimitPolicy("RESEARCH_GENERATE"), { limit: 10, windowSeconds: 3600 });
  assert.equal(buildRateLimitKey("user_123", "RESEARCH_GENERATE", 0), "pm:rate:RESEARCH_GENERATE:user_123:0");
  assert.equal(buildRateLimitKey("user_123", "SIGNALS_READ", 0), null);
});
