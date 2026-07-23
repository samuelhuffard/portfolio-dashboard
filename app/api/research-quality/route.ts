import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";

const BACKEND_URL = process.env.PORTFOLIO_BACKEND_URL?.trim().replace(/\/$/, "");
const SECRET = process.env.PORTFOLIO_WEBHOOK_SECRET?.trim();

// Read-only aggregate outcome accounting for the latest scheduled scan. The
// dashboard never receives tickers, prompts, rationale, evidence, or proposal
// payloads from this route.
export async function GET(req: Request) {
  const authz = await requireApiPermission({
    permission: "portfolio:read",
    action: "RESEARCH_QUALITY_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  if (!BACKEND_URL || !SECRET) {
    return NextResponse.json({ error: "Research quality service is not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(`${BACKEND_URL}/research-quality`, {
      headers: { Authorization: `Bearer ${SECRET}` },
      cache: "no-store",
    });
    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: `Research quality report is unavailable: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 },
    );
  }
}
