import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

// This key wakes the execution poller — it belongs to the same permission tier
// as approving trades. It was the one API route that skipped requireApiPermission
// (any signed-in read-only Client could poke it, unaudited).
export async function POST(req: Request) {
  const authz = await requireApiPermission({
    permission: "approvals:manage",
    action: "COMPANION_TRIGGER",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 503 });

  // Companion polls this key every 30s; when present it runs an immediate poll
  // regardless of market hours (useful for testing).
  await redis.set("pm:exec_trigger", "1", { ex: 120 });
  return NextResponse.json({ ok: true });
}

// Companion liveness for the approvals page banner: the Mac writes
// pm:companion:last-seen every 30s while awake. If it goes stale, approved
// proposals sit unexecuted with no other signal anywhere.
export async function GET(req: Request) {
  const authz = await requireApiPermission({
    permission: "approvals:manage",
    action: "COMPANION_STATUS_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 503 });

  const lastSeen = await redis.get<string>("pm:companion:last-seen");
  const ageSeconds = lastSeen ? Math.round((Date.now() - Date.parse(lastSeen)) / 1000) : null;
  return NextResponse.json({
    lastSeen: lastSeen ?? null,
    ageSeconds,
    online: ageSeconds != null && ageSeconds < 120,
  });
}
