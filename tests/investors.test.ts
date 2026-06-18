import { test } from "node:test";
import assert from "node:assert/strict";
import { computeInvestorPosition, computeRoster } from "../lib/investors";
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
