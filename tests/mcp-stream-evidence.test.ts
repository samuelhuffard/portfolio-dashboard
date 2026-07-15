import test from "node:test";
import assert from "node:assert/strict";
import {
  assertScheduledMcpAccountBinding,
  extractMcpToolCalls,
} from "../scripts/mcp-stream-evidence.mjs";

function streamEvent(event: Record<string, unknown>) {
  return JSON.stringify({ type: "stream_event", event });
}

test("reconstructs account-bound MCP tool input from Claude stream JSON deltas", () => {
  const stream = [
    streamEvent({
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", name: "mcp__robinhood-trading__get_equity_positions", input: {} },
    }),
    streamEvent({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"account_' } }),
    streamEvent({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'number":"agentic-123"}' } }),
    streamEvent({ type: "content_block_stop", index: 1 }),
    streamEvent({
      type: "content_block_start",
      index: 2,
      content_block: { type: "tool_use", name: "mcp__robinhood-trading__get_portfolio", input: {} },
    }),
    streamEvent({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"account_number":"agentic-123"}' } }),
    streamEvent({ type: "content_block_stop", index: 2 }),
  ].join("\n");

  assert.deepEqual(extractMcpToolCalls(stream), [
    { name: "mcp__robinhood-trading__get_equity_positions", input: { account_number: "agentic-123" } },
    { name: "mcp__robinhood-trading__get_portfolio", input: { account_number: "agentic-123" } },
  ]);
  assert.doesNotThrow(() => assertScheduledMcpAccountBinding(stream, [
    "mcp__robinhood-trading__get_equity_positions",
    "mcp__robinhood-trading__get_portfolio",
  ], "agentic-123"));
});

test("accepts a fully materialized tool use but rejects absent or wrong-account evidence", () => {
  const materialized = JSON.stringify({
    type: "assistant",
    message: {
      content: [{
        type: "tool_use",
        name: "mcp__robinhood-trading__get_equity_orders",
        input: { account_number: "agentic-123" },
      }],
    },
  });
  assert.doesNotThrow(() => assertScheduledMcpAccountBinding(materialized, ["mcp__robinhood-trading__get_equity_orders"], "agentic-123"));
  assert.throws(() => assertScheduledMcpAccountBinding(materialized, ["mcp__robinhood-trading__get_equity_orders"], "different-account"), /without the configured Agentic/);
  assert.throws(() => assertScheduledMcpAccountBinding("{}", ["mcp__robinhood-trading__get_equity_orders"], "agentic-123"), /did not include required/);
});

test("does not treat malformed partial tool input as evidence", () => {
  const malformed = [
    streamEvent({
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", name: "mcp__robinhood-trading__get_equity_positions", input: {} },
    }),
    streamEvent({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"account_number":' } }),
    streamEvent({ type: "content_block_stop", index: 1 }),
  ].join("\n");

  assert.deepEqual(extractMcpToolCalls(malformed), []);
  assert.throws(() => assertScheduledMcpAccountBinding(malformed, ["mcp__robinhood-trading__get_equity_positions"], "agentic-123"), /did not include required/);
});
