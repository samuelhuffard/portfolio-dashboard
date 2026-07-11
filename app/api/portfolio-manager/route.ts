import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";

const BACKEND_URL = process.env.PORTFOLIO_BACKEND_URL?.trim().replace(/\/$/, "");
const SECRET = process.env.PORTFOLIO_WEBHOOK_SECRET?.trim();

export async function GET(req: Request) {
  const authz = await requireApiPermission({
    permission: "approvals:manage",
    action: "PORTFOLIO_MANAGER_SHADOW_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  if (!BACKEND_URL || !SECRET) {
    return NextResponse.json({ error: "Portfolio Manager shadow backend is not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(`${BACKEND_URL}/portfolio-manager/shadow`, {
      headers: { Authorization: `Bearer ${SECRET}` },
      cache: "no-store",
    });
    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: `Agent 4 shadow state is unavailable: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 },
    );
  }
}
