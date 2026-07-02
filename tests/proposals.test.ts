import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyProposalDecision,
  assertCashAvailableForBuyProposal,
  assertCashAvailableForAcceptance,
  computeAcceptedBuyReserve,
  computeAvailableBuyCash,
  computeDecisionSignature,
  validateProposalInput,
  type AllocationProposal,
} from "../lib/proposals";

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

const baseProposal: AllocationProposal = {
  id: "proposal-1",
  agentId: "agent-1",
  ticker: "VTI",
  side: "BUY",
  amountDollars: 2500,
  maxPrice: null,
  rationale: "Increase broad market ETF exposure after manager review.",
  riskSummary: "Keeps sizing inside the proposal cap.",
  status: "Pending",
  createdAt: "2026-06-18T10:00:00.000Z",
  updatedAt: "2026-06-18T10:00:00.000Z",
  expiresAt: "2026-06-20T10:00:00.000Z",
  createdByUserId: "user_creator",
  createdByEmail: "manager@example.com",
  decidedAt: null,
  decidedByUserId: null,
  decisionNote: null,
  fulfilledAt: null,
  fulfilledOrderId: null,
  fulfilledShares: null,
  decisionHmac: null,
};

test("applyProposalDecision records a one-way approval", () => {
  const decided = applyProposalDecision(
    baseProposal,
    "ApprovedForBrokerReview",
    "Reviewed by both managers.",
    "user_decider",
    "2026-06-18T11:00:00.000Z"
  );

  assert.equal(decided.status, "ApprovedForBrokerReview");
  assert.equal(decided.decidedByUserId, "user_decider");
  assert.equal(decided.decisionNote, "Reviewed by both managers.");
  assert.equal(decided.decidedAt, "2026-06-18T11:00:00.000Z");
});

test("applyProposalDecision rejects direct changes to already-decided proposals", () => {
  assert.throws(
    () => applyProposalDecision({ ...baseProposal, status: "ApprovedForBrokerReview" }, "Rejected", "", "user_decider"),
    /already been decided/
  );
});

test("applyProposalDecision rejects deciding an expired proposal", () => {
  assert.throws(
    () => applyProposalDecision({ ...baseProposal, status: "Expired" }, "ApprovedForBrokerReview", "", "user_decider"),
    /expired 48 hours/
  );
});

test("cash acceptance reserve counts accepted unfilled BUYs but not pending alternatives", () => {
  const proposals: AllocationProposal[] = [
    { ...baseProposal, id: "accepted-buy", status: "ApprovedForBrokerReview", amountDollars: 700, fulfilledAt: null },
    { ...baseProposal, id: "pending-buy", status: "Pending", amountDollars: 900, fulfilledAt: null },
    { ...baseProposal, id: "filled-buy", status: "ApprovedForBrokerReview", amountDollars: 500, fulfilledAt: "2026-06-19T10:00:00.000Z" },
    { ...baseProposal, id: "accepted-sell", side: "SELL", status: "ApprovedForBrokerReview", amountDollars: 500, fulfilledAt: null },
  ];

  assert.equal(computeAcceptedBuyReserve(proposals), 700);
  assert.equal(computeAvailableBuyCash(proposals, 1000), 300);
});

test("creating or editing a BUY cannot exceed cash after accepted reserves", () => {
  const proposals: AllocationProposal[] = [
    { ...baseProposal, id: "accepted-buy", status: "ApprovedForBrokerReview", amountDollars: 700, fulfilledAt: null },
    { ...baseProposal, id: "pending-buy", status: "Pending", amountDollars: 900, fulfilledAt: null },
  ];

  assert.doesNotThrow(() => assertCashAvailableForBuyProposal({ side: "BUY", amountDollars: 300 }, proposals, 1000));
  assert.throws(() => assertCashAvailableForBuyProposal({ side: "BUY", amountDollars: 301 }, proposals, 1000), /cash is available/);
  assert.doesNotThrow(() => assertCashAvailableForBuyProposal({ side: "SELL", amountDollars: 5000 }, proposals, 1000));
});

test("accepting a BUY cannot reserve more idle cash than available", () => {
  const current = { ...baseProposal, id: "new-buy", amountDollars: 400 };
  const proposals: AllocationProposal[] = [
    current,
    { ...baseProposal, id: "accepted-buy", status: "ApprovedForBrokerReview", amountDollars: 700, fulfilledAt: null },
  ];

  assert.doesNotThrow(() => assertCashAvailableForAcceptance(current, proposals, 1100));
  assert.throws(() => assertCashAvailableForAcceptance(current, proposals, 1000), /idle cash is available/);
});

test("approval attaches a verifiable decision signature when secret is set", () => {
  process.env.AUDIT_HMAC_SECRET = "test-secret";
  try {
    const approved = applyProposalDecision(baseProposal, "ApprovedForBrokerReview", "Looks good", "user_manager");
    assert.ok(approved.decisionHmac, "approval should be signed");
    assert.equal(approved.decisionHmac, computeDecisionSignature(approved, "test-secret"));
    // Tampering with any trade-relevant field must break the signature.
    const tampered = { ...approved, amountDollars: 9999 };
    assert.notEqual(approved.decisionHmac, computeDecisionSignature(tampered, "test-secret"));
  } finally {
    delete process.env.AUDIT_HMAC_SECRET;
  }
});

test("rejections stay unsigned", () => {
  process.env.AUDIT_HMAC_SECRET = "test-secret";
  try {
    const rejected = applyProposalDecision(baseProposal, "Rejected", "Not now", "user_manager");
    assert.equal(rejected.decisionHmac, null);
  } finally {
    delete process.env.AUDIT_HMAC_SECRET;
  }
});
