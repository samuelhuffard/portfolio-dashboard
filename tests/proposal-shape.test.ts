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
  rationale: "rationale text long enough",
  riskSummary: "risk",
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
