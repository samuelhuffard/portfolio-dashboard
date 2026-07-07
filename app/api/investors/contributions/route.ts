import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import {
  getServiceAccountClients,
  getSharedSpreadsheetId,
  readInvestorLedger,
  readPerformance,
  appendInvestorLedgerEntry,
} from "@/lib/sheets";
import { calculateInvestorLedgerEntry, getInvestorLedgerSecret, getTodayInNewYork } from "@/lib/investor-ledger";

// Records a real contribution or withdrawal into the shared portfolio's
// capital ledger — the dashboard twin of portfolio-manager's
// scripts/record-contribution.js. Never moves money; only records what Sam
// confirms already happened. Every rule (stale NAV, seed-owner guard,
// withdrawal bounds, HMAC signing) is enforced HERE, server-side — the
// client is never trusted.

const PORTFOLIO_LABEL = "portfolio";

interface ContributionBody {
  email?: unknown;
  name?: unknown;
  amount?: unknown;
  type?: unknown; // "Contribution" | "Withdrawal"
  date?: unknown; // YYYY-MM-DD; defaults to today (America/New_York)
  investorId?: unknown;
  seedOwner?: unknown; // explicit initial-owner-seed confirmation (mirrors --seed-owner)
}

export async function POST(req: Request) {
  const authz = await requireApiPermission({
    permission: "investors:manage",
    action: "INVESTOR_CONTRIBUTION_RECORD",
    request: req,
  });
  if (!authz.ok) return authz.response;

  let body: ContributionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  const type = body.type === "Withdrawal" ? "Withdrawal" : body.type === "Contribution" ? "Contribution" : null;
  const date = typeof body.date === "string" && body.date.trim() ? body.date.trim() : getTodayInNewYork();
  const investorId = typeof body.investorId === "string" && body.investorId.trim() ? body.investorId.trim() : undefined;
  const seedOwner = body.seedOwner === true;

  if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid investor email is required." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Investor name is required." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Type must be "Contribution" or "Withdrawal".' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });

  // Fail CLOSED: no secret, no write — the dashboard has no unsigned escape hatch.
  let secret: string;
  try {
    secret = getInvestorLedgerSecret();
  } catch (err) {
    console.error("[investors/contributions] signing secret missing:", err);
    return NextResponse.json(
      { error: "Ledger signing is not configured (INVESTOR_LEDGER_HMAC_SECRET). Refusing to record an unsigned entry." },
      { status: 503 }
    );
  }

  try {
    const spreadsheetId = await getSharedSpreadsheetId();
    const sheets = await getServiceAccountClients();
    const [ledger, performance] = await Promise.all([
      readInvestorLedger(sheets, spreadsheetId),
      readPerformance(sheets, spreadsheetId),
    ]);

    const today = getTodayInNewYork();
    const result = calculateInvestorLedgerEntry({
      agentId: PORTFOLIO_LABEL,
      ledger,
      performanceHistory: performance,
      email,
      name,
      amount,
      isWithdrawal: type === "Withdrawal",
      isSeedOwner: seedOwner,
      investorId,
      // A backdated deposit is recorded at that day's NAV only if the latest
      // Performance row actually carries that date — same rule as the CLI's
      // --nav-date. Today's date means "current NAV required" (stale refusal).
      navDate: date !== today ? date : undefined,
      secret,
    });

    await appendInvestorLedgerEntry(sheets, spreadsheetId, result.entry);

    return NextResponse.json({
      recorded: true,
      seeded: result.seeded,
      entry: {
        date: result.entry.date,
        email: result.entry.email,
        name: result.entry.name,
        type: result.entry.type,
        amount: result.entry.amount,
        navPerUnit: result.entry.navPerUnit,
        units: result.entry.units,
        entryId: result.entry.entryId,
      },
      ownershipPct: result.ownershipPct,
      unitsOutstandingAfter: result.unitsOutstandingAfter,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record the ledger entry.";
    console.error("[investors/contributions]", message);
    const needsSeed = message.includes("true owner");
    // Rule violations (stale NAV, seed guard, withdrawal bounds) are client-fixable → 409.
    return NextResponse.json({ error: message, needsSeedOwner: needsSeed }, { status: 409 });
  }
}
