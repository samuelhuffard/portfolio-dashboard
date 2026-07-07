import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInvestorLedgerEntry,
  calculateInvestorLedgerEntry,
  computeInvestorLedgerHmac,
  computeUnattributedCapital,
  defaultInvestorId,
  getInvestorLedgerSecret,
  investorLedgerRow,
} from "../lib/investor-ledger";

const secret = "test-secret";

// ── HMAC cross-check vs the backend implementation ──────────────────────────
// The canonical signer lives in portfolio-manager/lib/investor-ledger.js.
// This fixture vector was produced by running that exact backend code — the
// TypeScript port must reproduce it byte-for-byte, or rows the dashboard
// writes would fail any future verify pass done with the backend secret.

const FIXTURE_INPUT = {
  date: "2026-06-18",
  email: "Investor@Example.com",
  name: "Investor One",
  type: "Contribution" as const,
  amount: 250.5,
  navPerUnit: 1.1234,
  units: 222.98,
  investorId: "user_fixture",
  entryId: "entry_fixture_1",
};
const FIXTURE_SECRET = "fixture-secret";
const FIXTURE_BACKEND_HMAC = "85d98b948597b8d2f8a33b76ec8774d7d81d0eaf3e5656d68f0d4ec276819a0a";

test("HMAC matches the backend's known-good fixture vector", () => {
  const entry = buildInvestorLedgerEntry(FIXTURE_INPUT, FIXTURE_SECRET);
  assert.equal(entry.rowHmac, FIXTURE_BACKEND_HMAC);
  assert.equal(entry.email, "investor@example.com"); // normalized like the backend
  assert.equal(entry.rowHmac, computeInvestorLedgerHmac(entry, FIXTURE_SECRET));
});

test("HMAC and row layout match the live backend implementation when the sibling repo is present", async () => {
  const backendPath = fileURLToPath(new URL("../../portfolio-manager/lib/investor-ledger.js", import.meta.url));
  if (!existsSync(backendPath)) return; // fixture vector above still pins the contract
  const backend = await import(backendPath);
  const backendEntry = backend.buildInvestorLedgerEntry(FIXTURE_INPUT, FIXTURE_SECRET);
  const dashboardEntry = buildInvestorLedgerEntry(FIXTURE_INPUT, FIXTURE_SECRET);
  assert.equal(dashboardEntry.rowHmac, backendEntry.rowHmac);
  assert.deepEqual(investorLedgerRow(dashboardEntry), backend.investorLedgerRow(backendEntry));
});

test("row layout matches the Investors tab A:J columns exactly", () => {
  const entry = buildInvestorLedgerEntry(FIXTURE_INPUT, FIXTURE_SECRET);
  assert.deepEqual(investorLedgerRow(entry), [
    "2026-06-18",
    "investor@example.com",
    "Investor One",
    "Contribution",
    250.5,
    1.1234,
    222.98,
    "user_fixture",
    "entry_fixture_1",
    FIXTURE_BACKEND_HMAC,
  ]);
});

// ── Fail-closed signing ──────────────────────────────────────────────────────

test("getInvestorLedgerSecret fails closed with no secret — even with the backend's unsigned escape hatch set", () => {
  const prevLedger = process.env.INVESTOR_LEDGER_HMAC_SECRET;
  const prevAudit = process.env.AUDIT_HMAC_SECRET;
  const prevAllow = process.env.ALLOW_UNSIGNED_INVESTOR_LEDGER;
  delete process.env.INVESTOR_LEDGER_HMAC_SECRET;
  delete process.env.AUDIT_HMAC_SECRET;
  process.env.ALLOW_UNSIGNED_INVESTOR_LEDGER = "true"; // dashboard must ignore this
  try {
    assert.throws(() => getInvestorLedgerSecret(), /INVESTOR_LEDGER_HMAC_SECRET/);
  } finally {
    if (prevLedger !== undefined) process.env.INVESTOR_LEDGER_HMAC_SECRET = prevLedger;
    if (prevAudit !== undefined) process.env.AUDIT_HMAC_SECRET = prevAudit;
    if (prevAllow !== undefined) process.env.ALLOW_UNSIGNED_INVESTOR_LEDGER = prevAllow;
    else delete process.env.ALLOW_UNSIGNED_INVESTOR_LEDGER;
  }
});

test("getInvestorLedgerSecret trims the env value", () => {
  const prev = process.env.INVESTOR_LEDGER_HMAC_SECRET;
  process.env.INVESTOR_LEDGER_HMAC_SECRET = "  padded-secret \n";
  try {
    assert.equal(getInvestorLedgerSecret(), "padded-secret");
  } finally {
    if (prev !== undefined) process.env.INVESTOR_LEDGER_HMAC_SECRET = prev;
    else delete process.env.INVESTOR_LEDGER_HMAC_SECRET;
  }
});

