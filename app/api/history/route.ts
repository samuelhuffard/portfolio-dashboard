import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getHistory } from "@/lib/redis";

export async function GET(request: NextRequest) {
  const authz = await requireApiPermission({
    permission: "reports:export",
    action: "REPORT_HISTORY_READ",
    request,
  });
  if (!authz.ok) return authz.response;

  const reports = await getHistory();
  return NextResponse.json({ reports });
}
