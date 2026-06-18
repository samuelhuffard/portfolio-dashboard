import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getServiceAccountClients, getSpreadsheetId, readHoldings, readPerformance } from "@/lib/sheets";

export async function GET(request: NextRequest) {
  const authz = await requireApiPermission({
    permission: "portfolio:read",
    action: "PORTFOLIO_READ",
    request,
  });
  if (!authz.ok) return authz.response;

  try {
    const spreadsheetId = await getSpreadsheetId();
    const sheets = await getServiceAccountClients();

    const [{ holdings, cash, lastSynced }, performance] = await Promise.all([
      readHoldings(sheets, spreadsheetId),
      readPerformance(sheets, spreadsheetId),
    ]);

    const totalMarketValue = holdings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);
    const totalCostBasis = holdings.reduce((sum, h) => sum + (h.costBasis ?? 0), 0);
    const totalValue = totalMarketValue + (cash ?? 0);
    const totalGainLoss = totalMarketValue - totalCostBasis;
    const totalGainLossPct = totalCostBasis !== 0 ? (totalGainLoss / totalCostBasis) * 100 : null;

    return NextResponse.json({
      holdings,
      cash,
      lastSynced,
      performance,
      totals: {
        totalValue,
        totalMarketValue,
        totalCostBasis,
        totalGainLoss,
        totalGainLossPct,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
