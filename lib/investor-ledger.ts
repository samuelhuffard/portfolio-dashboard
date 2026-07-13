import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { InvestorLedgerEntry as LedgerRow, PerformanceRow, Holding } from "./sheets";

// Faithful TypeScript port of portfolio-manager/lib/investor-ledger.js — the
// canonical row schema + HMAC signing for the append-only "Investors" tab.
// Any change to the canonical payload there MUST land here in the same commit
// (schema drift between the repos is the #1 recurring bug class — see
// ../portfolio-manager/docs/INVARIANTS.md #5 and #11). The HMAC cross-check in
// tests/investor-ledger.test.ts pins byte-for-byte agreement.

export interface SignedLedgerEntry {
  date: string;
  email: string;
  name: string;
  type: "Contribution" | "Withdrawal";
  amount: number;
  navPerUnit: number;
  units: number;
  investorId: string;
  entryId: string;
  rowHmac: string;
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

export function defaultInvestorId(email: unknown): string {
  return `email:${normalizeEmail(email)}`;
}

/**
 * Resolve the ledger signing secret. FAILS CLOSED: unlike the backend CLI,
 * the dashboard has NO unsigned-write escape hatch — a missing secret means
 * the write is refused, loudly. (Backend parity: same env names, same
 * AUDIT_HMAC_SECRET fallback, minus ALLOW_UNSIGNED_INVESTOR_LEDGER.)
 */
export function getInvestorLedgerSecret(): string {
  const secret = process.env.INVESTOR_LEDGER_HMAC_SECRET?.trim() || process.env.AUDIT_HMAC_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "INVESTOR_LEDGER_HMAC_SECRET is required to record investor ledger entries. The dashboard never writes unsigned ledger rows — set the same secret the Jetson backend uses."
    );
  }
  return secret;
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function stableJson(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

/** Canonical HMAC payload — field set and ordering mirror the backend exactly. */
export function computeInvestorLedgerHmac(
  entry: {
    amount: number;
    date: string;
    email: string;
    entryId: string;
    investorId: string;
    name: string;
    navPerUnit: number;
    type: string;
    units: number;
  },
  secret: string
): string {
  if (!secret) {
    throw new Error("Refusing to compute an investor ledger HMAC without a secret.");
  }
  const canonical: Json = {
    amount: entry.amount,
    date: entry.date,
    email: normalizeEmail(entry.email),
    entryId: entry.entryId,
    investorId: entry.investorId,
    name: entry.name,
    navPerUnit: entry.navPerUnit,
    type: entry.type,
    units: entry.units,
  };
  return createHmac("sha256", secret).update(stableJson(canonical)).digest("hex");
}

export function assertInvestorLedgerEntries<T extends {
  amount: number; date: string; email: string; entryId: string | null; investorId: string | null;
  name: string; navPerUnit: number | null; type: string; units: number; rowHmac: string | null;
}>(entries: T[], secret = getInvestorLedgerSecret()): T[] {
  let unsigned = 0;
  let mismatched = 0;
  for (const entry of entries) {
    if (!entry.rowHmac || !entry.entryId || !entry.investorId || entry.navPerUnit === null) {
      unsigned += 1;
      continue;
    }
    const expected = Buffer.from(computeInvestorLedgerHmac({ ...entry, entryId: entry.entryId, investorId: entry.investorId, navPerUnit: entry.navPerUnit }, secret), "hex");
    const provided = Buffer.from(entry.rowHmac, "hex");
    if (provided.length !== expected.length || provided.length === 0 || !timingSafeEqual(provided, expected)) mismatched += 1;
  }
  if (unsigned || mismatched) throw new Error(`investor ledger integrity check failed: ${unsigned} unsigned, ${mismatched} mismatched row(s).`);
  return entries;
}

export interface BuildEntryInput {
  date: string;
  email: string;
  name: string;
  type: "Contribution" | "Withdrawal";
  amount: number;
  navPerUnit: number;
  units: number;
  investorId?: string | null;
  entryId?: string | null;
}

export function buildInvestorLedgerEntry(input: BuildEntryInput, secret: string): SignedLedgerEntry {
  const base = {
    date: input.date,
    email: normalizeEmail(input.email),
    name: String(input.name ?? "").trim(),
    type: input.type,
    amount: input.amount,
    navPerUnit: input.navPerUnit,
    units: input.units,
    investorId: String(input.investorId || defaultInvestorId(input.email)).trim(),
    entryId: input.entryId || randomUUID(),
  };
  return { ...base, rowHmac: computeInvestorLedgerHmac(base, secret) };
}

/** Exact column layout of an Investors-tab row — mirrors backend investorLedgerRow (A:J). */
export function investorLedgerRow(entry: SignedLedgerEntry): (string | number)[] {
  return [
    entry.date,
    entry.email,
    entry.name,
    entry.type,
    entry.amount,
    entry.navPerUnit,
    entry.units,
    entry.investorId ?? defaultInvestorId(entry.email),
    entry.entryId ?? "",
    entry.rowHmac ?? "",
  ];
}

export function getTodayInNewYork(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

interface LedgerLike {
  email: string;
  units: number;
  investorId: string | null;
  type: string;
  amount: number;
}

function entryMatchesInvestor(entry: LedgerLike, { investorId, email }: { investorId: string; email: string }): boolean {
  if (investorId && entry.investorId === investorId) return true;
  return normalizeEmail(entry.email) === normalizeEmail(email);
}

export interface CalculateEntryInput {
  agentId: string;
  ledger: LedgerLike[];
  performanceHistory: Pick<PerformanceRow, "date" | "portfolioValue" | "navPerUnit">[];
  email: string;
  name: string;
  amount: number;
  isWithdrawal?: boolean;
  isSeedOwner?: boolean;
  investorId?: string | null;
  navDate?: string | null;
  allowStaleNav?: boolean;
  isExistingCapitalAttribution?: boolean;
  existingCapitalNavPerUnit?: number | null;
  /**
   * A verified pre-deposit NAV supplied only by the unmatched-cash workflow.
   * It prevents a new cash deposit from receiving shares at a post-deposit NAV
   * (or at the historic-capital $1 basis).
   */
  pricingNavPerUnit?: number | null;
  entryId?: string | null;
  now?: Date;
  secret: string;
}

export interface CalculateEntryResult {
  entry: SignedLedgerEntry;
  navPerUnit: number;
  seeded: boolean;
  units: number;
  unitsOutstandingAfter: number;
  investorUnitsAfter: number;
  ownershipPct: number;
}

/**
 * The full recording rulebook, ported from the backend's
 * calculateInvestorLedgerEntry (scripts/record-contribution.js path):
 * units at current NAV/unit, stale-NAV refusal, seed-owner guard,
 * withdrawal bounds. Pure — no I/O.
 */
export function calculateInvestorLedgerEntry({
  agentId,
  ledger,
  performanceHistory,
  email,
  name,
  amount,
  isWithdrawal = false,
  isSeedOwner = false,
  investorId,
  navDate,
  allowStaleNav = false,
  isExistingCapitalAttribution = false,
  existingCapitalNavPerUnit = null,
  pricingNavPerUnit = null,
  entryId = null,
  now = new Date(),
  secret,
}: CalculateEntryInput): CalculateEntryResult {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number.");

  const resolvedInvestorId = String(investorId || defaultInvestorId(email)).trim();
  const unitsOutstandingBefore = ledger.reduce((sum, entry) => sum + entry.units, 0);
  let navPerUnit: number;
  let seeded = false;

  if (unitsOutstandingBefore <= 0) {
    if (!isSeedOwner && !isExistingCapitalAttribution) {
      const existingValue = performanceHistory[performanceHistory.length - 1]?.portfolioValue ?? 0;
      if (existingValue > 1) {
        throw new Error(
          `[${agentId}] This agent already holds $${existingValue.toFixed(2)} of value with no investor ledger yet. Record the true owner first with an initial owner seed.`
        );
      }
    }
    navPerUnit = 1;
    seeded = true;
  } else if (isExistingCapitalAttribution) {
    if (!Number.isFinite(existingCapitalNavPerUnit) || (existingCapitalNavPerUnit as number) <= 0) {
      throw new Error(`[${agentId}] Existing-capital attribution requires a positive contribution-basis NAV per unit.`);
    }
    navPerUnit = existingCapitalNavPerUnit as number;
  } else if (pricingNavPerUnit != null) {
    if (isWithdrawal || !Number.isFinite(pricingNavPerUnit) || pricingNavPerUnit <= 0) {
      throw new Error(`[${agentId}] A new-cash contribution requires a positive pre-deposit NAV per unit.`);
    }
    navPerUnit = pricingNavPerUnit;
  } else {
    const latest = performanceHistory[performanceHistory.length - 1];
    if (!latest?.portfolioValue) {
      throw new Error(`[${agentId}] No Performance history with a portfolio value yet. Run holdings-sync first.`);
    }

    const requiredDate = navDate || getTodayInNewYork(now);
    if (!allowStaleNav && latest.date !== requiredDate) {
      throw new Error(
        `[${agentId}] Latest NAV is dated ${latest.date || "unknown"}, but this entry requires ${requiredDate}. Run a holdings sync first so units are issued at today's NAV.`
      );
    }
    if (navDate && latest.date !== navDate) {
      throw new Error(`[${agentId}] Requested NAV date ${navDate}, but latest Performance row is ${latest.date || "unknown"}.`);
    }

    navPerUnit = latest.navPerUnit != null ? latest.navPerUnit : (latest.portfolioValue as number) / unitsOutstandingBefore;
  }

  const units = (isWithdrawal ? -1 : 1) * (amount / navPerUnit);
  const existingInvestorUnits = ledger
    .filter((entry) => entryMatchesInvestor(entry, { investorId: resolvedInvestorId, email }))
    .reduce((sum, entry) => sum + entry.units, 0);

  if (isWithdrawal && Math.abs(units) > existingInvestorUnits + 1e-6) {
    throw new Error(
      `[${agentId}] Investor only holds ${existingInvestorUnits.toFixed(4)} units (~$${(existingInvestorUnits * navPerUnit).toFixed(2)}) and cannot withdraw $${amount}.`
    );
  }

  const entry = buildInvestorLedgerEntry(
    {
      date: getTodayInNewYork(now),
      email,
      name,
      type: isWithdrawal ? "Withdrawal" : "Contribution",
      amount,
      navPerUnit: round4(navPerUnit),
      units: round4(units),
      investorId: resolvedInvestorId,
      entryId: entryId ?? undefined,
    },
    secret
  );

  const unitsOutstandingAfter = unitsOutstandingBefore + units;
  const investorUnitsAfter = existingInvestorUnits + units;
  const ownershipPct = unitsOutstandingAfter > 0 ? (investorUnitsAfter / unitsOutstandingAfter) * 100 : 0;

  return {
    entry,
    navPerUnit,
    seeded,
    units,
    unitsOutstandingAfter,
    investorUnitsAfter,
    ownershipPct,
  };
}

// ── Unattributed-capital detection ──────────────────────────────────────────

/** Rounding tolerance in dollars — transfers below this are noise, not deposits. */
export const UNATTRIBUTED_TOLERANCE = 1;

export interface UnattributedCapital {
  /** (cash + cost basis of holdings) − (net ledger contributions). */
  amount: number;
  capitalIn: number;
  netContributions: number;
  detected: boolean;
}

/**
 * Money that arrived in the account but was never attributed to an investor:
 * capital actually put in (idle cash + what was paid for current holdings)
 * minus what the ledger says investors put in net of withdrawals. Market
 * gains/losses don't move this number because cost basis, not market value,
 * is used.
 */
export function computeUnattributedCapital(
  holdings: Pick<Holding, "costBasis">[],
  cash: number | null,
  ledger: Pick<LedgerRow, "type" | "amount">[]
): UnattributedCapital {
  const costBasisTotal = holdings.reduce((sum, h) => sum + (h.costBasis ?? 0), 0);
  const capitalIn = (cash ?? 0) + costBasisTotal;
  const contributions = ledger.filter((e) => e.type === "Contribution").reduce((s, e) => s + e.amount, 0);
  const withdrawals = ledger.filter((e) => e.type === "Withdrawal").reduce((s, e) => s + e.amount, 0);
  const netContributions = contributions - withdrawals;
  const amount = Math.round((capitalIn - netContributions) * 100) / 100;
  return { amount, capitalIn, netContributions, detected: amount > UNATTRIBUTED_TOLERANCE };
}
