import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getServiceAccountClients, getSharedSpreadsheetId, readInvestorLedger, readPerformance, readCashBalance, readHoldingsDetail, readLots } from "@/lib/sheets";
import { latestNav, computeInvestorPosition } from "@/lib/investors";
import { computeWithdrawalPreview, type SellSelection } from "@/lib/withdrawal-preview";
import { getTaxReserveRatePct } from "@/lib/redis";

// Read-only, FundManager-only preview of what a withdrawal should pay out vs.
// hold back for the capital-gains tax Sam owes on this Robinhood account.
// Mirrors portfolio-manager's scripts/process-withdrawal.js dry-run math exactly,
// but never writes anything — nothing here moves money or sells anything for
// real. The actual --commit step stays a manual backend script run by Sam.
export async function POST(req: Request) {
  const authz = await requireApiPermission({
    permission: "withdrawals:preview",
    action: "WITHDRAWAL_PREVIEW",
    request: req,
  });
  if (!authz.ok) return authz.response;

  try {
    const body = await req.json();
    const email: string | undefined = body?.email;
    const amountRaw = body?.amount;
    const sellFrom: { ticker: string; shares: number }[] = Array.isArray(body?.sellFrom) ? body.sellFrom : [];

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const spreadsheetId = await getSharedSpreadsheetId();
    const sheets = await getServiceAccountClients();

    const [ledger, performance, cashAvailable, holdingsDetail, lots, taxReserveRatePct] = await Promise.all([
      readInvestorLedger(sheets, spreadsheetId),
      readPerformance(sheets, spreadsheetId),
      readCashBalance(sheets, spreadsheetId),
      readHoldingsDetail(sheets, spreadsheetId),
      readLots(sheets, spreadsheetId),
      getTaxReserveRatePct(),
    ]);

    const { navPerUnit } = latestNav(performance);
    const position = computeInvestorPosition(ledger, email, navPerUnit, null);
    if (!position || position.value == null) {
      return NextResponse.json({ error: `No position found for ${email}, or NAV not available yet.` }, { status: 404 });
    }

    const requestedAmount = amountRaw === "full" ? position.value : Number(amountRaw);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number or \"full\"" }, { status: 400 });
    }
    if (requestedAmount > position.value + 0.01) {
      return NextResponse.json({ error: `${email} only holds $${position.value.toFixed(2)} — cannot withdraw $${requestedAmount.toFixed(2)}.` }, { status: 400 });
    }

    const sellSelections: SellSelection[] = sellFrom.map((s) => {
      const holding = holdingsDetail.find((h) => h.ticker === s.ticker.toUpperCase());
      if (!holding?.currentPrice) throw new Error(`No current price found for ${s.ticker}.`);
      return { ticker: s.ticker.toUpperCase(), shares: s.shares, price: holding.currentPrice };
    });

    const preview = computeWithdrawalPreview(lots, requestedAmount, cashAvailable, sellSelections, taxReserveRatePct);

    return NextResponse.json({
      investor: { email, value: position.value, units: position.units },
      holdings: holdingsDetail,
      preview,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
