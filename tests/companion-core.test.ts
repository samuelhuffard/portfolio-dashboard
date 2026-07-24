import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeDecisionSignature as companionSignature,
  verifyApprovalSignature,
  verifySellOwnerShareCeiling,
  verifySellFillWithinOwnerShareCeiling,
  buildOrderInstructions,
  decideReconcileAction,
  isPlausibleOrderId,
  isMarketOpen,
  resolveCompanionRole,
  MARKET_HOLIDAYS,
} from "../scripts/companion-core.mjs";
import { computeDecisionSignature as dashboardSignature } from "../lib/proposals";
// Backend copy — cross-repo import is deliberate: all three implementations
// must produce identical signatures or approvals verified by one runtime would
// be rejected (or worse, forgeable) in another.
import { computeDecisionSignature as backendSignature } from "../../portfolio-manager/lib/proposal-signature.js";

const SECRET = "cross-check-secret";

const approved = {
  id: "9f1c2b3a-1111-2222-3333-444455556666",
  status: "ApprovedForBrokerReview" as const,
  agentId: "agent-1",
  ticker: "NVDA",
  side: "BUY" as const,
  amountDollars: 25.5,
  maxPrice: 197.42,
  decidedAt: "2026-07-02T14:00:00.000Z",
  decidedByUserId: "user_sam",
};

test("all three signature implementations agree (dashboard, backend, companion)", () => {
  const a = dashboardSignature(approved, SECRET);
  const b = backendSignature(approved, SECRET);
  const c = companionSignature(approved, SECRET);
  assert.equal(a, b, "dashboard vs backend signature drift");
  assert.equal(a, c, "dashboard vs companion signature drift");

  // And they agree on null maxPrice handling (the "" sentinel).
  const noMax = { ...approved, maxPrice: null };
  assert.equal(dashboardSignature(noMax, SECRET), companionSignature(noMax, SECRET));
  assert.equal(backendSignature(noMax, SECRET), companionSignature(noMax, SECRET));
});

test("companion refuses unsigned, forged, and unverifiable proposals", () => {
  const signed = { ...approved, decisionHmac: companionSignature(approved, SECRET) };
  assert.equal(verifyApprovalSignature(signed, SECRET).ok, true);
  assert.equal(verifyApprovalSignature({ ...signed, decisionHmac: null }, SECRET).ok, false);
  assert.equal(verifyApprovalSignature({ ...signed, amountDollars: 9999 }, SECRET).ok, false);
  // No secret available → refuse (fail closed), never allow.
  assert.equal(verifyApprovalSignature(signed, undefined).ok, false);
});

test("order instructions match the proposal side", () => {
  const sell = buildOrderInstructions({
    ticker: "NVDA",
    side: "SELL",
    amountDollars: 25,
    maxPrice: null,
    proposalContractVersion: 2,
    sellOwnerShareLimit: 0.125,
  });
  assert.match(sell, /sell up to \$25 notional/);
  assert.match(sell, /never sell more than 0.125 shares/i);
  assert.doesNotMatch(sell, /buy/i);

  const limitBuy = buildOrderInstructions({ ticker: "NVDA", side: "BUY", amountDollars: 1000, maxPrice: 200 });
  assert.match(limitBuy, /LIMIT ORDER — buy 5 whole shares/);

  // Limit impossible (amount < 1 share) → market notional buy.
  const smallBuy = buildOrderInstructions({ ticker: "NVDA", side: "BUY", amountDollars: 25, maxPrice: 200 });
  assert.match(smallBuy, /MARKET ORDER — buy \$25 notional/);
});

test("new SELL execution is capped by the signed strategy-owned shares", () => {
  const scopedSell = {
    ticker: "SAME",
    side: "SELL",
    amountDollars: 500,
    maxPrice: null,
    proposalContractVersion: 2,
    sellOwnerShareLimit: 4,
  };
  assert.deepEqual(verifySellOwnerShareCeiling(scopedSell), { ok: true, legacy: false });
  const instructions = buildOrderInstructions(scopedSell);
  assert.match(instructions, /hard strategy-owner ceiling of 4 shares/);
  assert.match(instructions, /Never use the account-wide SAME position as the ceiling/);
  assert.throws(
    () => buildOrderInstructions({ ...scopedSell, sellOwnerShareLimit: null }),
    /not executable/,
  );
  assert.equal(verifySellOwnerShareCeiling({ side: "SELL" }).ok, false);
  assert.equal(verifySellFillWithinOwnerShareCeiling(scopedSell, 4).ok, true);
  assert.match(
    verifySellFillWithinOwnerShareCeiling(scopedSell, 4.00000002).reason ?? "",
    /exceeds signed strategy-owner ceiling/,
  );
});

