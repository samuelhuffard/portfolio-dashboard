import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeObservationWindow,
  validateUpdateText,
  verdictLabel,
  verdictTone,
  type Phase0DayRecord,
} from "../lib/observation-shared";

function day(dateET: string, overrides: Partial<Phase0DayRecord> = {}): Phase0DayRecord {
  return { dateET, verdict: "PASS_BOTH", countsTowardSafetyWindow: true, ...overrides };
}

test("consecutive count walks back from the newest trading day and stops at the first failure", () => {
  const days = [
    day("2026-07-20"),
    day("2026-07-19", { verdict: "SKIP", countsTowardSafetyWindow: false }),
    day("2026-07-18", { verdict: "SKIP", countsTowardSafetyWindow: false }),
    day("2026-07-17", { verdict: "TRUST_PASS_SKILL_FAIL" }),
    day("2026-07-16", { verdict: "FAIL_BOTH", countsTowardSafetyWindow: false }),
    day("2026-07-15"),
  ];
  const window = summarizeObservationWindow(days);
  assert.equal(window.consecutiveCleanDays, 2); // 07-20 and 07-17; weekend SKIPs ignored; 07-16 breaks the streak
  assert.equal(window.recordedTradingDays, 4);
  assert.equal(window.latestDate, "2026-07-20");
});

test("a failing most-recent day reports zero regardless of earlier clean days", () => {
  const days = [
    day("2026-07-16", { verdict: "FAIL_BOTH", countsTowardSafetyWindow: false }),
    day("2026-07-15"),
    day("2026-07-14"),
  ];
  const window = summarizeObservationWindow(days);
  assert.equal(window.consecutiveCleanDays, 0);
  assert.match(window.headline, /0 of 10/);
});

test("missing countsTowardSafetyWindow is never treated as clean", () => {
  const days = [day("2026-07-15", { countsTowardSafetyWindow: undefined })];
  assert.equal(summarizeObservationWindow(days).consecutiveCleanDays, 0);
});

test("throughput sums actionable proposals and approvals across trading days only", () => {
  const days = [
    day("2026-07-16", { skillProgress: { actionableProposals: 2, confirmedEvaluatorApprovals: 1 } }),
    day("2026-07-15", { verdict: "SKIP", skillProgress: { actionableProposals: 99, confirmedEvaluatorApprovals: 99 } }),
    day("2026-07-14", { verdict: "FAIL_BOTH", countsTowardSafetyWindow: false, skillProgress: { actionableProposals: 1 } }),
  ];
  const window = summarizeObservationWindow(days);
  assert.equal(window.actionableProposals, 3);
  assert.equal(window.evaluatorApprovals, 1);
});

test("empty history produces a plain-English zero state", () => {
  const window = summarizeObservationWindow([]);
  assert.equal(window.consecutiveCleanDays, 0);
  assert.match(window.headline, /No trading-day observations recorded yet/);
});

test("every verdict maps to a plain-English label and unknown verdicts stay non-counting", () => {
  assert.match(verdictLabel({ verdict: "PASS_BOTH" }), /Clean day/);
  assert.match(verdictLabel({ verdict: "TRUST_PASS_SKILL_FAIL" }), /day counts/);
  assert.match(verdictLabel({ verdict: "FAIL_BOTH" }), /does not count/);
  assert.match(verdictLabel({ verdict: "SKIP" }), /Not a trading day/);
  assert.match(verdictLabel({ verdict: "SOMETHING_NEW" }), /treat as not counting/i);
  assert.equal(verdictTone({ verdict: "PASS_BOTH" }), "good");
  assert.equal(verdictTone({ verdict: "TRUST_PASS_SKILL_FAIL" }), "warn");
  assert.equal(verdictTone({ verdict: "FAIL_BOTH" }), "bad");
  assert.equal(verdictTone({ verdict: "SKIP" }), "muted");
});

test("update text is trimmed, control characters are stripped, and bounds are enforced", () => {
  assert.equal(validateUpdateText("  Day 2 clean.\r\nParity matched. "), "Day 2 clean.\nParity matched.");
  assert.equal(validateUpdateText("a\u0000b\u0007c"), "a b c");
  assert.throws(() => validateUpdateText("   "), /required/);
  assert.throws(() => validateUpdateText("x".repeat(2001)), /at most 2000/);
  assert.equal(validateUpdateText("x".repeat(2000)).length, 2000);
});
