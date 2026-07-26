import { test } from "node:test";
import assert from "node:assert/strict";
import { shadowProposalLifecycle } from "../lib/proposal-shadow";

const proposal = {
  id: "p-1",
  agentId: "agent-1",
  ticker: "NVDA",
  side: "BUY" as const,
  amountDollars: 100,
  maxPrice: null,
  rationale: "A sufficiently detailed specialist rationale.",
  riskSummary: "Bounded risk.",
  status: "Pending" as const,
  createdAt: "2026-07-11T12:00:00.000Z",
  updatedAt: "2026-07-11T12:00:00.000Z",
  expiresAt: "2026-07-13T12:00:00.000Z",
  createdByUserId: "u-1",
  createdByEmail: null,
  decidedAt: null,
  decidedByUserId: null,
  decisionNote: null,
  fulfilledAt: null,
  fulfilledOrderId: null,
  fulfilledShares: null,
  decisionHmac: null,
};

test("proposal shadow skips safely when backend configuration is absent", async () => {
  assert.deepEqual(await shadowProposalLifecycle(proposal, { backendUrl: "", secret: "" }), { ok: false, skipped: true });
});

test("proposal shadow posts the full lifecycle object after authoritative writes", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  const result = await shadowProposalLifecycle(proposal, {
    backendUrl: "https://backend.example/",
    secret: "test-secret",
    fetchImpl: (async (url, init) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body);
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(capturedUrl, "https://backend.example/shadow/proposal");
  assert.deepEqual(JSON.parse(capturedBody), { proposal });
});

test("proposal shadow failure never throws into the authoritative path", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await shadowProposalLifecycle(proposal, {
      backendUrl: "https://backend.example",
      secret: "test-secret",
      fetchImpl: (async () => { throw new Error("offline"); }) as typeof fetch,
    });
    assert.deepEqual(result, { ok: false });
  } finally {
    console.warn = originalWarn;
  }
});

test("proposal shadow retries one transient failure before reporting success", async () => {
  let calls = 0;
  const result = await shadowProposalLifecycle(proposal, {
    backendUrl: "https://backend.example",
    secret: "test-secret",
    retryDelayMs: 0,
    fetchImpl: (async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient connection failure");
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});
