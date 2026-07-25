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

/**
 * Net cash flow landing in the interval `(afterDate, throughDate]`.
 *
 * Flows are matched to the interval they fall in, not to an exact snapshot
 * date. Exact-date matching silently mis-stated performance whenever a deposit
 * landed on a day the sheet has no row for — a weekend, a holiday, or any gap
 * in the series — because the money then had no interval to be removed from and
 * was compounded as market return instead. A $50 account funded to $75 that way
 * reads as a 50% gain.
 *
 * ISO dates compare correctly as strings.
 */
function netFlowInInterval(cashFlows: CashFlow[], afterDate: string, throughDate: string): number {
  let total = 0;
  for (const flow of cashFlows) {
    if (!flow.date || !Number.isFinite(flow.amount) || flow.amount === 0) continue;
    if (flow.date > afterDate && flow.date <= throughDate) total += flow.amount;
  }
  return total;
}

/**
 * Performance rows are account-equity snapshots. Returns are adjusted only by
 * signed investor-ledger cash flows, never by guessing from movement size.
 * Every flow is removed from the interval it lands in before that interval's
 * market return is measured, so funding the account never reads as a gain.
 */
function buildReturnPath(performance: ValueSnapshot[], cashFlows: CashFlow[] = []): ReturnPoint[] {
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
    const cashFlow = netFlowInInterval(cashFlows, previous.date, current.date);
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

export interface ReturnSeriesPoint {
  date: string;
  Portfolio: number;
}

/**
 * Cumulative investment return, in percent, since the first snapshot.
 *
 * This is the honest way to show performance in the presence of deposits: the
 * contribution is removed from the interval it lands in, so funding the account
 * from $50 to $75 to $100 produces no step at all — only the market's own
 * movement remains. Unlike `buildAdjustedValueSeries` it makes no dollar claim,
 * so it cannot restate a balance the account never held, and unlike
 * `buildPerformanceComparison` it does not require any SPY close to exist.
 */
export function buildReturnSeries(
  performance: ValueSnapshot[],
  cashFlows: CashFlow[] = [],
): ReturnSeriesPoint[] {
  const path = buildReturnPath(performance, cashFlows);
  if (path.length === 0) return [];
  const baseFactor = path[0].factor;
  return path.map((point) => ({
    date: point.date,
    Portfolio: (point.factor / baseFactor - 1) * 100,
  }));
}

/**
 * The account value actually recorded on each snapshot date — no rebasing, no
 * inference. This is what the chart's balance view plots.
 *
 * Prefer this over `buildAdjustedValueSeries` for anything denominated in
 * dollars. The adjusted series rebases history onto today's value, so any cash
 * flow the ledger did not match to a snapshot date is absorbed as market return
 * and silently redraws the past: a single unmatched $34 deposit is enough to
 * make a $100 account appear to have started at $66. A dollar axis must never
 * claim a balance the account never held.
 */
export function buildActualValueSeries(performance: ValueSnapshot[]): AdjustedValuePoint[] {
  return validValueSnapshots(performance).map((snapshot) => ({
    date: snapshot.date,
    Value: snapshot.portfolioValue,
  }));
}

/**
 * Return-path curve rebased onto today's account value, so a deposit reads as
 * capital that was present all along rather than as a spike.
 *
 * This is a *return* visualisation, not a balance history — see the warning on
 * `buildActualValueSeries`. Only use it on a normalised axis.
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

  // The sheet does not always carry an SPY close on every row. Dropping those
  // rows outright discarded most of the portfolio's own history and could leave
  // too few points to draw. Carry the last known close forward instead — a
  // stale benchmark quote is a far smaller error than a missing comparison, and
  // it keeps both series on the same dates.
  let lastSpy: number | null = null;
  const filled = path.map((point) => {
    if (point.spyPrice !== null && point.spyPrice > 0) lastSpy = point.spyPrice;
    return { ...point, spyPrice: lastSpy };
  });

  const baseIndex = filled.findIndex((point) => point.spyPrice !== null);
  if (baseIndex === -1) return [];

  const baseFactor = filled[baseIndex].factor;
  const baseSpy = filled[baseIndex].spyPrice as number;
  return filled.slice(baseIndex).map((point) => {
    const portfolio = (point.factor / baseFactor - 1) * 100;
    const spy = ((point.spyPrice as number) / baseSpy - 1) * 100;
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
