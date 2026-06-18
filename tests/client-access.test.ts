import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIENT_DEFAULT_ROUTE, routeAllowed } from "../lib/client-access";

test("Clients land on their own investment view", () => {
  assert.equal(CLIENT_DEFAULT_ROUTE, "/investors");
});

test("Clients cannot access pooled portfolio pages", () => {
  assert.equal(routeAllowed("Client", "/"), false);
  assert.equal(routeAllowed("Client", "/holdings"), false);
});

test("Clients can access scoped account and curated signal pages", () => {
  assert.equal(routeAllowed("Client", "/investors"), true);
  assert.equal(routeAllowed("Client", "/recommendations"), true);
  assert.equal(routeAllowed("Client", "/news"), true);
});

test("FundManagers can access the full dashboard", () => {
  assert.equal(routeAllowed("FundManager", "/"), true);
  assert.equal(routeAllowed("FundManager", "/holdings"), true);
  assert.equal(routeAllowed("FundManager", "/agents/agent-1"), true);
});
