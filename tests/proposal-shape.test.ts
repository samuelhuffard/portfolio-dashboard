import { test } from "node:test";
import assert from "node:assert/strict";
import { ProposalSchema } from "../lib/contracts/proposal.js";
import type { AllocationProposal } from "../lib/proposals";

// 2a drift guard: the TS AllocationProposal interface (used across the dashboard)
// and the canonical Zod ProposalSchema (used by the backend + companion) must
// describe the exact same field set. The historical drift bugs here were field
// NAME mismatches across repos (fulfilledTradeId vs fulfilledOrderId) — this test
// makes adding/removing/renaming a field in one place without the other fail.
//
// TS enforces that `sample` has exactly the interface's fields (excess/missing
// property checks on a typed literal); the assertion ties that set to the schema.

const sample: AllocationProposal = {
  id: "p_1",
  agentId: "agent-1",
  ticker: "NVDA",
  side: "BUY",
  amountDollars: 500,
  maxPrice: null,
  proposalContractVersion: 2,
  sellOwnerShareLimit: null,
  rationale: "rationale text long enough",
  riskSummary: "risk",
  buyDossier: {
    version: 1,
    businessType: "Technology",
    thesis: "A sufficiently detailed, evidence-backed thesis for the human review surface.",
    returnMechanism: "A verified earnings improvement could support value creation over the stated horizon.",
    valuation: {
      method: "Forward-EPS scenario using supplied facts",
      downsidePrice: 80,
      basePrice: 100,
      upsidePrice: 120,
      assumptions: "The scenario uses supplied current-price and earnings inputs rather than a forecast.",
      evidenceIds: ["raw_current_price"],
    },
    bearCase: "Demand could weaken enough to prevent the expected earnings improvement.",
    killCriteria: ["Exit if the next two reported quarters show declining revenue year over year."],
    horizon: "12 to 24 months",
    sizingRationale: "A small initial weight preserves room for error while the thesis is tested.",
    evidence: [{ claim: "A sufficiently detailed, evidence-backed thesis for the human review surface.", evidenceIds: ["raw_current_price"] }],
    owner: { agentId: "agent-1", label: "Short-Term High-Velocity" },
  },
  sellDossier: {
    version: 1,
    exitTrigger: "The evidence-backed exit trigger requires reducing the owned position.",
    urgency: "routine",
    remainingThesis: "Some parts of the earlier thesis remain intact.",
    stayInvestedIf: "Fresh reported evidence restored the breached operating assumption.",
    killCriteria: ["Exit if the next two reported quarters show declining revenue year over year."],
    evidence: [{ claim: "The evidence-backed exit trigger requires reducing the owned position.", evidenceIds: ["raw_current_price"] }],
    owner: { agentId: "agent-1", label: "Short-Term High-Velocity" },
    positionScope: "Only verified specialist-owned lots, up to 10 shares.",
  },
  status: "Pending",
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  expiresAt: "2026-07-13T00:00:00.000Z",
  createdByUserId: "u",
  createdByEmail: null,
  decidedAt: null,
  decidedByUserId: null,
  decisionNote: null,
  fulfilledAt: null,
  fulfilledOrderId: null,
  fulfilledShares: null,
  executionFailedAt: null,
  executionFailureReason: null,
  decisionHmac: null,
};

test("AllocationProposal and ProposalSchema share the exact same field set", () => {
  const interfaceKeys = Object.keys(sample).sort();
  const schemaKeys = Object.keys(ProposalSchema.shape).sort();
  assert.deepEqual(schemaKeys, interfaceKeys);
});

test("a valid AllocationProposal passes ProposalSchema.parse", () => {
  assert.doesNotThrow(() => ProposalSchema.parse(sample));
});
