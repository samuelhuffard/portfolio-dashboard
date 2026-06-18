import type { InvestorLedgerEntry, PerformanceRow, Holding } from "./sheets";

export interface InvestorPosition {
  investorId: string | null;
  email: string;
  name: string;
  contributed: number;
  withdrawn: number;
  units: number;
  navPerUnit: number | null;
  value: number | null;
  gainLoss: number | null;
  gainLossPct: number | null;
  ownershipPct: number | null;
}

interface InvestorIdentity {
  userId?: string | null;
  email?: string | null;
}

/** Latest NAV per unit + units outstanding from a Performance series (oldest-first), or nulls if no NAV has been computed yet (no investors, or holdings-sync hasn't run since the first contribution). */
export function latestNav(performance: PerformanceRow[]): { navPerUnit: number | null; unitsOutstanding: number | null } {
  const last = performance[performance.length - 1];
  return { navPerUnit: last?.navPerUnit ?? null, unitsOutstanding: last?.unitsOutstanding ?? null };
}

/** One investor's position in one agent, computed from that agent's ledger + current NAV/unit. */
function identityMatches(entry: InvestorLedgerEntry, identity: string | InvestorIdentity): boolean {
  const email = typeof identity === "string" ? identity : identity.email;
  const userId = typeof identity === "string" ? null : identity.userId;
  if (userId && entry.investorId && entry.investorId === userId) return true;
  return Boolean(email && entry.email.toLowerCase() === email.toLowerCase());
}

function rosterKey(entry: InvestorLedgerEntry): string {
  return entry.investorId || entry.email.toLowerCase();
}

/** One investor's position in one agent, computed from that agent's ledger + current NAV/unit. */
export function computeInvestorPosition(ledger: InvestorLedgerEntry[], identity: string | InvestorIdentity, navPerUnit: number | null, unitsOutstanding: number | null): InvestorPosition | null {
  const mine = ledger.filter((e) => identityMatches(e, identity));
  if (!mine.length) return null;

  const contributed = mine.filter((e) => e.type === "Contribution").reduce((s, e) => s + e.amount, 0);
  const withdrawn = mine.filter((e) => e.type === "Withdrawal").reduce((s, e) => s + e.amount, 0);
  const units = mine.reduce((s, e) => s + e.units, 0);
  const value = navPerUnit != null ? units * navPerUnit : null;
  const netContributed = contributed - withdrawn;
  const gainLoss = value != null ? value - netContributed : null;
  const gainLossPct = gainLoss != null && netContributed ? (gainLoss / netContributed) * 100 : null;
  const ownershipPct = unitsOutstanding ? (units / unitsOutstanding) * 100 : null;

  return { investorId: mine[0].investorId, email: mine[0].email, name: mine[0].name, contributed, withdrawn, units, navPerUnit, value, gainLoss, gainLossPct, ownershipPct };
}

/** Every investor's position in one agent — for the FundManager's full roster view. */
export function computeRoster(ledger: InvestorLedgerEntry[], navPerUnit: number | null, unitsOutstanding: number | null): InvestorPosition[] {
  const keys = [...new Set(ledger.map(rosterKey))];
  return keys
    .map((key) => {
      const sample = ledger.find((entry) => rosterKey(entry) === key);
      return sample ? computeInvestorPosition(ledger, { userId: sample.investorId, email: sample.email }, navPerUnit, unitsOutstanding) : null;
    })
    .filter((p): p is InvestorPosition => p !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

export interface ProRataHolding {
  ticker: string;
  name: string;
  marketValue: number;
}

/** An investor's pro-rata exposure to each position the fund holds — they don't own these shares directly, just a slice of the pool that holds them. */
export function computeProRataHoldings(holdings: Holding[], ownershipPct: number | null): ProRataHolding[] {
  if (ownershipPct == null) return [];
  return holdings
    .filter((h) => h.marketValue != null)
    .map((h) => ({ ticker: h.ticker, name: h.name, marketValue: Math.round((h.marketValue as number) * (ownershipPct / 100) * 100) / 100 }))
    .sort((a, b) => b.marketValue - a.marketValue);
}
