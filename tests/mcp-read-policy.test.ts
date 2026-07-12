import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  assert.match(protocol, /McpReadReceiptSchema\.parse/);
  assert.doesNotMatch(protocol, /getdel/);
  assert.match(source, /--request-id/, "snapshot requests must make Sheets retries idempotent");
});
