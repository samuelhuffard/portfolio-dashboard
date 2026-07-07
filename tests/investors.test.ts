import { test } from "node:test";
import assert from "node:assert/strict";
import { computeInvestorPosition, computeRoster, currentInvestorNav } from "../lib/investors";
import type { InvestorLedgerEntry } from "../lib/sheets";

const ledger: InvestorLedgerEntry[] = [
  {
    date: "2026-06-18",
    email: "old@example.com",
    name: "Client",
    type: "Contribution",
    amount: 1000,
    navPerUnit: 1,
    units: 1000,
    investorId: "user_client",
    entryId: "entry_1",
    rowHmac: "signed",
  },
  {
    date: "2026-06-19",
    email: "new@example.com",
    name: "Client",
    type: "Contribution",
    amount: 1000,
    navPerUnit: 2,
    units: 500,
    investorId: "user_client",
    entryId: "entry_2",
    rowHmac: "signed",
  },
];

test("computeInvestorPosition prefers stable investor id across email changes", () => {
  const position = computeInvestorPosition(ledger, { userId: "user_client", email: "new@example.com" }, 2, 1500);

  assert.equal(position?.investorId, "user_client");
  assert.equal(position?.contributed, 2000);
  assert.equal(position?.units, 1500);
  assert.equal(position?.value, 3000);
});

test("computeRoster groups rows by investor id instead of duplicate emails", () => {
  const roster = computeRoster(ledger, 2, 1500);

  assert.equal(roster.length, 1);
  assert.equal(roster[0].email, "old@example.com");
  assert.equal(roster[0].units, 1500);
});

test("currentInvestorNav derives NAV from current ledger units when Performance units are stale", () => {
  const sameDayLedger: InvestorLedgerEntry[] = [
    {
      date: "2026-07-07",
      email: "sam@example.com",
      name: "Sam",
      type: "Contribution",
      amount: 25,
      navPerUnit: 1,
      units: 25,
      investorId: "email:sam@example.com",
      entryId: "entry_1",
      rowHmac: "signed",
    },
    {
      date: "2026-07-07",
      email: "friend@example.com",
      name: "Friend",
      type: "Contribution",
      amount: 25,
      navPerUnit: 1,
      units: 25,
      investorId: "email:friend@example.com",
      entryId: "entry_2",
      rowHmac: "signed",
    },
  ];
  const staleNav = currentInvestorNav(
    [{ date: "2026-07-07", portfolioValue: 74.55, spyPrice: 746.49, unitsOutstanding: 25, navPerUnit: 2.9819 }],
    sameDayLedger
  );

  assert.equal(staleNav.unitsOutstanding, 50);
  assert.equal(staleNav.performanceUnitsStale, true);
  assert.equal(Number(staleNav.navPerUnit?.toFixed(4)), 1.491);
});
