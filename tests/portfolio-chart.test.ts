import { test } from "node:test";
import assert from "node:assert/strict";
import { buildActualValueSeries, buildAdjustedValueSeries, buildReturnSeries, buildPerformanceComparison, paddedReturnDomain } from "../lib/portfolio-chart";
import type { PerformanceRow } from "../lib/sheets";

test("cash-flow-adjusted value uses signed deposits and ends at the actual account value", () => {
  // Mirrors the real account shape: $50, a $25 addition, then another $25
  // addition. NAV/unit correction rows must not influence this calculation.
  const performance: PerformanceRow[] = [
    { date: "2026-07-01", portfolioValue: 50, spyPrice: 746, unitsOutstanding: null, navPerUnit: null },
    { date: "2026-07-02", portfolioValue: 49.72, spyPrice: 744, unitsOutstanding: null, navPerUnit: null },
    { date: "2026-07-06", portfolioValue: 74.69, spyPrice: 749, unitsOutstanding: null, navPerUnit: null },
    { date: "2026-07-12", portfolioValue: 75.91, spyPrice: 755, unitsOutstanding: 75, navPerUnit: 1.0121 },
    { date: "2026-07-13", portfolioValue: 100.48, spyPrice: 750, unitsOutstanding: 75, navPerUnit: 1.3397 },
    { date: "2026-07-13", portfolioValue: 100.39, spyPrice: 749, unitsOutstanding: 99.7011, navPerUnit: 1.0069 },
  ];

  const series = buildAdjustedValueSeries(performance, [
    { date: "2026-07-06", amount: 25 },
    { date: "2026-07-13", amount: 25 },
  ]);
  const values = series.map((point) => Number(point.Value.toFixed(2)));

  assert.equal(values.at(-1), 100.39);
  assert.ok(Math.max(...values) - Math.min(...values) < 2, `unexpected cash-flow spike: ${values.join(", ")}`);
  assert.ok(!values.some((value) => value > 120));
});

test("SPY comparison uses signed cash flows, not unstable NAV corrections", () => {
  const performance: PerformanceRow[] = [
    { date: "2026-07-10", portfolioValue: 50, spyPrice: 500, unitsOutstanding: null, navPerUnit: null },
    { date: "2026-07-11", portfolioValue: 50.5, spyPrice: 505, unitsOutstanding: 50, navPerUnit: 2.5 },
    { date: "2026-07-12", portfolioValue: 100, spyPrice: 510, unitsOutstanding: 100, navPerUnit: 0.5 },
  ];

  const comparison = buildPerformanceComparison(performance, [{ date: "2026-07-12", amount: 50 }]);

  assert.equal(comparison.length, 3);
  assert.equal(comparison[0].Portfolio, 0);
  // $50 of the $100 close was a contribution. The remaining $50 was a small
  // loss from the prior $50.50 close, which offsets the first day's gain.
  assert.equal(Number(comparison.at(-1)?.Portfolio.toFixed(4)), 0);
  assert.equal(Number(comparison.at(-1)?.["S&P 500"].toFixed(4)), 2);
});

test("a genuine large market move is retained when no signed cash flow exists", () => {
  const performance: PerformanceRow[] = [
    { date: "2026-07-10", portfolioValue: 100, spyPrice: 500, unitsOutstanding: null, navPerUnit: null },
    { date: "2026-07-11", portfolioValue: 125, spyPrice: 505, unitsOutstanding: null, navPerUnit: null },
  ];
  const comparison = buildPerformanceComparison(performance);

  assert.equal(comparison.at(-1)?.Portfolio, 25);
});

test("performance snapshots are calculated chronologically and duplicate dates use the final correction", () => {
  const performance: PerformanceRow[] = [
    { date: "2026-07-12", portfolioValue: 120, spyPrice: 510, unitsOutstanding: null, navPerUnit: null },
    { date: "2026-07-10", portfolioValue: 100, spyPrice: 500, unitsOutstanding: null, navPerUnit: null },
    { date: "2026-07-11", portfolioValue: 110, spyPrice: 505, unitsOutstanding: null, navPerUnit: null },
    { date: "2026-07-12", portfolioValue: 121, spyPrice: 510, unitsOutstanding: null, navPerUnit: null },
  ];
  const comparison = buildPerformanceComparison(performance);

  assert.deepEqual(comparison.map((point) => point.date), ["2026-07-10", "2026-07-11", "2026-07-12"]);
  assert.equal(Number(comparison.at(-1)?.Portfolio.toFixed(2)), 21);
});

test("paddedReturnDomain keeps small return differences visually proportional", () => {
  assert.deepEqual(paddedReturnDomain([0, 1.167, 0.1125]), [-5, 5]);
});

test("paddedReturnDomain expands for larger return ranges while keeping zero visible", () => {
  const domain = paddedReturnDomain([-8, 18]);

  assert.equal(domain[0], -12.68);
  assert.equal(domain[1], 22.68);
});

// ─── Dollar axis must never invent a balance ────────────────────────────────

