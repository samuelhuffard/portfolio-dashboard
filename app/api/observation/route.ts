import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import {
  appendObservationUpdate,
  listObservationUpdates,
  readObservationDays,
  summarizeObservationWindow,
} from "@/lib/observation";

export async function GET(req: NextRequest) {
  const authz = await requireApiPermission({
    permission: "portfolio:full",
    action: "OBSERVATION_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const [days, updates] = await Promise.all([readObservationDays(), listObservationUpdates()]);
  return NextResponse.json({
    window: summarizeObservationWindow(days),
    days,
    updates,
  });
}

export async function POST(req: NextRequest) {
  const authz = await requireApiPermission({
    permission: "strategy:write",
    action: "OBSERVATION_UPDATE_POST",
    request: req,
  });
  if (!authz.ok) return authz.response;

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const update = await appendObservationUpdate({
      text: String(body?.text ?? ""),
      author: authz.context.email ?? "FundManager",
      userId: authz.context.userId,
    });
    return NextResponse.json({ update }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record update.";
    const status = /required|at most/.test(message) ? 400 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
