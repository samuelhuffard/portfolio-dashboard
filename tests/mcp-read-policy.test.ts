import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMcpReadReceiptEvidence, MCP_JOB_HISTORY_MAX, MCP_JOB_HISTORY_TTL_SECONDS } from "../scripts/mcp-read-receipt.mjs";

const source = readFileSync(new URL("../scripts/mac-companion.mjs", import.meta.url), "utf8");

function section(start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `could not find ${start}..${end}`);
  return source.slice(from, to);
}

test("scheduled MCP holdings/reconciliation use exact read-only tool allowlists", () => {
  const holdings = section("async function syncHoldings", "// ── Market scan sync");
  const reconciliation = section("async function runDailyReconciliation", "// ── Main poll loop");
  for (const segment of [holdings, reconciliation]) {
    assert.doesNotMatch(segment, /mcp__robinhood-trading__\*/);
    assert.doesNotMatch(segment, /place_equity_order|cancel_equity_order|review_equity_order|create_scan/);
    assert.match(segment, /get_accounts/);
  }
  assert.match(holdings, /MCP_SNAPSHOT_TOOLS/);
  assert.match(reconciliation, /MCP_RECONCILE_TOOLS/);
  assert.match(holdings, /accountNumber === AGENTIC_ACCOUNT_NUMBER/);
  assert.match(reconciliation, /accountNumber === AGENTIC_ACCOUNT_NUMBER/);
  assert.match(holdings, /account_number exactly \$\{AGENTIC_ACCOUNT_NUMBER\}/);
  assert.match(reconciliation, /account_number exactly \$\{AGENTIC_ACCOUNT_NUMBER\}/);
  assert.match(holdings, /assertScheduledMcpAccountBinding/);
  assert.match(reconciliation, /assertScheduledMcpAccountBinding/);
  assert.match(holdings, /--output-format", "stream-json"/);
  assert.match(reconciliation, /--output-format", "stream-json"/);
});

test("scheduled MCP reads use a durable lease and a receipt rather than GETDEL", () => {
  const protocol = section("function mcpReadRequestKey", "async function getProposal");
  assert.match(protocol, /McpReadRequestSchema\.parse/);
  assert.match(protocol, /"NX", "EX", MCP_READ_LEASE_SECONDS/);
  assert.match(protocol, /buildMcpReadReceiptEvidence/);
  assert.doesNotMatch(protocol, /getdel/);
  assert.match(source, /--request-id/, "snapshot requests must make Sheets retries idempotent");
});

const request = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "holdings-sync" as const,
  requestedAt: "2026-07-14T13:29:00.000Z",
  requestedForET: "2026-07-14",
  invocationId: "2026-07-14/09:30",
};

test("successful MCP evidence is provenance-bound and targets bounded daily history", () => {
  const evidence = buildMcpReadReceiptEvidence(
    request,
    { ok: true, outcome: "ok", error: null },
    "2026-07-14T13:31:00.000Z",
  );
  assert.equal(evidence.receipt.accountVerified, true);
  assert.equal(evidence.receipt.accountPolicyVersion, "agentic-account-binding-v1");
  assert.equal(evidence.jobRecord.source, "mac-robinhood-mcp");
  assert.equal(evidence.jobRecord.requestId, request.id);
  assert.equal(evidence.jobRecord.invocationId, request.invocationId);
  assert.equal(evidence.historyKey, "pm:job:holdings-sync:history:2026-07-14");
  assert.equal(MCP_JOB_HISTORY_MAX, 100);
  assert.equal(MCP_JOB_HISTORY_TTL_SECONDS, 14 * 24 * 3600);
});

test("mismatch and failure receipts cannot claim account verification", () => {
  for (const result of [
    { ok: false, outcome: "mismatch", error: null },
    { ok: false, outcome: "failed", error: "broker read failed" },
  ] as const) {
    const evidence = buildMcpReadReceiptEvidence(request, result, "2026-07-14T13:31:00.000Z");
    assert.equal(evidence.receipt.ok, false);
    assert.equal(evidence.receipt.accountVerified, false);
    assert.equal(evidence.receipt.outcome, result.outcome);
  }
});

test("a coalesced scheduler slot never receives fabricated completion evidence", () => {
  const existingPendingRequest = { ...request, invocationId: "2026-07-14/09:30" };
  const evidence = buildMcpReadReceiptEvidence(
    existingPendingRequest,
    { ok: true, outcome: "ok", error: null },
    "2026-07-14T15:01:00.000Z",
  );
  assert.equal(evidence.jobRecord.invocationId, "2026-07-14/09:30");
  assert.notEqual(evidence.jobRecord.invocationId, "2026-07-14/11:00");
});
