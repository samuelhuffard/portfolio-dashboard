import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { listReviewAudits } from "@/lib/review-history";

export async function GET(request: Request) {
  const authz = await requireApiPermission({
    permission: "approvals:manage",
    action: "RESEARCH_REVIEW_HISTORY_READ",
    request,
  });
  if (!authz.ok) return authz.response;
  try {
    return NextResponse.json({ audits: await listReviewAudits(5_000) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load review history" }, { status: 500 });
  }
}
