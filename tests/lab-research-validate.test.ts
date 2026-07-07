import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateLabResearchRequest,
  LAB_TICKER_RE,
  DEFAULT_LAB_AGENT_ID,
} from "../app/api/lab-research/validate";

test("validateLabResearchRequest accepts a normal ticker + agent", () => {
  const result = validateLabResearchRequest({ ticker: "nvda", agentId: "agent-2" });
  assert.deepEqual(result, { ok: true, ticker: "NVDA", agentId: "agent-2" });
});

test("validateLabResearchRequest normalizes whitespace and defaults agentId", () => {
  const result = validateLabResearchRequest({ ticker: "  aapl " });
  assert.deepEqual(result, { ok: true, ticker: "AAPL", agentId: DEFAULT_LAB_AGENT_ID });

  const empty = validateLabResearchRequest({ ticker: "msft", agentId: "" });
  assert.deepEqual(empty, { ok: true, ticker: "MSFT", agentId: DEFAULT_LAB_AGENT_ID });
});

test("validateLabResearchRequest accepts class-suffix tickers", () => {
  assert.equal(validateLabResearchRequest({ ticker: "BRK.B" }).ok, true);
  assert.equal(validateLabResearchRequest({ ticker: "bf-b" }).ok, true);
});

test("validateLabResearchRequest rejects malformed bodies", () => {
  for (const body of [null, undefined, "NVDA", 42, ["NVDA"]]) {
    const result = validateLabResearchRequest(body);
    assert.equal(result.ok, false);
  }
});

test("validateLabResearchRequest rejects missing or invalid tickers", () => {
  for (const ticker of [undefined, "", "   ", 123, "TOOLONGG", "NV DA", "NVDA!", "BRK.BBB", "nvda$"]) {
    const result = validateLabResearchRequest({ ticker });
    assert.equal(result.ok, false, `expected rejection for ticker ${JSON.stringify(ticker)}`);
  }
});

test("validateLabResearchRequest rejects unknown or non-string agent ids", () => {
  const unknown = validateLabResearchRequest({ ticker: "NVDA", agentId: "agent-99" });
  assert.equal(unknown.ok, false);
  assert.match((unknown as { error: string }).error, /Unknown agentId/);

  const nonString = validateLabResearchRequest({ ticker: "NVDA", agentId: 7 });
  assert.equal(nonString.ok, false);
});

test("LAB_TICKER_RE matches the backend's strict lab format", () => {
  for (const good of ["A", "NVDA", "GOOGL", "BRK.B", "BF-B", "RDS.A"]) {
    assert.equal(LAB_TICKER_RE.test(good), true, `expected match: ${good}`);
  }
  for (const bad of ["", "TOOLONG", "BRK.", "BRK.BBB", "1234", "nv-da"]) {
    assert.equal(LAB_TICKER_RE.test(bad), false, `expected no match: ${bad}`);
  }
});