test("actual value series reports the recorded balance, never a rebased one", () => {
  // 12 Jun the account held $100. A $100 deposit lands on 24 Jul, taking it to
  // $200. The rebasing path restates the opening balance as $200 — "as if
  // today's capital had always been here" — which is a legitimate *return*
  // view but a false *balance* history. The dollar axis must show the record.
  const performance = [
    { date: "2026-06-12", portfolioValue: 100, spyPrice: null },
    { date: "2026-07-24", portfolioValue: 200, spyPrice: null },
  ];
  const flows = [{ date: "2026-07-24", amount: 100 }];

  assert.deepEqual(buildActualValueSeries(performance), [
    { date: "2026-06-12", Value: 100 },
    { date: "2026-07-24", Value: 200 },
  ]);

  const rebased = buildAdjustedValueSeries(performance, flows);
  assert.equal(rebased[0].Value, 200, "rebasing inflates the opening balance by the deposit");
  assert.equal(buildActualValueSeries(performance)[0].Value, 100);
});

test("without a recorded cash flow the two series agree", () => {
  // Worth pinning: the distortion comes from rebasing a *recorded* flow, not
  // from a missing one. With no flows the rebased curve is the balance curve.
  const performance = [
    { date: "2026-06-12", portfolioValue: 100, spyPrice: null },
    { date: "2026-07-24", portfolioValue: 200, spyPrice: null },
  ];
  assert.deepEqual(buildAdjustedValueSeries(performance, []), buildActualValueSeries(performance));
});

test("actual value series drops non-positive and undated snapshots", () => {
  const series = buildActualValueSeries([
    { date: "2026-06-12", portfolioValue: 0, spyPrice: null },
    { date: "2026-06-13", portfolioValue: null, spyPrice: null },
    { date: "2026-06-14", portfolioValue: 100, spyPrice: null },
  ]);
  assert.deepEqual(series, [{ date: "2026-06-14", Value: 100 }]);
});

test("actual value series uses the final correction for a duplicated date", () => {
  const series = buildActualValueSeries([
    { date: "2026-06-12", portfolioValue: 90, spyPrice: null },
    { date: "2026-06-12", portfolioValue: 100, spyPrice: null },
  ]);
  assert.deepEqual(series, [{ date: "2026-06-12", Value: 100 }]);
});

// ─── Benchmark continuity ───────────────────────────────────────────────────

test("SPY comparison carries the last known close forward across gaps", () => {
  const comparison = buildPerformanceComparison(
    [
      { date: "2026-06-12", portfolioValue: 100, spyPrice: 500 },
      { date: "2026-06-13", portfolioValue: 110, spyPrice: null },
      { date: "2026-06-14", portfolioValue: 120, spyPrice: 550 },
    ],
    [],
  );

  // Every portfolio point is kept, not just the two with an SPY close.
  assert.equal(comparison.length, 3);
  assert.deepEqual(comparison.map((p) => p.date), ["2026-06-12", "2026-06-13", "2026-06-14"]);
  // The gap day holds the previous close, so the benchmark is flat, not absent.
  assert.equal(comparison[1]["S&P 500"], 0);
  assert.ok(Math.abs(comparison[2]["S&P 500"] - 10) < 1e-9);
  assert.ok(Math.abs(comparison[2].Portfolio - 20) < 1e-9);
  assert.ok(Math.abs(comparison[2].spread - 10) < 1e-9);
});

test("SPY comparison still returns nothing when no close is ever recorded", () => {
  const comparison = buildPerformanceComparison(
    [
      { date: "2026-06-12", portfolioValue: 100, spyPrice: null },
      { date: "2026-06-13", portfolioValue: 110, spyPrice: null },
    ],
    [],
  );
  assert.deepEqual(comparison, []);
});

// ─── Return series: deposits must not read as performance ───────────────────

test("return series shows no step when the account is funded", () => {
  // Funded $50 -> $75 -> $100 with no market movement at all. A balance chart
  // shows two large steps; performance is flat, which is the truth.
  const performance = [
    { date: "2026-06-01", portfolioValue: 50, spyPrice: null },
    { date: "2026-06-02", portfolioValue: 75, spyPrice: null },
    { date: "2026-06-03", portfolioValue: 100, spyPrice: null },
  ];
  const flows = [
    { date: "2026-06-02", amount: 25 },
    { date: "2026-06-03", amount: 25 },
  ];

  const series = buildReturnSeries(performance, flows);
  assert.deepEqual(series.map((p) => p.date), ["2026-06-01", "2026-06-02", "2026-06-03"]);
  for (const point of series) {
    assert.ok(Math.abs(point.Portfolio) < 1e-9, `${point.date} should be flat, got ${point.Portfolio}`);
  }
});

test("return series still reports genuine market movement", () => {
  // $50 funded to $75, then the market takes it to $90: +20% on the interval.
  const series = buildReturnSeries(
    [
      { date: "2026-06-01", portfolioValue: 50, spyPrice: null },
      { date: "2026-06-02", portfolioValue: 75, spyPrice: null },
      { date: "2026-06-03", portfolioValue: 90, spyPrice: null },
    ],
    [{ date: "2026-06-02", amount: 25 }],
  );
  assert.ok(Math.abs(series[1].Portfolio) < 1e-9);
  assert.ok(Math.abs(series[2].Portfolio - 20) < 1e-9);
});

test("return series starts at zero and needs no SPY history", () => {
  const series = buildReturnSeries(
    [
      { date: "2026-06-01", portfolioValue: 100, spyPrice: null },
      { date: "2026-06-02", portfolioValue: 110, spyPrice: null },
    ],
    [],
  );
  assert.equal(series[0].Portfolio, 0);
  assert.ok(Math.abs(series[1].Portfolio - 10) < 1e-9);
});
