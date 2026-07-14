import test from "node:test";
import assert from "node:assert/strict";
import { readResearchDataHealth } from "../lib/research-data-health";

function healthResponse(status: number, body: unknown) {
  return async () => new Response(JSON.stringify(body), { status });
}

test("research-data health keeps an enabled completed workflow from a 200 payload", async () => {
  const result = await readResearchDataHealth({
    backendUrl: "https://backend.example/",
    fetchImpl: healthResponse(200, { researchDataEnabled: true, researchData: { state: "completed", cataloged: 100, selectionMode: "shadow" }, shadowSelection: { mode: "shadow", policyVersion: "research-selection-v1", overlapCount: 2, reasonCodeCounts: { filing_change: 1 } } }) as typeof fetch,
  });
  assert.equal(result.availability, "available");
  assert.equal(result.researchDataEnabled, true);
  assert.equal(result.researchData?.state, "completed");
  assert.equal(result.shadowSelection?.mode, "shadow");
  assert.equal(result.shadowSelection?.reasonCodeCounts?.filing_change, 1);
});

test("research-data health preserves a failed workflow from a valid 503 health payload", async () => {
  const result = await readResearchDataHealth({
    backendUrl: "https://backend.example",
    fetchImpl: healthResponse(503, { researchDataEnabled: true, researchData: { state: "failed", failureStage: "mandate-scoring" } }) as typeof fetch,
  });
  assert.equal(result.availability, "available");
  assert.equal(result.researchDataEnabled, true);
  assert.equal(result.researchData?.state, "failed");
  assert.equal(result.shadowSelection, null);
});

test("research-data health reports intentionally disabled separately from backend availability", async () => {
  const result = await readResearchDataHealth({
    backendUrl: "https://backend.example",
    fetchImpl: healthResponse(200, { researchDataEnabled: false, researchData: { state: "disabled" } }) as typeof fetch,
  });
  assert.equal(result.availability, "available");
  assert.equal(result.researchDataEnabled, false);
  assert.equal(result.researchData?.state, "disabled");
});

test("research-data health reports absent or unreachable backend as unavailable, never disabled", async () => {
  const absent = await readResearchDataHealth({ backendUrl: "" });
  assert.deepEqual(absent, { availability: "unavailable", unavailableReason: "not-configured", researchData: null, researchDataEnabled: false, shadowSelection: null });
  const offline = await readResearchDataHealth({
    backendUrl: "https://backend.example",
    fetchImpl: (async () => { throw new Error("offline"); }) as typeof fetch,
  });
  assert.equal(offline.availability, "unavailable");
  assert.equal(offline.unavailableReason, "request-failed");
  assert.equal(offline.researchDataEnabled, false);
  assert.equal(offline.shadowSelection, null);
});
