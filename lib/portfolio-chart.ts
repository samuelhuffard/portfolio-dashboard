import type { PerformanceRow } from "./sheets";

type ValueSnapshot = Pick<PerformanceRow, "date" | "spyPrice"> & {
  portfolioValue?: PerformanceRow["portfolioValue"];
};

export interface CashFlow {
  date: string;
  amount: number;
}

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
  // The sheet is append-only, so accounting corrections can arrive after newer
  // rows. Use the final snapshot for each date and then calculate in calendar
  // order; compounding in sheet order is not a valid return calculation.
  const latestByDate = new Map<string, ValueSnapshot & { portfolioValue: number }>();
  for (const row of performance) {
    if (row.portfolioValue !== null && row.portfolioValue !== undefined && row.portfolioValue > 0) {
      latestByDate.set(row.date, row as ValueSnapshot & { portfolioValue: number });
    }
  }
  return [...latestByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function cashFlowTotals(cashFlows: CashFlow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const flow of cashFlows) {
    if (!flow.date || !Number.isFinite(flow.amount) || flow.amount === 0) continue;
    totals.set(flow.date, (totals.get(flow.date) ?? 0) + flow.amount);
  }
  return totals;
}

/**
 * Performance rows are account-equity snapshots. Returns are adjusted only by
 * signed investor-ledger cash flows, never by guessing from movement size. A
 * cash flow dated on a closing snapshot is removed before measuring that
 * interval's market return.
 */
function buildReturnPath(performance: ValueSnapshot[], cashFlows: CashFlow[] = []): ReturnPoint[] {
  const snapshots = validValueSnapshots(performance);
  if (snapshots.length === 0) return [];
  const flowsByDate = cashFlowTotals(cashFlows);

  let factor = 1;
  const points: ReturnPoint[] = [{
    date: snapshots[0].date,
    factor,
    spyPrice: snapshots[0].spyPrice,
  }];

  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    const cashFlow = flowsByDate.get(current.date) ?? 0;
    const marketFactor = (current.portfolioValue - cashFlow) / previous.portfolioValue;

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
export function buildAdjustedValueSeries(performance: ValueSnapshot[], cashFlows: CashFlow[] = []): AdjustedValuePoint[] {
  const snapshots = validValueSnapshots(performance);
  const path = buildReturnPath(snapshots, cashFlows);
  if (path.length === 0) return [];

  const latestValue = snapshots.at(-1)?.portfolioValue;
  const latestFactor = path.at(-1)?.factor;
  if (!latestValue || !latestFactor) return [];

  const scale = latestValue / latestFactor;
  return path.map((point) => ({ date: point.date, Value: point.factor * scale }));
}

/**
 * Cash-flow-adjusted portfolio return against SPY price return. Both lines use the same
 * first snapshot that has an SPY price, so the comparison remains continuous
 * even when investor accounting is corrected later.
 */
export function buildPerformanceComparison(performance: ValueSnapshot[], cashFlows: CashFlow[] = []): PerformanceComparisonPoint[] {
  const path = buildReturnPath(performance, cashFlows);
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
