import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProposalInput } from "../lib/proposals";

test("validateProposalInput normalizes a safe approval proposal", () => {
  const result = validateProposalInput({
    agentId: "agent-1",
    ticker: "vti",
    side: "buy",
    amountDollars: "2500.129",
    maxPrice: "315.239",
    rationale: "Increase broad market ETF exposure after manager review.",
    riskSummary: "Keeps sizing inside the proposal cap.",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.ticker, "VTI");
  assert.equal(result.value.side, "BUY");
  assert.equal(result.value.amountDollars, 2500.13);
  assert.equal(result.value.maxPrice, 315.24);
});

test("validateProposalInput caps proposal size", () => {
  const result = validateProposalInput({
    agentId: "agent-1",
    ticker: "VTI",
    side: "BUY",
    amountDollars: 10001,
    rationale: "Increase broad market ETF exposure after manager review.",
  });

  assert.equal(result.ok, false);
});

test("validateProposalInput rejects unknown agents", () => {
  const result = validateProposalInput({
    agentId: "agent-99",
    ticker: "VTI",
    side: "BUY",
    amountDollars: 2500,
    rationale: "Increase broad market ETF exposure after manager review.",
  });

  assert.equal(result.ok, false);
});
