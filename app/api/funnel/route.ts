import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { readFunnelHistory, readFunnelSnapshots } from "@/lib/funnel";

export async function GET(req: Request) {
  const authz = await requireApiPermission({
    permission: "portfolio:full",
    action: "SIGNALS_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get("agentId") ?? "agent-1";
    const [snapshots, history] = await Promise.all([
      readFunnelSnapshots(),
      readFunnelHistory(agentId, 14),
    ]);
    return NextResponse.json({ snapshots, history });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
