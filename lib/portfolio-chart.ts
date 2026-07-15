import type { PerformanceRow } from "./sheets";

const CASH_FLOW_MIN_DOLLARS = 10;
const CASH_FLOW_MIN_PERCENT = 0.15;

type ValueSnapshot = Pick<PerformanceRow, "date" | "spyPrice"> & {
  portfolioValue?: PerformanceRow["portfolioValue"];
};

export interface AdjustedValuePoint {
  date: string;
  Value: number;
}

export interface PerformanceComparisonPoint {
  date: string;
  Portfolio: number;
  "S&P 500": number;
  spread: number;
}

interface ReturnPoint {
  date: string;
  factor: number;
  spyPrice: number | null;
}

function validValueSnapshots(performance: ValueSnapshot[]): Array<ValueSnapshot & { portfolioValue: number }> {
  return performance.filter(
    (row): row is ValueSnapshot & { portfolioValue: number } =>
      row.portfolioValue !== null && row.portfolioValue !== undefined && row.portfolioValue > 0,
  );
}

/**
 * Performance rows are snapshots of account equity. A material change between
 * two snapshots that is too large to plausibly be market movement is treated
 * as a deposit or withdrawal, never investment return. This deliberately
 * avoids NAV/unit because the historical ledger contains correction rows that
 * can rewrite NAV without changing the underlying Robinhood account value.
 */
function buildReturnPath(performance: ValueSnapshot[]): ReturnPoint[] {
  const snapshots = validValueSnapshots(performance);
  if (snapshots.length === 0) return [];

  let factor = 1;
  const points: ReturnPoint[] = [{
    date: snapshots[0].date,
    factor,
    spyPrice: snapshots[0].spyPrice,
  }];

  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    const change = current.portfolioValue - previous.portfolioValue;
    const cashFlowThreshold = Math.max(CASH_FLOW_MIN_DOLLARS, previous.portfolioValue * CASH_FLOW_MIN_PERCENT);
    const isCashFlow = Math.abs(change) >= cashFlowThreshold;
    const marketFactor = isCashFlow
      ? 1
      : current.portfolioValue / previous.portfolioValue;

    // Fail closed on a malformed snapshot instead of allowing it to invert or
    // explode the entire performance history.
    if (Number.isFinite(marketFactor) && marketFactor > 0) factor *= marketFactor;

    points.push({
      date: current.date,
      factor,
      spyPrice: current.spyPrice,
    });
  }

  return points;
}

/**
 * Robinhood-style account-value curve. It preserves the investment return
 * path while scaling every historical point to today's account value, so a
 * deposit reads as capital that was present all along rather than a spike.
 */
export function buildAdjustedValueSeries(performance: ValueSnapshot[]): AdjustedValuePoint[] {
  const snapshots = validValueSnapshots(performance);
  const path = buildReturnPath(snapshots);
  if (path.length === 0) return [];

  const latestValue = snapshots.at(-1)?.portfolioValue;
  const latestFactor = path.at(-1)?.factor;
  if (!latestValue || !latestFactor) return [];

  const scale = latestValue / latestFactor;
  return path.map((point) => ({ date: point.date, Value: point.factor * scale }));
}

/**
 * Cash-flow-adjusted portfolio return against SPY. Both lines use the same
 * first snapshot that has an SPY price, so the comparison remains continuous
 * even when investor accounting is corrected later.
 */
export function buildPerformanceComparison(performance: ValueSnapshot[]): PerformanceComparisonPoint[] {
  const path = buildReturnPath(performance);
  const baseIndex = path.findIndex((point) => point.spyPrice !== null && point.spyPrice > 0);
  if (baseIndex === -1) return [];

  const baseFactor = path[baseIndex].factor;
  const baseSpy = path[baseIndex].spyPrice as number;
  return path.slice(baseIndex)
    .filter((point): point is ReturnPoint & { spyPrice: number } => point.spyPrice !== null && point.spyPrice > 0)
    .map((point) => {
      const portfolio = (point.factor / baseFactor - 1) * 100;
      const spy = (point.spyPrice / baseSpy - 1) * 100;
      return {
        date: point.date,
        Portfolio: portfolio,
        "S&P 500": spy,
        spread: portfolio - spy,
      };
    });
}

export function paddedReturnDomain(values: number[], minAbs = 5): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [-minAbs, minAbs];

  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const pad = Math.max((max - min) * 0.18, 0.5);

  return [Math.min(min - pad, -minAbs), Math.max(max + pad, minAbs)];
}
