import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdjustedValueSeries, buildPerformanceComparison, paddedReturnDomain } from "../lib/portfolio-chart";
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
