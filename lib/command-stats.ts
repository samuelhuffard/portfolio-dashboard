/**
 * Pure helpers behind the Command screen's period control and the stat strip
 * under the portfolio-value chart.
 *
 * Every figure here is derived from the verified series the API returns. When a
 * window holds fewer than two points nothing is inferred — the caller renders an
 * em-dash rather than a zero.
 */

export const CHART_PERIODS = ["1W", "1M", "YTD", "ALL"] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];

/** Days of history each window keeps. YTD and ALL are handled separately. */
const PERIOD_DAYS: Record<Exclude<ChartPeriod, "YTD" | "ALL">, number> = {
  "1W": 7,
  "1M": 30,
};

function parseDate(value: string): number {
  return Date.parse(value);
}

/**
 * Trims a dated series to the requested window, measured back from the newest
 * point in the data (not from today) so a stale feed still renders its own tail
 * instead of collapsing to nothing.
 */
export function filterByPeriod<T extends { date: string }>(series: T[], period: ChartPeriod): T[] {
  if (period === "ALL" || series.length === 0) return series;

  const timestamps = series.map((point) => parseDate(point.date)).filter((t) => Number.isFinite(t));
  if (timestamps.length === 0) return series;
  const newest = Math.max(...timestamps);

  if (period === "YTD") {
    const startOfYear = Date.UTC(new Date(newest).getUTCFullYear(), 0, 1);
    return series.filter((point) => {
      const t = parseDate(point.date);
      return !Number.isFinite(t) || t >= startOfYear;
    });
  }

  const cutoff = newest - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
  return series.filter((point) => {
    const t = parseDate(point.date);
    return !Number.isFinite(t) || t >= cutoff;
  });
}

export interface SeriesSummary {
  /** Last value minus first value across the window. */
  change: number | null;
  high: number | null;
  low: number | null;
  /** Largest peak-to-trough fall inside the window, as a negative percentage. */
  maxDrawdownPct: number | null;
}

const EMPTY_SUMMARY: SeriesSummary = { change: null, high: null, low: null, maxDrawdownPct: null };

export function summarizeSeries(values: number[]): SeriesSummary {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length < 2) return EMPTY_SUMMARY;

  let peak = usable[0];
  let maxDrawdownPct = 0;
  for (const value of usable) {
    if (value > peak) peak = value;
    if (peak > 0) {
      const drawdown = ((value - peak) / peak) * 100;
      if (drawdown < maxDrawdownPct) maxDrawdownPct = drawdown;
    }
  }

  return {
    change: usable[usable.length - 1] - usable[0],
    high: Math.max(...usable),
    low: Math.min(...usable),
    maxDrawdownPct,
  };
}

/**
 * Portfolio return minus benchmark return across the window, in percentage
 * points. Returns null unless both series have two comparable points.
 */
export function relativeToBenchmark(
  portfolio: number[],
  benchmark: number[],
): number | null {
  const p = portfolio.filter((value) => Number.isFinite(value));
  const b = benchmark.filter((value) => Number.isFinite(value));
  if (p.length < 2 || b.length < 2) return null;
  return p[p.length - 1] - p[0] - (b[b.length - 1] - b[0]);
}
