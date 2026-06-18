import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRedLines } from "../lib/red-lines";

test("Client writes are blocked", () => {
  const result = checkRedLines({
    role: "Client",
    method: "POST",
    route: "/api/strategy",
    bodyText: JSON.stringify({ notes: "new mandate" }),
  });
  assert.equal(result?.id, "no_client_writes");
});

test("Explicit trade execution wording is blocked", () => {
  const result = checkRedLines({
    role: "FundManager",
    method: "POST",
    route: "/api/agents/agent-1/chat",
    bodyText: "Please execute an order for 100 shares of MSFT.",
  });
  assert.equal(result?.id, "no_trade_execution");
});

test("Research-only analysis wording is allowed", () => {
  const result = checkRedLines({
    role: "FundManager",
    method: "POST",
    route: "/api/research",
    bodyText: "Analyze the risks and valuation setup for MSFT.",
  });
  assert.equal(result, null);
});

test("Approval proposal payloads are allowed when they do not claim execution", () => {
  const result = checkRedLines({
    role: "FundManager",
    method: "POST",
    route: "/api/proposals",
    bodyText: JSON.stringify({
      agentId: "agent-1",
      ticker: "VTI",
      side: "BUY",
      amountDollars: 2500,
      rationale: "Increase core ETF exposure after review.",
    }),
  });
  assert.equal(result, null);
});

test("Execution-shaped API routes remain blocked", () => {
  const result = checkRedLines({
    role: "FundManager",
    method: "POST",
    route: "/api/orders",
    bodyText: JSON.stringify({ ticker: "VTI" }),
  });
  assert.equal(result?.id, "no_trade_execution");
});

test("Non-manager AI generation is blocked", () => {
  const result = checkRedLines({
    role: "Client",
    method: "POST",
    route: "/api/research",
    bodyText: JSON.stringify({ ticker: "MSFT" }),
  });
  assert.equal(result?.id, "no_client_writes");
});
