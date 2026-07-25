import assert from "node:assert/strict";
import test from "node:test";
import {
  filterByPeriod,
  relativeToBenchmark,
  summarizeSeries,
} from "../lib/command-stats";

const series = [
  { date: "2026-06-01", value: 100 }, // 53 days before the newest point
  { date: "2026-06-20", value: 101 }, // 34 days — outside 1M
  { date: "2026-07-05", value: 98 }, // 19 days — inside 1M
  { date: "2026-07-20", value: 99 },
  { date: "2026-07-24", value: 102 },
];

test("filterByPeriod measures the window from the newest point, not from today", () => {
  // Newest point is 2026-07-24, so 1W keeps only 07-20 and 07-24.
  const week = filterByPeriod(series, "1W");
  assert.deepEqual(
    week.map((p) => p.date),
    ["2026-07-20", "2026-07-24"],
  );
});

test("filterByPeriod 1M keeps 30 days back from the newest point and drops day 34", () => {
  const month = filterByPeriod(series, "1M");
  assert.deepEqual(
    month.map((p) => p.date),
    ["2026-07-05", "2026-07-20", "2026-07-24"],
  );
});

test("filterByPeriod YTD keeps the calendar year of the newest point", () => {
  const spanning = [{ date: "2025-12-30", value: 1 }, ...series];
  assert.deepEqual(
    filterByPeriod(spanning, "YTD").map((p) => p.date),
    ["2026-06-01", "2026-06-20", "2026-07-05", "2026-07-20", "2026-07-24"],
  );
});

test("filterByPeriod ALL returns the series untouched", () => {
  assert.equal(filterByPeriod(series, "ALL"), series);
});

test("summarizeSeries reports change, high, low and peak-to-trough drawdown", () => {
  const summary = summarizeSeries([100, 101, 99, 102]);
  assert.equal(summary.change, 2);
  assert.equal(summary.high, 102);
  assert.equal(summary.low, 99);
  // Peak 101 down to 99 is -1.980…%, the deepest fall in the window.
  assert.ok(summary.maxDrawdownPct !== null);
  assert.ok(Math.abs(summary.maxDrawdownPct + 1.9802) < 0.001);
});

test("summarizeSeries refuses to infer from fewer than two points", () => {
  assert.deepEqual(summarizeSeries([100]), {
    change: null,
    high: null,
    low: null,
    maxDrawdownPct: null,
  });
  assert.deepEqual(summarizeSeries([]), {
    change: null,
    high: null,
    low: null,
    maxDrawdownPct: null,
  });
});

test("summarizeSeries ignores non-finite points", () => {
  const summary = summarizeSeries([100, Number.NaN, 104]);
  assert.equal(summary.change, 4);
  assert.equal(summary.high, 104);
});

test("relativeToBenchmark returns the spread in percentage points", () => {
  // Portfolio +4 points, benchmark +3 points → +1 point of relative return.
  assert.equal(relativeToBenchmark([0, 4], [0, 3]), 1);
});

test("relativeToBenchmark is null when either series is too short", () => {
  assert.equal(relativeToBenchmark([0], [0, 3]), null);
  assert.equal(relativeToBenchmark([0, 4], []), null);
});
