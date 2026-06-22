import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { projectNewsForRole } from "@/lib/projections";
import { getServiceAccountClients, getSharedSpreadsheetId, readRecommendations } from "@/lib/sheets";
import { AGENTS } from "@/lib/agents";

export async function GET(request: NextRequest) {
  const authz = await requireApiPermission({
    permission: "signals:read",
    action: "NEWS_READ",
    request,
  });
  if (!authz.ok) return authz.response;

  try {
    const spreadsheetId = await getSharedSpreadsheetId();
    const sheets = await getServiceAccountClients();

    const perAgent = await Promise.all(AGENTS.map((a) => readRecommendations(sheets, spreadsheetId, a.id)));
    const recommendations = perAgent.flat().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const news = projectNewsForRole(recommendations, authz.context.role);

    return NextResponse.json({ news });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