test("computeInvestorLedgerHmac refuses an empty secret", () => {
  assert.throws(() => computeInvestorLedgerHmac({ ...FIXTURE_INPUT, email: "a@b.c" }, ""), /without a secret/);
});

// ── Units math + recording rules (mirrors backend tests/investor-ledger.test.js) ──

function seedLedger() {
  return [
    buildInvestorLedgerEntry(
      {
        date: "2026-06-18",
        email: "owner@example.com",
        name: "Owner",
        type: "Contribution",
        amount: 1000,
        navPerUnit: 1,
        units: 1000,
        investorId: "user_owner",
        entryId: "entry_1",
      },
      secret
    ),
  ];
}

test("units = amount / current NAV per unit from the latest Performance row", () => {
  const result = calculateInvestorLedgerEntry({
    agentId: "portfolio",
    ledger: seedLedger(),
    performanceHistory: [{ date: "2026-06-19", portfolioValue: 1250, navPerUnit: 1.25 }],
    email: "friend@example.com",
    name: "Friend",
    amount: 25,
    now: new Date("2026-06-19T16:00:00-04:00"),
    secret,
  });
  assert.equal(result.entry.units, 20); // 25 / 1.25
  assert.equal(result.entry.navPerUnit, 1.25);
  assert.equal(result.entry.type, "Contribution");
  assert.equal(result.unitsOutstandingAfter, 1020);
  assert.ok(Math.abs(result.ownershipPct - (20 / 1020) * 100) < 1e-9);
});

test("stale NAV is refused — contribution requires a Performance row dated today", () => {
  assert.throws(
    () =>
      calculateInvestorLedgerEntry({
        agentId: "portfolio",
        ledger: seedLedger(),
        performanceHistory: [{ date: "2026-06-18", portfolioValue: 1100, navPerUnit: 1.1 }],
        email: "friend@example.com",
        name: "Friend",
        amount: 100,
        now: new Date("2026-06-19T16:00:00-04:00"),
        secret,
      }),
    /Latest NAV is dated 2026-06-18.*holdings sync/
  );
});

test("an explicit navDate matching the latest Performance row is accepted", () => {
  const result = calculateInvestorLedgerEntry({
    agentId: "portfolio",
    ledger: seedLedger(),
    performanceHistory: [{ date: "2026-06-18", portfolioValue: 1100, navPerUnit: 1.1 }],
    email: "friend@example.com",
    name: "Friend",
    amount: 110,
    navDate: "2026-06-18",
    now: new Date("2026-06-19T16:00:00-04:00"),
    secret,
  });
  assert.equal(result.entry.units, 100);
});

test("a navDate that doesn't match the latest Performance row is refused", () => {
  const attempt = (allowStaleNav: boolean) =>
    calculateInvestorLedgerEntry({
      agentId: "portfolio",
      ledger: seedLedger(),
      performanceHistory: [{ date: "2026-06-18", portfolioValue: 1100, navPerUnit: 1.1 }],
      email: "friend@example.com",
      name: "Friend",
      amount: 110,
      navDate: "2026-06-15",
      allowStaleNav,
      now: new Date("2026-06-19T16:00:00-04:00"),
      secret,
    });
  // Same ordering as the backend: the stale check fires first…
  assert.throws(() => attempt(false), /Latest NAV is dated 2026-06-18, but this entry requires 2026-06-15/);
  // …and even bypassing it, a mismatched navDate is still refused.
  assert.throws(() => attempt(true), /Requested NAV date 2026-06-15/);
});

test("seed guard: first entry is blocked when the portfolio already holds value", () => {
  assert.throws(
    () =>
      calculateInvestorLedgerEntry({
        agentId: "portfolio",
        ledger: [],
        performanceHistory: [{ date: "2026-06-18", portfolioValue: 10000, navPerUnit: null }],
        email: "friend@example.com",
        name: "Friend",
        amount: 25,
        secret,
      }),
    /true owner/
  );
});

test("seed guard: explicit seed-owner confirmation seeds NAV at $1/unit", () => {
  const result = calculateInvestorLedgerEntry({
    agentId: "portfolio",
    ledger: [],
    performanceHistory: [{ date: "2026-06-18", portfolioValue: 10000, navPerUnit: null }],
    email: "sam@example.com",
    name: "Sam",
    amount: 10000,
    isSeedOwner: true,
    secret,
  });
  assert.equal(result.seeded, true);
  assert.equal(result.entry.navPerUnit, 1);
  assert.equal(result.entry.units, 10000);
  assert.equal(result.ownershipPct, 100);
});

