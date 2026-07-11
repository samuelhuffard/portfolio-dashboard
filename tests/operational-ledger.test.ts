import test from "node:test";
import assert from "node:assert/strict";
import { assertOperationalLedgerEntries, computeOperationalLedgerHmac } from "../lib/operational-ledger";

const secret = "test-operational-secret";
const performance = { date: "2026-07-10", portfolioValue: 1234.56, spyPrice: 650.1, unitsOutstanding: 1000, navPerUnit: 1.2346 };

test("dashboard verifies backend-compatible operational signatures", () => {
  const rowHmac = computeOperationalLedgerHmac("performance", performance, secret);
  assert.deepEqual(assertOperationalLedgerEntries("performance", [{ ...performance, rowHmac }], secret), [{ ...performance, rowHmac }]);
});

test("dashboard rejects unsigned and modified operational rows", () => {
  assert.throws(() => assertOperationalLedgerEntries("performance", [performance], secret), /1 unsigned/);
  const signed = { ...performance, rowHmac: computeOperationalLedgerHmac("performance", performance, secret) };
  assert.throws(() => assertOperationalLedgerEntries("performance", [{ ...signed, portfolioValue: 1 }], secret), /1 mismatched/);
});
