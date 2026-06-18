import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getServiceAccountClients, getSpreadsheetId, readInvestorLedger, readPerformance, readHoldings } from "@/lib/sheets";
import { latestNav, computeInvestorPosition, computeRoster, computeProRataHoldings, type InvestorPosition, type ProRataHolding } from "@/lib/investors";
import { AGENTS } from "@/lib/agents";

interface AgentInvestorSummary {
  agentId: string;
  agentName: string;
  navPerUnit: number | null;
  position: InvestorPosition | null; // Client: their own position in this agent
  roster: InvestorPosition[]; // FundManager only: every investor's position in this agent
  proRataHoldings: ProRataHolding[]; // Client only, only non-empty for agents with real Holdings data
}

async function loadAgentSummary(agentId: string, agentName: string, userId: string, email: string | null, isManager: boolean): Promise<AgentInvestorSummary> {
  try {
    const spreadsheetId = await getSpreadsheetId(agentId);
    const sheets = await getServiceAccountClients();

    const [ledger, performance, holdingsResult] = await Promise.all([
      readInvestorLedger(sheets, spreadsheetId).catch(() => []),
      readPerformance(sheets, spreadsheetId).catch(() => []),
      readHoldings(sheets, spreadsheetId).catch(() => ({ holdings: [], cash: null, lastSynced: null })),
    ]);

    const { navPerUnit, unitsOutstanding } = latestNav(performance);
    const position = computeInvestorPosition(ledger, { userId, email }, navPerUnit, unitsOutstanding);
    const roster = isManager ? computeRoster(ledger, navPerUnit, unitsOutstanding) : [];
    const proRataHoldings = !isManager && position?.ownershipPct != null ? computeProRataHoldings(holdingsResult.holdings, position.ownershipPct) : [];

    return { agentId, agentName, navPerUnit, position, roster, proRataHoldings };
  } catch {
    // Agent not provisioned yet (no spreadsheet) — treat as having no investor data rather than erroring the whole response.
    return { agentId, agentName, navPerUnit: null, position: null, roster: [], proRataHoldings: [] };
  }
}

export async function GET(req: Request) {
  const authz = await requireApiPermission({
    permission: "portfolio:read",
    action: "INVESTORS_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const { role, userId, email } = authz.context;
  const isManager = role === "FundManager";

  const agents = await Promise.all(AGENTS.map((a) => loadAgentSummary(a.id, a.name, userId, email, isManager)));

  return NextResponse.json({ role, agents });
}
