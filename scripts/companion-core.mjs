/**
 * Pure logic for the Mac trade executor (mac-companion.mjs) — extracted so the
 * money-critical decisions have test coverage (tests/companion-core.test.ts).
 * No I/O, no env reads at module level, no side effects.
 */

import { timingSafeEqual } from "node:crypto";
// The signature payload + HMAC now live single-source in the shared contract
// (../lib/contracts/signature.js). tests/companion-core.test.ts still cross-checks
// that this, the dashboard, and the backend all agree.
import { computeDecisionSignature } from "../lib/contracts/signature.js";
export { computeDecisionSignature };

// ── Process role isolation ─────────────────────────────────────────────────
// Keep scheduled broker reads and signed trade execution separable so an
// always-on read worker cannot accidentally gain execution authority.
export function resolveCompanionRole(value = "full") {
  const name = String(value ?? "").trim().toLowerCase() || "full";
  const roles = {
    full: {
      name: "full",
      brokerReads: true,
      execution: true,
      marketScans: true,
      heartbeatKey: "pm:companion:last-seen",
    },
    "read-worker": {
      name: "read-worker",
      brokerReads: true,
      execution: false,
      marketScans: false,
      heartbeatKey: "pm:broker-reader:last-seen",
    },
    execution: {
      name: "execution",
      brokerReads: false,
      execution: true,
      marketScans: true,
      heartbeatKey: "pm:companion:last-seen",
    },
  };
  const role = roles[name];
  if (!role) {
    throw new Error(`Invalid COMPANION_ROLE "${name}". Expected full, read-worker, or execution.`);
  }
  return Object.freeze(role);
}

export function verifyApprovalSignature(proposal, secret) {
  if (!secret) {
    return { ok: false, reason: "AUDIT_HMAC_SECRET is not configured on this machine — cannot verify approvals" };
  }
  if (!proposal.decisionHmac) {
    return { ok: false, reason: "proposal has no decision signature (not approved through the dashboard)" };
  }
  const expected = Buffer.from(computeDecisionSignature(proposal, secret), "hex");
  const provided = Buffer.from(String(proposal.decisionHmac), "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "decision signature is INVALID (fields modified after approval, or forged)" };
  }
  return { ok: true };
}

// ── Order instructions ─────────────────────────────────────────────────────
// SELL must never inherit BUY math or BUY wording (the prompt used to say
// "buy $X notional" for SELL proposals on a live account).
export function buildOrderInstructions({ ticker, side, amountDollars, maxPrice }) {
  const isSell = String(side).toUpperCase() === "SELL";
  if (isSell) {
    return `MARKET ORDER — sell $${amountDollars} notional of ${ticker} using dollar-amount fractional sizing.
First check current positions: if the ${ticker} position's market value is LESS than $${amountDollars}, sell the entire remaining position (by share quantity) instead of the dollar amount. Never sell more than currently held. If there is no ${ticker} position at all, place NO order and report failure.`;
  }
  const wholeShares = maxPrice ? Math.floor(amountDollars / maxPrice) : 0;
  const useLimit = Boolean(maxPrice) && wholeShares >= 1;
  return useLimit
    ? `LIMIT ORDER — buy ${wholeShares} whole shares of ${ticker} at limit price $${maxPrice}. Use whole share quantity, NOT dollar amount.`
    : `MARKET ORDER — buy $${amountDollars} notional of ${ticker} using dollar-amount fractional sizing.`;
}

// ── Reconcile decision table ───────────────────────────────────────────────
// A proposal stuck in executionState "Executing" means an order attempt started
// but its outcome was never confirmed. Given the broker's answer, decide what
// to do — NEVER blindly re-execute.
//   rec = { found: boolean, orderId?, state?, shares?, price? }
// Returns one of:
//   { action: "record",  orderId, shares, price }  — order filled; record + fulfill
//   { action: "retry" }                            — no/terminal order; clear Executing, re-execute next poll
//   { action: "retry", alert }                     — same, but page Sam (order died at the broker)
//   { action: "wait" }                             — order still working; check again next poll
export function decideReconcileAction(rec) {
  if (!rec.found) {
    return { action: "retry" };
  }
  const state = String(rec.state ?? "").toLowerCase();
  if (state === "filled") {
    return { action: "record", orderId: rec.orderId, shares: rec.shares, price: rec.price };
  }
  if (["cancelled", "rejected", "failed", "voided"].includes(state)) {
    return { action: "retry", alert: `broker order ${rec.orderId} ended ${state}` };
  }
  return { action: "wait" };
}

// ── Execution result sanity ────────────────────────────────────────────────
// The executor parses the model's JSON out of `claude -p` stdout — a
// hallucinated result must not reach the ledger. Robinhood order IDs are
// UUIDs; anything else is treated as fabricated.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isPlausibleOrderId(orderId) {
  return typeof orderId === "string" && UUID_RE.test(orderId.trim());
}

// ── Market hours ───────────────────────────────────────────────────────────
// Full-closure NYSE holidays. Early-close (1:00 PM) days are intentionally not
// modeled — morning execution on those days is legitimate, and afternoon
// orders are rejected by the broker anyway. EXTEND THIS LIST each December.
export const MARKET_HOLIDAYS = new Set([
  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Washington's Birthday
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed — Jul 4 is a Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
  // 2027
  "2027-01-01", // New Year's Day
  "2027-01-18", // Martin Luther King Jr. Day
  "2027-02-15", // Washington's Birthday
  "2027-03-26", // Good Friday
  "2027-05-31", // Memorial Day
  "2027-06-18", // Juneteenth (observed — Jun 19 is a Saturday)
  "2027-07-05", // Independence Day (observed — Jul 4 is a Sunday)
  "2027-09-06", // Labor Day
  "2027-11-25", // Thanksgiving
  "2027-12-24", // Christmas (observed — Dec 25 is a Saturday)
]);

export function easternClock(now = new Date()) {
  return easternParts(now);
}

function easternParts(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    weekday: byType.weekday,
    minutes: Number(byType.hour) * 60 + Number(byType.minute),
  };
}

export function isMarketOpen(now = new Date(), holidays = MARKET_HOLIDAYS) {
  const { date, weekday, minutes } = easternParts(now);
  if (weekday === "Sat" || weekday === "Sun") return false;
  if (holidays.has(date)) return false;
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60; // 9:30–16:00 ET
}
