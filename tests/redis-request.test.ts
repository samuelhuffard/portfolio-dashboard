import assert from "node:assert/strict";
import test from "node:test";
import { fetchJsonWithTimeout } from "../scripts/redis-request.mjs";

test("Redis request deadline aborts a stalled response body", async () => {
  let signal: AbortSignal | undefined;
  const stalledBody = new Promise<never>((_resolve, reject) => {
    queueMicrotask(() => signal?.addEventListener("abort", () => reject(new Error("body aborted")), { once: true }));
  });
  const fetchImpl = async (_url: string, options: { signal: AbortSignal }) => {
    signal = options.signal;
    return { json: () => stalledBody };
  };

  await assert.rejects(
    fetchJsonWithTimeout(fetchImpl, "https://redis.example", {}, 5),
    /Redis request timed out after 5ms/
  );
  assert.equal(signal?.aborted, true);
});

test("Redis request deadline is cleared after a parsed response", async () => {
  let signal: AbortSignal | undefined;
  const fetchImpl = async (_url: string, options: { signal: AbortSignal }) => {
    signal = options.signal;
    return { json: async () => ({ result: "ok" }) };
  };

  const result = await fetchJsonWithTimeout(fetchImpl, "https://redis.example", {}, 5);
  assert.deepEqual(result.json, { result: "ok" });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(signal?.aborted, false);
});
