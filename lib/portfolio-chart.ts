import type { PerformanceRow } from "./sheets";

type ValueSnapshot = Pick<PerformanceRow, "date" | "spyPrice"> & {
  portfolioValue?: PerformanceRow["portfolioValue"];
  unitsOutstanding?: PerformanceRow["unitsOutstanding"];
  navPerUnit?: PerformanceRow["navPerUnit"];
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

type UnitSnapshot = ValueSnapshot & {
  portfolioValue: number;
  unitsOutstanding: number;
  navPerUnit: number;
};

/**
 * A snapshot carrying *trustworthy* unit accounting. NAV per unit is
 * contribution-immune by construction — money in mints units and leaves NAV
 * untouched — so wherever it exists it is a strictly better return signal than
 * differencing balances against a ledger.
 *
 * But only where it reconciles. A NAV that disagrees with `value / units` is a
 * half-applied correction, not a valuation, and trusting one would hand the
 * whole curve to a number the sheet itself contradicts: a stale NAV of 2.5
 * against a $50.50 balance on 50 units would report an −80% collapse that never
 * happened. Rows that do not reconcile are treated as having no unit accounting
 * at all, which falls back to the signed cash-flow path.
 */
const NAV_RECONCILIATION_TOLERANCE = 0.005;

function hasUnitAccounting(snapshot: ValueSnapshot): snapshot is UnitSnapshot {
  const { unitsOutstanding, navPerUnit, portfolioValue } = snapshot;
  if (typeof unitsOutstanding !== "number" || !(unitsOutstanding > 0)) return false;
  if (typeof navPerUnit !== "number" || !(navPerUnit > 0)) return false;
  if (typeof portfolioValue !== "number" || !(portfolioValue > 0)) return false;

  const impliedNav = portfolioValue / unitsOutstanding;
  return Math.abs(impliedNav - navPerUnit) / navPerUnit <= NAV_RECONCILIATION_TOLERANCE;
}

/** Signed capital registered on or before `throughDate`. */
function totalFlowThrough(cashFlows: CashFlow[], throughDate: string): number {
  let total = 0;
  for (const flow of cashFlows) {
    if (!flow.date || !Number.isFinite(flow.amount) || flow.amount === 0) continue;
    if (flow.date <= throughDate) total += flow.amount;
  }
  return total;
}

/**
 * Return path for a history with no unit accounting at all: every signed flow is
 * removed from the interval it lands in before that interval's market return is
 * measured, so funding the account never reads as a gain.
 *
 * This is only valid when the investor ledger records *incremental* cash by the
 * date it arrived. Once unit accounting exists the ledger may instead re-register
 * pre-existing capital at a rebased NAV, and `buildUnitReturnPath` takes over.
 */
function buildCashFlowReturnPath(
  snapshots: Array<ValueSnapshot & { portfolioValue: number }>,
  cashFlows: CashFlow[],
): ReturnPoint[] {
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

/**
 * Return path anchored on NAV per unit, spliced onto the pre-unit history.
 *
 * From the anchor onward the ledger is not consulted at all: NAV per unit
 * already excludes contributions, so a deposit that mints units leaves the curve
 * flat no matter what date the ledger stamped on it.
 *
 * Before the anchor there is no NAV, and the ledger cannot be differenced either
 * — when unit accounting is switched on it re-registers the *whole* account at a
 * rebased NAV, so its entries on the anchor date include capital that had been
 * sitting in the account for weeks. Differencing them is what made a $50 seed
 * plus a $25 deposit read as a +50% gain. Instead the pre-unit era is reconciled
 * as a whole: capital registered at the anchor minus the opening balance is the
 * net capital that entered, and it is removed from the one interval whose
 * balance actually stepped by that amount.
 *
 * That single attribution is the only inference in this file, so it is bounded:
 * it must match a real step within tolerance, and when it does not the pre-unit
 * history is dropped rather than drawn wrong. A chart that starts later is a far
 * smaller error than one that invents a return.
 */
function buildUnitReturnPath(
  snapshots: Array<ValueSnapshot & { portfolioValue: number }>,
  anchorIndex: number,
  cashFlows: CashFlow[],
): ReturnPoint[] {
  const anchor = snapshots[anchorIndex] as UnitSnapshot;
  const anchorNav = anchor.navPerUnit;

  // Capital the ledger says was on the books once units existed, versus what the
  // account opened with. With no ledger there is nothing to reconcile against,
  // so treat the pre-unit capital base as unchanged.
  const registeredCapital = totalFlowThrough(cashFlows, anchor.date);
  const openingCapital = snapshots[0].portfolioValue;
  const unexplained = registeredCapital > 0 ? registeredCapital - openingCapital : 0;

  // Which pre-anchor interval absorbed that capital? Only a balance step of the
  // right size can answer; anything else would be a guess dressed as a fact.
  let flowIndex = -1;
  if (Math.abs(unexplained) > 0.005) {
    let bestError = Infinity;
    for (let index = 1; index <= anchorIndex; index += 1) {
      const step = snapshots[index].portfolioValue - snapshots[index - 1].portfolioValue;
      const error = Math.abs(step - unexplained);
      if (error < bestError) {
        bestError = error;
        flowIndex = index;
      }
    }
    const tolerance = Math.max(Math.abs(unexplained) * 0.02, 0.5);
    if (bestError > tolerance) flowIndex = -1;
  }

  // Unreconcilable pre-unit history is refused, not approximated.
  const preUnitIsSound = Math.abs(unexplained) <= 0.005 || flowIndex !== -1;
  const points: ReturnPoint[] = [];
  let factor = 1;

  if (preUnitIsSound) {
    points.push({ date: snapshots[0].date, factor, spyPrice: snapshots[0].spyPrice });
    for (let index = 1; index <= anchorIndex; index += 1) {
      const previous = snapshots[index - 1];
      const current = snapshots[index];
      const flow = index === flowIndex ? unexplained : 0;
      const marketFactor = (current.portfolioValue - flow) / previous.portfolioValue;
      if (Number.isFinite(marketFactor) && marketFactor > 0) factor *= marketFactor;
      points.push({ date: current.date, factor, spyPrice: current.spyPrice });
    }
  } else {
    points.push({ date: anchor.date, factor, spyPrice: anchor.spyPrice });
  }

  // From here NAV carries the whole return. A row that lost its unit accounting
  // holds the curve flat rather than reintroducing a balance-driven step.
  const anchorFactor = factor;
  let lastNav = anchorNav;
  for (let index = anchorIndex + 1; index < snapshots.length; index += 1) {
    const current = snapshots[index];
    if (hasUnitAccounting(current)) lastNav = current.navPerUnit;
    points.push({
      date: current.date,
      factor: anchorFactor * (lastNav / anchorNav),
      spyPrice: current.spyPrice,
    });
  }

  return points;
}

/**
 * Performance rows are account-equity snapshots. Returns come from NAV per unit
 * wherever unit accounting exists, and from signed investor-ledger cash flows
 * before it does — never from guessing at movement size, except for the one
 * bounded, tolerance-checked reconciliation documented on `buildUnitReturnPath`.
 */
function buildReturnPath(performance: ValueSnapshot[], cashFlows: CashFlow[] = []): ReturnPoint[] {
  const snapshots = validValueSnapshots(performance);
  if (snapshots.length === 0) return [];

  const anchorIndex = snapshots.findIndex(hasUnitAccounting);
  return anchorIndex === -1
    ? buildCashFlowReturnPath(snapshots, cashFlows)
    : buildUnitReturnPath(snapshots, anchorIndex, cashFlows);
}

export interface ReturnSeriesPoint {
  date: string;
  Portfolio: number;
}

/**
 * Cumulative investment return, in percent, since the first snapshot.
 *
 * This is the honest way to show performance in the presence of deposits:
 * contributions mint units and leave NAV untouched, so funding the account from
 * $50 to $75 to $100 produces no step at all — only the market's own movement
 * remains. Unlike `buildAdjustedValueSeries` it makes no dollar claim,
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
 * This is the only series that answers "what did the account actually hold?".
 * `buildAdjustedValueSeries` rebases history onto today's value, so it shows a
 * flat line for an account that was funded from $50 to $100 — true as a return
 * statement, false as a balance. Deposits belong here as real steps; a dollar
 * axis labelled as a balance must never claim a figure the account never held.
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

/**
 * Where to put the hard colour break in a vertical `objectBoundingBox` gradient
 * so it lands exactly on `threshold`.
 *
 * The offset must be a fraction of the *painted path's own* bounding box, which
 * is what SVG's default `gradientUnits` measures — not a fraction of the axis
 * domain. Measuring against the padded domain instead put the break wherever the
 * padding happened to fall, and whenever the threshold sat at the series min or
 * max (the growth chart's baseline is the window's opening value, so it often
 * does) the offset landed outside 0–1 and the entire series rendered in one
 * colour.
 *
 * Both the stroke and the fill are covered by this one figure. The stroke's box
 * is the series extent; the fill's box also includes the threshold, because the
 * area is drawn with `baseValue={threshold}`. They agree wherever the series
 * actually crosses, and where it does not the clamp resolves both to a single
 * correct colour.
 */
export function seriesGradientOffset(values: number[], threshold: number): number {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return 1;

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max === min) return max >= threshold ? 1 : 0;

  return Math.min(1, Math.max(0, (max - threshold) / (max - min)));
}

export function paddedReturnDomain(values: number[], minAbs = 5): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [-minAbs, minAbs];

  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const pad = Math.max((max - min) * 0.18, 0.5);

  return [Math.min(min - pad, -minAbs), Math.max(max + pad, minAbs)];
}
