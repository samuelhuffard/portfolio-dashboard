import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getServiceAccountClients, getSharedSpreadsheetId, readHoldings, readInvestorLedger, readPerformance } from "@/lib/sheets";

export async function GET(request: NextRequest) {
  const authz = await requireApiPermission({
    permission: "portfolio:full",
    action: "PORTFOLIO_READ",
    request,
  });
  if (!authz.ok) return authz.response;

  try {
    const spreadsheetId = await getSharedSpreadsheetId();
    const sheets = await getServiceAccountClients();

    const [{ holdings, cash, lastSynced }, performance, investorLedger] = await Promise.all([
      readHoldings(sheets, spreadsheetId),
      readPerformance(sheets, spreadsheetId),
      readInvestorLedger(sheets, spreadsheetId),
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
      // The ledger reader verifies every HMAC before this data reaches the
      // chart. Signed flows, rather than a portfolio-movement heuristic, are
      // the only adjustments to investment performance.
      cashFlows: investorLedger.map((entry) => ({
        date: entry.date,
        amount: entry.type === "Contribution" ? entry.amount : entry.type === "Withdrawal" ? -entry.amount : 0,
      })),
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