test("existing-capital attribution uses contribution-basis NAV instead of inflated market NAV", () => {
  const result = calculateInvestorLedgerEntry({
    agentId: "portfolio",
    ledger: [
      buildInvestorLedgerEntry(
        {
          date: "2026-07-07",
          email: "owner@example.com",
          name: "Owner",
          type: "Contribution",
          amount: 25,
          navPerUnit: 1,
          units: 25,
          investorId: "user_owner",
          entryId: "entry_owner",
        },
        secret
      ),
    ],
    // Performance was written after only the owner's seed row, so market NAV is
    // 74.55 / 25 = 2.9819. Delayed attribution of starting capital must not use it.
    performanceHistory: [{ date: "2026-07-07", portfolioValue: 74.55, navPerUnit: 2.9819 }],
    email: "friend@example.com",
    name: "Friend",
    amount: 25,
    isExistingCapitalAttribution: true,
    existingCapitalNavPerUnit: 1,
    now: new Date("2026-07-07T16:00:00-04:00"),
    secret,
  });

  assert.equal(result.entry.navPerUnit, 1);
  assert.equal(result.entry.units, 25);
  assert.equal(result.unitsOutstandingAfter, 50);
  assert.equal(result.ownershipPct, 50);
});

test("withdrawals cannot exceed the investor's units", () => {
  assert.throws(
    () =>
      calculateInvestorLedgerEntry({
        agentId: "portfolio",
        ledger: seedLedger(),
        performanceHistory: [{ date: "2026-06-19", portfolioValue: 1000, navPerUnit: 1 }],
        email: "friend@example.com", // holds zero units
        name: "Friend",
        amount: 50,
        isWithdrawal: true,
        now: new Date("2026-06-19T16:00:00-04:00"),
        secret,
      }),
    /cannot withdraw/
  );
});

test("valid withdrawal burns units at current NAV", () => {
  const result = calculateInvestorLedgerEntry({
    agentId: "portfolio",
    ledger: seedLedger(),
    performanceHistory: [{ date: "2026-06-19", portfolioValue: 2000, navPerUnit: 2 }],
    email: "owner@example.com",
    name: "Owner",
    amount: 500,
    isWithdrawal: true,
    now: new Date("2026-06-19T16:00:00-04:00"),
    secret,
  });
  assert.equal(result.entry.type, "Withdrawal");
  assert.equal(result.entry.units, -250);
  assert.equal(result.unitsOutstandingAfter, 750);
});

test("entries carry the default email-based investor id when none is given", () => {
  const result = calculateInvestorLedgerEntry({
    agentId: "portfolio",
    ledger: [],
    performanceHistory: [],
    email: "New@Example.com",
    name: "New",
    amount: 100,
    isSeedOwner: true,
    secret,
  });
  assert.equal(result.entry.investorId, defaultInvestorId("new@example.com"));
  assert.ok(result.entry.entryId);
  assert.ok(result.entry.rowHmac);
});

// ── Unattributed-capital math ────────────────────────────────────────────────

test("unattributed capital = cash + cost basis - net ledger contributions", () => {
  const holdings = [{ costBasis: 500 }, { costBasis: 300 }, { costBasis: null }];
  const ledger = [
    { type: "Contribution", amount: 700 },
    { type: "Contribution", amount: 200 },
    { type: "Withdrawal", amount: 100 },
  ];
  const result = computeUnattributedCapital(holdings, 25, ledger);
  assert.equal(result.capitalIn, 825); // 25 cash + 800 cost basis
  assert.equal(result.netContributions, 800); // 900 - 100
  assert.equal(result.amount, 25);
  assert.equal(result.detected, true);
});

test("unattributed capital within the $1 rounding tolerance is not flagged", () => {
  const result = computeUnattributedCapital([{ costBasis: 1000.5 }], 0, [{ type: "Contribution", amount: 1000 }]);
  assert.equal(result.detected, false);
  const negative = computeUnattributedCapital([{ costBasis: 900 }], 0, [{ type: "Contribution", amount: 1000 }]);
  assert.equal(negative.detected, false); // market losses / withdrawn cash never prompt
});

test("market moves don't create unattributed capital (cost basis, not market value)", () => {
  // Fund doubled in value — ledger still balances because cost basis is unchanged.
  const result = computeUnattributedCapital([{ costBasis: 1000 }], 0, [{ type: "Contribution", amount: 1000 }]);
  assert.equal(result.amount, 0);
  assert.equal(result.detected, false);
});

// ── API permission wiring (same pattern as tests/proxy-routes.test.ts) ──────

test("contributions route enforces investors:manage + INVESTOR_CONTRIBUTION_RECORD server-side", () => {
  const source = readFileSync(new URL("../app/api/investors/contributions/route.ts", import.meta.url), "utf8");
  assert.match(source, /requireApiPermission/);
  assert.match(source, /permission:\s*"investors:manage"/);
  assert.match(source, /action:\s*"INVESTOR_CONTRIBUTION_RECORD"/);
  assert.match(source, /calculateInvestorLedgerEntry/); // rules enforced server-side
  assert.match(source, /getInvestorLedgerSecret/); // signing fails closed
  assert.doesNotMatch(source, /ALLOW_UNSIGNED/); // no unsigned escape hatch in the dashboard
});
