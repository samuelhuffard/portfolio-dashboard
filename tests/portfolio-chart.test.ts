import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNavComparison, paddedReturnDomain } from "../lib/portfolio-chart";
import type { PerformanceRow } from "../lib/sheets";

test("buildNavComparison rebases after investor-ledger accounting discontinuities", () => {
  const performance: PerformanceRow[] = [
    { date: "2026-07-07", portfolioValue: 74.55, spyPrice: 746.49, unitsOutstanding: 25, navPerUnit: 2.9819 },
    { date: "2026-07-07", portfolioValue: 74.55, spyPrice: 746.49, unitsOutstanding: 75, navPerUnit: 0.994 },
    { date: "2026-07-08", portfolioValue: 75.43, spyPrice: 745.36, unitsOutstanding: 75, navPerUnit: 1.0057 },
    { date: "2026-07-09", portfolioValue: 75.42, spyPrice: 747.33, unitsOutstanding: 75, navPerUnit: 1.0056 },
  ];

  const comparison = buildNavComparison(performance);

  assert.equal(comparison.length, 3);
  assert.equal(Number(comparison[0].Portfolio.toFixed(4)), 0);
  assert.equal(Number(comparison.at(-1)?.Portfolio.toFixed(4)), 1.167);
  assert.equal(Number(comparison.at(-1)?.["S&P 500"].toFixed(4)), 0.1125);
});

test("buildNavComparison does not rebase normal contributions when NAV stays continuous", () => {
  const performance: PerformanceRow[] = [
    { date: "2026-07-10", portfolioValue: 100, spyPrice: 500, unitsOutstanding: 100, navPerUnit: 1 },
    { date: "2026-07-11", portfolioValue: 151.5, spyPrice: 505, unitsOutstanding: 150, navPerUnit: 1.01 },
    { date: "2026-07-12", portfolioValue: 154.5, spyPrice: 510, unitsOutstanding: 150, navPerUnit: 1.03 },
  ];

  const comparison = buildNavComparison(performance);

  assert.equal(comparison.length, 3);
  assert.equal(Number(comparison[0].Portfolio.toFixed(4)), 0);
  assert.equal(Number(comparison.at(-1)?.Portfolio.toFixed(4)), 3);
  assert.equal(Number(comparison.at(-1)?.["S&P 500"].toFixed(4)), 2);
});

test("paddedReturnDomain keeps small return differences visually proportional", () => {
  assert.deepEqual(paddedReturnDomain([0, 1.167, 0.1125]), [-5, 5]);
});

test("paddedReturnDomain expands for larger return ranges while keeping zero visible", () => {
  const domain = paddedReturnDomain([-8, 18]);

  assert.equal(domain[0], -12.68);
  assert.equal(domain[1], 22.68);
});
