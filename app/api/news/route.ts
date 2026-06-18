import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { projectNewsForRole } from "@/lib/projections";
import { getServiceAccountClients, getSpreadsheetId, readRecommendations } from "@/lib/sheets";

export async function GET(request: NextRequest) {
  const authz = await requireApiPermission({
    permission: "signals:read",
    action: "NEWS_READ",
    request,
  });
  if (!authz.ok) return authz.response;

  try {
    const spreadsheetId = await getSpreadsheetId();
    const sheets = await getServiceAccountClients();

    const recommendations = await readRecommendations(sheets, spreadsheetId);
    const news = projectNewsForRole(recommendations, authz.context.role);

    return NextResponse.json({ news });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
