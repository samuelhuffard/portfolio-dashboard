import type { PerformanceRow } from "./sheets";

const ACCOUNTING_BREAK_NAV_MOVE = 0.15;
const ACCOUNTING_BREAK_UNIT_MOVE = 0.05;

interface ValidNavRow extends PerformanceRow {
  spyPrice: number;
  unitsOutstanding: number | null;
  navPerUnit: number;
}

export interface NavComparisonPoint {
  date: string;
  Portfolio: number;
  "S&P 500": number;
  spread: number;
}

export function paddedReturnDomain(values: number[], minAbs = 5): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [-minAbs, minAbs];

  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const pad = Math.max((max - min) * 0.18, 0.5);

  return [Math.min(min - pad, -minAbs), Math.max(max + pad, minAbs)];
}

function validNavRows(performance: PerformanceRow[]): ValidNavRow[] {
  return performance.filter(
    (p): p is ValidNavRow =>
      p.navPerUnit !== null &&
      p.navPerUnit > 0 &&
      p.spyPrice !== null &&
      p.spyPrice > 0
  );
}

function isAccountingBreak(previous: ValidNavRow, current: ValidNavRow): boolean {
  if (!previous.unitsOutstanding || !current.unitsOutstanding) return false;

  const navMove = Math.abs(current.navPerUnit / previous.navPerUnit - 1);
  const unitMove = Math.abs(current.unitsOutstanding / previous.unitsOutstanding - 1);

  return navMove >= ACCOUNTING_BREAK_NAV_MOVE && unitMove >= ACCOUNTING_BREAK_UNIT_MOVE;
}

function latestContinuousNavSegment(rows: ValidNavRow[]): ValidNavRow[] {
  let start = 0;
  for (let i = 1; i < rows.length; i += 1) {
    if (isAccountingBreak(rows[i - 1], rows[i])) start = i;
  }
  return rows.slice(start);
}

/**
 * Deposit-proof benchmark comparison: converts NAV per unit (not raw portfolio
 * value) and SPY to percentage returns from the same base row. If historical
 * investor-ledger fixes caused a unit/NAV
 * discontinuity, rebase after the latest discontinuity so accounting cleanup is
 * not shown as market underperformance. Normal future deposits should not reset
 * the chart because they issue units at the current NAV and keep NAV continuous.
 */
export function buildNavComparison(performance: PerformanceRow[]): NavComparisonPoint[] {
  const valid = latestContinuousNavSegment(validNavRows(performance));
  if (valid.length === 0) return [];

  const baseNav = valid[0].navPerUnit;
  const baseSpy = valid[0].spyPrice;

  return valid.map((p) => {
    const portfolio = (p.navPerUnit / baseNav - 1) * 100;
    const spy = (p.spyPrice / baseSpy - 1) * 100;
    return {
      date: p.date,
      Portfolio: portfolio,
      "S&P 500": spy,
      spread: portfolio - spy,
    };
  });
}
