import { test } from "node:test";
import assert from "node:assert/strict";
import { shadowCapitalEntry } from "../lib/capital-shadow";

const entry = {
  date: "2026-07-13",
  email: "investor@example.com",
  name: "Investor",
  type: "Contribution",
  amount: 25,
  navPerUnit: 1.0121,
  units: 24.7011,
  investorId: "user_123",
  entryId: "capital-entry-test-0001",
  rowHmac: "a".repeat(64),
};

test("capital shadow skips when authenticated backend configuration is absent", async () => {
  assert.deepEqual(await shadowCapitalEntry(entry, { backendUrl: "", secret: "" }), { ok: false, skipped: true });
});

test("capital shadow posts the complete immutable signed entry", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  const result = await shadowCapitalEntry(entry, {
    backendUrl: "https://backend.example/",
    secret: "test-secret",
    fetchImpl: (async (url, init) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch,
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(capturedUrl, "https://backend.example/shadow/capital-entry");
  assert.deepEqual(JSON.parse(capturedBody), { entry });
});

test("capital shadow reports a failed projection without throwing into the Sheets write path", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await shadowCapitalEntry(entry, {
      backendUrl: "https://backend.example",
      secret: "test-secret",
      fetchImpl: (async () => new Response(JSON.stringify({ ok: false }), { status: 503 })) as typeof fetch,
    });
    assert.deepEqual(result, { ok: false });
  } finally {
    console.warn = originalWarn;
  }
});