test("reconcile decision table covers every broker outcome", () => {
  // Order filled → record it.
  assert.deepEqual(decideReconcileAction({ found: true, orderId: "o1", state: "filled", shares: 2, price: 100 }), {
    action: "record",
    orderId: "o1",
    shares: 2,
    price: 100,
  });
  // No order at the broker → safe to retry.
  assert.deepEqual(decideReconcileAction({ found: false }), { action: "retry" });
  // Terminal non-fill → retry, with an alert.
  for (const state of ["cancelled", "rejected", "failed", "voided"]) {
    const d = decideReconcileAction({ found: true, orderId: "o2", state });
    assert.equal(d.action, "retry");
    assert.match(d.alert ?? "", new RegExp(state));
  }
  // Still working → wait, never re-execute.
  for (const state of ["new", "queued", "confirmed", "partially_filled", ""]) {
    assert.equal(decideReconcileAction({ found: true, orderId: "o3", state }).action, "wait");
  }
});

test("fabricated order IDs are rejected before recording", () => {
  assert.equal(isPlausibleOrderId("9f1c2b3a-1111-2222-3333-444455556666"), true);
  assert.equal(isPlausibleOrderId("order-12345"), false);
  assert.equal(isPlausibleOrderId(""), false);
  assert.equal(isPlausibleOrderId(undefined), false);
  assert.equal(isPlausibleOrderId("I placed the order successfully"), false);
});

test("companion roles isolate always-on broker reads from real-money execution", () => {
  assert.deepEqual(resolveCompanionRole("read-worker"), {
    name: "read-worker",
    brokerReads: true,
    execution: false,
    marketScans: false,
    heartbeatKey: "pm:broker-reader:last-seen",
  });
  assert.deepEqual(resolveCompanionRole("execution"), {
    name: "execution",
    brokerReads: false,
    execution: true,
    marketScans: true,
    heartbeatKey: "pm:companion:last-seen",
  });
  assert.equal(resolveCompanionRole().name, "full", "rolling upgrades preserve the prior combined role");
  assert.throws(() => resolveCompanionRole("reader-ish"), /Invalid COMPANION_ROLE/);
});

