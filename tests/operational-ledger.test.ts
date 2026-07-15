import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOperationalLedgerEntries,
  computeOperationalLedgerHmac,
  getOperationalLedgerVerificationSecrets,
} from "../lib/operational-ledger";

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

test("dashboard accepts the dedicated key and explicit legacy verification keys", () => {
  const previous = {
    dedicated: process.env.OPERATIONAL_LEDGER_HMAC_SECRET,
    legacy: process.env.OPERATIONAL_LEDGER_LEGACY_HMAC_SECRETS,
    investor: process.env.INVESTOR_LEDGER_HMAC_SECRET,
    audit: process.env.AUDIT_HMAC_SECRET,
  };
  try {
    process.env.OPERATIONAL_LEDGER_HMAC_SECRET = "current-operational-secret";
    process.env.OPERATIONAL_LEDGER_LEGACY_HMAC_SECRETS = " old-operational-secret, older-operational-secret ";
    process.env.INVESTOR_LEDGER_HMAC_SECRET = "investor-secret-must-not-be-implicit";
    process.env.AUDIT_HMAC_SECRET = "audit-secret-must-not-be-implicit";

    assert.deepEqual(getOperationalLedgerVerificationSecrets(), [
      "current-operational-secret",
      "old-operational-secret",
      "older-operational-secret",
    ]);
    const legacyRow = {
      ...performance,
      rowHmac: computeOperationalLedgerHmac("performance", performance, "old-operational-secret"),
    };
    assert.deepEqual(assertOperationalLedgerEntries("performance", [legacyRow]), [legacyRow]);
    const investorSigned = {
      ...performance,
      rowHmac: computeOperationalLedgerHmac("performance", performance, "investor-secret-must-not-be-implicit"),
    };
    assert.throws(() => assertOperationalLedgerEntries("performance", [investorSigned]), /1 mismatched/);
  } finally {
    for (const [key, value] of Object.entries({
      OPERATIONAL_LEDGER_HMAC_SECRET: previous.dedicated,
      OPERATIONAL_LEDGER_LEGACY_HMAC_SECRETS: previous.legacy,
      INVESTOR_LEDGER_HMAC_SECRET: previous.investor,
      AUDIT_HMAC_SECRET: previous.audit,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
