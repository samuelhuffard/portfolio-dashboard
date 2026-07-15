import { test } from "node:test";
import assert from "node:assert/strict";
import { isAgentMemoryCategory } from "../lib/agentMemory";

test("agent memory categories accept only the two durable routing classes", () => {
  assert.equal(isAgentMemoryCategory("investment"), true);
  assert.equal(isAgentMemoryCategory("workflow"), true);
  assert.equal(isAgentMemoryCategory("approval"), false);
  assert.equal(isAgentMemoryCategory(undefined), false);
});
