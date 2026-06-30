import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export async function POST() {
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 503 });

  // Companion polls this key every 30s; when present it runs an immediate poll
  // regardless of market hours (useful for testing).
  await redis.set("pm:exec_trigger", "1", { ex: 120 });
  return NextResponse.json({ ok: true });
}
