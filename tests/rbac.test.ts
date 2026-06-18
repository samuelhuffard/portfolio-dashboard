import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccess, resolvePortfolioRole } from "../lib/rbac";

const managerEmails = ["manager@example.com", "second@example.com"];

test("canAccess grants FundManager the full control surface", () => {
  assert.equal(canAccess("FundManager", "portfolio:read"), true);
  assert.equal(canAccess("FundManager", "portfolio:full"), true);
  assert.equal(canAccess("FundManager", "signals:read"), true);
  assert.equal(canAccess("FundManager", "strategy:write"), true);
  assert.equal(canAccess("FundManager", "research:run"), true);
  assert.equal(canAccess("FundManager", "reports:export"), true);
  assert.equal(canAccess("FundManager", "audit:read"), true);
});

test("canAccess limits Client to read-only portfolio and signal permissions", () => {
  assert.equal(canAccess("Client", "portfolio:read"), true);
  assert.equal(canAccess("Client", "portfolio:full"), false);
  assert.equal(canAccess("Client", "signals:read"), true);
  assert.equal(canAccess("Client", "strategy:write"), false);
  assert.equal(canAccess("Client", "research:run"), false);
  assert.equal(canAccess("Client", "reports:export"), false);
});

test("canAccess fails closed for unknown or missing roles", () => {
  assert.equal(canAccess(null, "portfolio:read"), false);
  assert.equal(canAccess(null, "portfolio:full"), false);
  assert.equal(canAccess(undefined, "portfolio:read"), false);
  assert.equal(canAccess("Admin" as never, "portfolio:read"), false);
});

test("resolvePortfolioRole accepts manager metadata only with allowlisted email", () => {
  assert.equal(
    resolvePortfolioRole({
      metadataRole: "FundManager",
      email: "Manager@Example.com",
      fundManagerEmails: managerEmails,
    }),
    "FundManager",
  );
  assert.equal(
    resolvePortfolioRole({
      metadataRole: "FundManager",
      email: "intruder@example.com",
      fundManagerEmails: managerEmails,
    }),
    null,
  );
});

test("resolvePortfolioRole does not auto-promote allowlisted emails without Clerk metadata", () => {
  assert.equal(
    resolvePortfolioRole({
      metadataRole: undefined,
      email: "manager@example.com",
      fundManagerEmails: managerEmails,
    }),
    null,
  );
});

test("resolvePortfolioRole accepts Client metadata without manager allowlist", () => {
  assert.equal(
    resolvePortfolioRole({
      metadataRole: "Client",
      email: "client@example.com",
      fundManagerEmails: managerEmails,
    }),
    "Client",
  );
});
