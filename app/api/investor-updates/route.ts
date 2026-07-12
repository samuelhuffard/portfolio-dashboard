import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getInvestorUpdate } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const authz = await requireApiPermission({
    permission: "portfolio:read",
    action: "INVESTORS_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;
  if (authz.context.role !== "Client") return NextResponse.json({ update: null });

  const update = await getInvestorUpdate(null, authz.context.email);
  return NextResponse.json({ update }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
