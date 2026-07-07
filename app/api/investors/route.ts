import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getServiceAccountClients, getSharedSpreadsheetId, readInvestorLedger, readPerformance, readHoldings } from "@/lib/sheets";
import { latestNav, computeInvestorPosition, computeRoster, computeProRataHoldings, type InvestorPosition, type ProRataHolding } from "@/lib/investors";
import { computeUnattributedCapital, getTodayInNewYork, type UnattributedCapital } from "@/lib/investor-ledger";

interface InvestorSummary {
  navPerUnit: number | null;
  unitsOutstanding: number | null;
  totalFundValue: number | null; // FundManager only
  position: InvestorPosition | null; // Client: their own position in the shared portfolio
  roster: InvestorPosition[]; // FundManager only: every investor's position
  proRataHoldings: ProRataHolding[]; // Client only
  unattributed: UnattributedCapital | null; // FundManager only: deposits not yet in the ledger
  navIsCurrent: boolean; // FundManager only: latest Performance row is dated today (NY)
  latestNavDate: string | null; // FundManager only
}

async function loadInvestorSummary(userId: string, email: string | null, isManager: boolean): Promise<InvestorSummary> {
  try {
    const spreadsheetId = await getSharedSpreadsheetId();
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

    // Pooled-fund figures are FundManager-only — Clients never see them (INVARIANTS #4).
    const latestPerf = performance[performance.length - 1] ?? null;
    const totalFundValue = isManager ? latestPerf?.portfolioValue ?? null : null;
    const unattributed = isManager ? computeUnattributedCapital(holdingsResult.holdings, holdingsResult.cash, ledger) : null;
    const latestNavDate = isManager ? latestPerf?.date ?? null : null;
    const navIsCurrent = isManager && latestNavDate === getTodayInNewYork();

    return {
      navPerUnit,
      unitsOutstanding: isManager ? unitsOutstanding : null,
      totalFundValue,
      position,
      roster,
      proRataHoldings,
      unattributed,
      navIsCurrent,
      latestNavDate,
    };
  } catch {
    // Shared spreadsheet not provisioned yet — treat as having no investor data rather than erroring the whole response.
    return {
      navPerUnit: null,
      unitsOutstanding: null,
      totalFundValue: null,
      position: null,
      roster: [],
      proRataHoldings: [],
      unattributed: null,
      navIsCurrent: false,
      latestNavDate: null,
    };
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

  const summary = await loadInvestorSummary(userId, email, isManager);

  return NextResponse.json({ role, ...summary });
}