test("companion startup and queues are gated by the resolved role", () => {
  const source = readFileSync(new URL("../scripts/mac-companion.mjs", import.meta.url), "utf8");
  assert.match(source, /const COMPANION_ROLE = resolveCompanionRole\(process\.env\.COMPANION_ROLE\)/);
  assert.match(source, /if \(!COMPANION_ROLE\.execution\) return/);
  assert.match(source, /if \(COMPANION_ROLE\.execution\) \{\s*const triggered = await redisCmd\("getdel", "pm:exec_trigger"/);
  assert.match(source, /if \(COMPANION_ROLE\.brokerReads\) \{\s*await processMcpReadRequest\("holdings-sync"/);
  assert.match(source, /if \(COMPANION_ROLE\.execution\) setInterval\(poll, POLL_INTERVAL_MS\)/);
  assert.match(source, /COMPANION_ROLE\.heartbeatKey/);
  assert.match(source, /verifySellFillWithinOwnerShareCeiling\(proposal, shares\)/);
});

test("companion reconciliation requires exact ref_id and broker confirmation before accounting", () => {
  const source = readFileSync(new URL("../scripts/mac-companion.mjs", import.meta.url), "utf8");
  assert.match(source, /Return found=true ONLY for the order whose ref_id is exactly/);
  assert.match(source, /Never guess from ticker, time, or recency/);
  assert.doesNotMatch(source, /treat the most recent agentic/);
  assert.match(source, /decision\.action !== "record" \|\| decision\.orderId !== result\.orderId/);
});

test("companion execution pins every live order to the configured Agentic account", () => {
  const source = readFileSync(new URL("../scripts/mac-companion.mjs", import.meta.url), "utf8");
  assert.match(source, /const MCP_EXECUTION_TOOLS = \[/);
  assert.match(source, /"mcp__robinhood-trading__get_accounts"/);
  assert.match(source, /"mcp__robinhood-trading__place_equity_order"/);
  assert.match(source, /ROBINHOOD_ACCOUNT_NUMBER is required to execute/);
  assert.match(source, /account_number "\$\{AGENTIC_ACCOUNT_NUMBER\}" to place_equity_order/);
  assert.match(source, /assertScheduledMcpAccountBinding\(stdout, \["mcp__robinhood-trading__place_equity_order"\], AGENTIC_ACCOUNT_NUMBER\)/);
  assert.match(source, /Broker result did not confirm the configured Agentic account/);
});

test("companion launches Claude with stdin detached for unattended broker work", () => {
  const source = readFileSync(new URL("../scripts/mac-companion.mjs", import.meta.url), "utf8");
  assert.match(source, /function runClaude\(args, options\)/);
  assert.match(source, /stdio:\s*\["ignore", "pipe", "pipe"\]/);
  assert.match(source, /execFileWithClosedStdin\(execFile, CLAUDE_BIN, args/);
  assert.match(source, /Claude CLI failed/);
});

test("companion heartbeat cannot overlap or crash on a rejected async tick", () => {
  const source = readFileSync(new URL("../scripts/mac-companion.mjs", import.meta.url), "utf8");
  assert.match(source, /let heartbeatInFlight = false/);
  assert.match(source, /if \(heartbeatInFlight\)/);
  assert.match(source, /await heartbeat\(\)/);
  assert.match(source, /Heartbeat error:/);
  assert.match(source, /finally \{\s*heartbeatInFlight = false/);
  assert.match(source, /setInterval\(\(\) => void heartbeatTick\(\), 30_000\)/);
  assert.doesNotMatch(source, /setInterval\(heartbeat, 30_000\)/);
});

test("companion Redis helpers reject HTTP and Upstash command errors", () => {
  const source = readFileSync(new URL("../scripts/mac-companion.mjs", import.meta.url), "utf8");
  assert.match(source, /if \(!res\.ok \|\| json\.error\) throw new Error/);
});

test("companion MCP failures cannot dump the command prompt or account identifier", () => {
  const source = readFileSync(new URL("../scripts/mac-companion.mjs", import.meta.url), "utf8");
  assert.match(source, /function safeMcpReadError/);
  assert.match(source, /split\("Command failed:"\)/);
  assert.match(source, /\[REDACTED_ACCOUNT\]/);
  assert.match(source, /slice\(0, 300\)/);
  assert.match(source, /error: safeError/);
  assert.doesNotMatch(source, /MCP read failed:", error\.message/);
});

test("market clock: weekends, holidays, and hours", () => {
  // Thu 2026-07-02 12:00 ET (16:00 UTC) — open.
  assert.equal(isMarketOpen(new Date("2026-07-02T16:00:00Z")), true);
  // Fri 2026-07-03 12:00 ET — Independence Day observed, closed.
  assert.equal(isMarketOpen(new Date("2026-07-03T16:00:00Z")), false);
  // Sat 2026-07-04 — weekend.
  assert.equal(isMarketOpen(new Date("2026-07-04T16:00:00Z")), false);
  // Thu 2026-11-26 — Thanksgiving.
  assert.equal(isMarketOpen(new Date("2026-11-26T16:00:00Z")), false);
  // Regular Tuesday before open (9:00 ET) and after close (16:30 ET).
  assert.equal(isMarketOpen(new Date("2026-07-07T13:00:00Z")), false);
  assert.equal(isMarketOpen(new Date("2026-07-07T20:30:00Z")), false);
  // Winter (EST): Mon 2026-12-14 10:00 ET = 15:00 UTC — open.
  assert.equal(isMarketOpen(new Date("2026-12-14T15:00:00Z")), true);
  assert.ok(MARKET_HOLIDAYS.has("2027-12-24"), "holiday list must extend into 2027");
});
