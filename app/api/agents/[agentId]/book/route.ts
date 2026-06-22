import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getServiceAccountClients, getSharedSpreadsheetId, readHoldings, readTradeLedger, readLots } from "@/lib/sheets";
import { computeAgentBook } from "@/lib/agent-books";
import { getAgent } from "@/lib/agents";

export async function GET(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const authz = await requireApiPermission({
    permission: "signals:read",
    action: "AGENT_BOOK_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const { agentId } = await params;
  if (!getAgent(agentId)) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  try {
    const spreadsheetId = await getSharedSpreadsheetId();
    const sheets = await getServiceAccountClients();

    const [holdingsResult, trades, lots] = await Promise.all([
      readHoldings(sheets, spreadsheetId),
      readTradeLedger(sheets, spreadsheetId),
      readLots(sheets, spreadsheetId),
    ]);

    const currentPrices: Record<string, number | null> = {};
    for (const h of holdingsResult.holdings) currentPrices[h.ticker] = h.currentPrice;

    const book = computeAgentBook(agentId, lots, trades, currentPrices);
    return NextResponse.json({ book });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
