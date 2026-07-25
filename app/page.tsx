'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AllocationBar,
  DefRow,
  Footnote,
  Hatch,
  Metric,
  MetricStrip,
  Nil,
  Panel,
  PanelHead,
  RailBlock,
  ScreenGrid,
  Segmented,
} from '@/components/chrome';
import { usePortfolio } from '@/components/PortfolioProvider';
import {
  CHART_PERIODS,
  filterByPeriod,
  relativeToBenchmark,
  summarizeSeries,
  type ChartPeriod,
} from '@/lib/command-stats';

const CHART_VIEWS = ['Normalized', 'Return', 'Balance'] as const;
type ChartView = (typeof CHART_VIEWS)[number];
import { fmtCurrency, fmtNumber, fmtPercent, gainLossColor, gainLossSoftColor, gainLossTone } from '@/lib/format';
import {
  buildActualValueSeries,
  buildAdjustedValueSeries,
  buildPerformanceComparison,
  buildReturnSeries,
} from '@/lib/portfolio-chart';
import type { Holding, PerformanceRow } from '@/lib/sheets';

/* Chart colours are the literals the handoff specifies. */
const AXIS_TICK = { fontSize: 10.5, fill: '#9a9c96', fontFamily: '"IBM Plex Mono", ui-monospace, monospace' };
const TOOLTIP_STYLE = {
  background: '#fff',
  border: '1px solid #dcddd9',
  borderRadius: 0,
  color: '#191b1f',
  fontSize: 12,
};

function fmtAxisDollar(v: number): string {
  if (Math.abs(v) >= 10_000) return `$${(v / 1000).toFixed(1)}k`;
  if (Math.abs(v) >= 100) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

function paddedDomain(values: number[], padRatio = 0.18, minPad = 1): [number, number] {
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * padRatio, minPad);
  return [min - pad, max + pad];
}

/** A figure, or an em-dash when the value is not on the verified record. */
function Figure({ value, tone }: { value: string; tone?: 'pos' | 'neg' | 'warn' }) {
  if (value === '—') return <Nil />;
  const color =
    tone === 'pos'
      ? 'var(--pos)'
      : tone === 'neg'
        ? 'var(--neg)'
        : tone === 'warn'
          ? 'var(--warn)'
          : 'var(--ink)';
  return <span style={{ color }}>{value}</span>;
}

export default function CommandPage() {
  const { data, error, loading } = usePortfolio();
  const [period, setPeriod] = useState<ChartPeriod>('1M');
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [view, setView] = useState<ChartView>('Normalized');

  const totals = data?.totals ?? null;
  const cash = data?.cash ?? null;
  const holdings = data?.holdings ?? [];

  const comparison = data ? buildPerformanceComparison(data.performance, data.cashFlows) : [];
  const hasBenchmarkData = comparison.length >= 2;
  // Return is the default: contributions are removed from the interval they
  // land in, so funding the account leaves no step and only market movement
  // shows. Balance plots the recorded dollar value, where deposits are real
  // steps and dwarf the performance they sit beside.
  const returns = data ? buildReturnSeries(data.performance, data.cashFlows) : [];
  // Normalized restates every point in today's capital, so a deposit is a level
  // shift of the whole history rather than a step in it — the curve then moves
  // only with the market, while still ending on the real balance.
  const normalized = data ? buildAdjustedValueSeries(data.performance, data.cashFlows) : [];
  const growth = data ? buildActualValueSeries(data.performance) : [];

  const windowed = filterByPeriod(growth, period);
  const windowedComparison = filterByPeriod(comparison, period);
  // A line needs two points. Fall back to the value series when the benchmark
  // view has too few points in this window, otherwise the chart would render a
  // comparison series that cannot draw anything.
  const windowedReturns = filterByPeriod(returns, period);
  const isReturnView = view === 'Return';
  const benchmarkView =
    isReturnView && showBenchmark && hasBenchmarkData && windowedComparison.length >= 2;
  const windowedNormalized = filterByPeriod(normalized, period);
  const plotted = benchmarkView
    ? windowedComparison
    : isReturnView
      ? windowedReturns
      : view === 'Normalized'
        ? windowedNormalized
        : windowed;

  // Stats describe whichever axis is on screen. Drawdown in particular must be
  // measured on the return series: computed from balances it would count a
  // deposit-driven rise as a peak and report a fictitious fall afterwards.
  const summary = summarizeSeries(
    isReturnView
      ? windowedReturns.map((p) => p.Portfolio)
      : (plotted as Array<{ Value: number }>).map((p) => p.Value),
  );
  // A lone record is shown as a point, since a single point has no line.
  const soloDot = plotted.length === 1 ? { r: 2.75, fill: '#1f4b76', strokeWidth: 0 } : false as const;
  const vsBenchmark = hasBenchmarkData
    ? relativeToBenchmark(
        windowedComparison.map((p) => p.Portfolio),
        windowedComparison.map((p) => p['S&P 500']),
      )
    : null;

  const investedRatio = totals?.totalValue ? (totals.totalMarketValue / totals.totalValue) * 100 : null;
  const cashRatio = totals?.totalValue && cash !== null ? (cash / totals.totalValue) * 100 : null;
  const largest = [...holdings]
    .filter((h) => h.marketValue !== null)
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))[0];
  const equityValue = totals?.totalMarketValue ?? null;
  const concentration =
    largest && equityValue ? ((largest.marketValue ?? 0) / equityValue) * 100 : null;

  const feedOffline = Boolean(error);
  const noRecord = !loading && !feedOffline && (!data || data.performance.length === 0);

  return (
    <ScreenGrid
      main={
        <>
          <MetricStrip columns={5}>
            <Metric
              label="Total value"
              value={loading || !totals ? '—' : fmtCurrency(totals.totalValue)}
              muted={loading || !totals}
              sub={loading || !totals ? 'Awaiting first record' : 'Holdings and cash'}
            />
            <Metric
              label="Invested"
              value={loading || !totals ? '—' : fmtCurrency(totals.totalMarketValue)}
              muted={loading || !totals}
              sub={
                investedRatio === null
                  ? 'No positions'
                  : `${investedRatio.toFixed(1)}% of value`
              }
            />
            <Metric
              label="Cash"
              value={loading || cash === null ? '—' : fmtCurrency(cash)}
              muted={loading || cash === null}
              sub={
                cashRatio === null ? 'Fund the account to begin' : `${cashRatio.toFixed(1)}% of value`
              }
            />
            <Metric
              label="Unrealised P/L"
              value={loading || !totals ? '—' : fmtCurrency(totals.totalGainLoss)}
              muted={loading || !totals}
              tone={totals ? gainLossTone(totals.totalGainLoss) : undefined}
              sub={loading || !totals ? 'No open positions' : 'Open positions'}
            />
            <Metric
              label="Return on invested"
              value={loading || !totals ? '—' : fmtPercent(totals.totalGainLossPct)}
              muted={loading || !totals || totals.totalGainLossPct === null}
              tone={gainLossTone(totals?.totalGainLossPct)}
              sub={loading || !totals ? 'Needs two records' : 'Since cost basis'}
            />
          </MetricStrip>

          <Panel>
            <PanelHead
              title="Portfolio value"
              caption={
                isReturnView
                  ? hasBenchmarkData
                    ? 'Investment return, adjusted for contributions and withdrawals'
                    : 'Investment return, adjusted for contributions and withdrawals · no SPY history, benchmark unavailable'
                  : view === 'Normalized'
                    ? 'Account value in today\u2019s capital, so contributions move the level rather than the shape'
                    : 'Account value as recorded at each close · deposits appear as steps'
              }
              right={
                <div className="flex items-center" style={{ gap: 16 }}>
                  <label
                    className="flex items-center"
                    style={{
                      gap: 6,
                      fontSize: 11.5,
                      color: hasBenchmarkData && isReturnView ? 'var(--muted)' : 'var(--disabled)',
                      cursor: hasBenchmarkData && isReturnView ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showBenchmark && hasBenchmarkData && isReturnView}
                      disabled={!hasBenchmarkData || !isReturnView}
                      onChange={(e) => setShowBenchmark(e.target.checked)}
                      style={{ margin: 0, width: 12, height: 12, accentColor: 'var(--link)' }}
                    />
                    S&amp;P 500
                  </label>
                  <Segmented
                    label="Chart view"
                    options={CHART_VIEWS}
                    value={view}
                    onChange={setView}
                  />
                  <Segmented
                    label="Chart period"
                    options={CHART_PERIODS}
                    value={period}
                    onChange={setPeriod}
                  />
                </div>
              }
            />
            {feedOffline ? (
              <Hatch
                title="Holdings feed is offline"
                note="The interface is online but the sheet-backed feed did not return data. Nothing is estimated in the meantime."
              />
            ) : noRecord ? (
              <Hatch
                title="No verified account record yet"
                note="The value series begins after the first sync. Nothing is estimated in the meantime."
              />
            ) : plotted.length === 0 ? (
              <Hatch title="No records in this period" note="Choose a longer window to see the series." />
            ) : (
              <>
                <div style={{ padding: '16px 18px 10px' }}>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={plotted}
                        margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid stroke="#ebece9" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={AXIS_TICK}
                          axisLine={{ stroke: '#dcddd9' }}
                          tickLine={false}
                          minTickGap={40}
                        />
                        <YAxis
                          tick={AXIS_TICK}
                          axisLine={false}
                          tickLine={false}
                          width={62}
                          domain={
                            benchmarkView
                              ? paddedDomain(
                                  windowedComparison.flatMap((d) => [d.Portfolio, d['S&P 500']]),
                                  0.18,
                                  0.5,
                                )
                              : isReturnView
                                ? paddedDomain(windowedReturns.map((d) => d.Portfolio), 0.18, 0.5)
                                : paddedDomain(
                                    (plotted as Array<{ Value: number }>).map((d) => d.Value),
                                  )
                          }
                          tickFormatter={(v) =>
                            isReturnView ? `${Number(v).toFixed(1)}%` : fmtAxisDollar(Number(v))
                          }
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v) =>
                            isReturnView ? `${Number(v).toFixed(2)}%` : fmtCurrency(Number(v))
                          }
                        />
                        {benchmarkView ? (
                          <>
                            <Area
                              type="monotone"
                              dataKey="Portfolio"
                              stroke="#1f4b76"
                              strokeWidth={1.75}
                              fill="none"
                              dot={soloDot}
                              activeDot={{ r: 2.75, fill: '#1f4b76', strokeWidth: 0 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="S&P 500"
                              stroke="#a9abb0"
                              strokeWidth={1.25}
                              strokeDasharray="3 3"
                              dot={soloDot}
                            />
                          </>
                        ) : (
                          <Area
                            type="monotone"
                            dataKey={isReturnView ? 'Portfolio' : 'Value'}
                            stroke="#1f4b76"
                            strokeWidth={1.75}
                            fill="none"
                            dot={soloDot}
                            activeDot={{ r: 2.75, fill: '#1f4b76', strokeWidth: 0 }}
                          />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div
                  className="flex items-center"
                  style={{ borderTop: '1px solid var(--rule-soft)', fontSize: 11.5 }}
                >
                  <StatCell label="Period change" first>
                    <Figure
                      value={
                        summary.change === null
                          ? '—'
                          : isReturnView
                            ? `${summary.change >= 0 ? '+' : ''}${summary.change.toFixed(2)} pt`
                            : fmtCurrency(summary.change)
                      }
                      tone={gainLossTone(summary.change)}
                    />
                  </StatCell>
                  <StatCell label="High">
                    <Figure
                      value={
                        summary.high === null
                          ? '—'
                          : isReturnView
                            ? `${summary.high.toFixed(2)}%`
                            : fmtCurrency(summary.high)
                      }
                    />
                  </StatCell>
                  <StatCell label="Low">
                    <Figure
                      value={
                        summary.low === null
                          ? '—'
                          : isReturnView
                            ? `${summary.low.toFixed(2)}%`
                            : fmtCurrency(summary.low)
                      }
                    />
                  </StatCell>
                  <StatCell label="Max drawdown">
                    <Figure
                      value={
                        summary.maxDrawdownPct === null
                          ? '—'
                          : `${summary.maxDrawdownPct.toFixed(2)}%`
                      }
                    />
                  </StatCell>
                  <StatCell label="vs S&P 500">
                    <Figure
                      value={vsBenchmark === null ? '—' : `${vsBenchmark >= 0 ? '+' : ''}${vsBenchmark.toFixed(2)} pt`}
                      tone={gainLossTone(vsBenchmark)}
                    />
                  </StatCell>
                </div>
              </>
            )}
          </Panel>

          <Panel>
            <PanelHead
              title="Holdings"
              right={
                <span className="pm-caption">
                  {data?.lastSynced ? `Priced at ${data.lastSynced} · ` : ''}
                  {holdings.length} {holdings.length === 1 ? 'position' : 'positions'}
                </span>
              }
            />
            <table className="pm-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th className="pm-num-cell">Units</th>
                  <th className="pm-num-cell">Avg cost</th>
                  <th className="pm-num-cell">Last</th>
                  <th className="pm-num-cell">Market value</th>
                  <th className="pm-num-cell">P/L</th>
                  <th className="pm-num-cell">Weight</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '26px 18px', textAlign: 'center' }}>
                      <span className="pm-nil">—</span>
                    </td>
                  </tr>
                ) : holdings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="pm-prose-cell"
                      style={{ padding: '26px 18px', textAlign: 'center', fontSize: 12, color: 'var(--muted-2)' }}
                    >
                      No positions on the verified record. Holdings appear once a trade settles.
                    </td>
                  </tr>
                ) : (
                  <>
                    {holdings.map((h) => (
                      <HoldingRow key={h.ticker} holding={h} totalValue={totals?.totalValue ?? null} />
                    ))}
                    {cash !== null && (
                      <tr>
                        <td className="pm-prose-cell">
                          <span style={{ fontWeight: 600 }}>USD</span>
                          <span style={{ color: 'var(--muted-2)', paddingLeft: 8 }}>
                            Settled cash · uninvested
                          </span>
                        </td>
                        <td className="pm-num-cell"><Nil /></td>
                        <td className="pm-num-cell"><Nil /></td>
                        <td className="pm-num-cell"><Nil /></td>
                        <td className="pm-num-cell">{fmtCurrency(cash)}</td>
                        <td className="pm-num-cell"><Nil /></td>
                        <td className="pm-num-cell">
                          {cashRatio === null ? <Nil /> : `${cashRatio.toFixed(1)}%`}
                        </td>
                      </tr>
                    )}
                    {totals && (
                      <tr className="pm-total-row">
                        <td className="pm-prose-cell" style={{ fontWeight: 600 }}>Total</td>
                        <td />
                        <td />
                        <td />
                        <td className="pm-num-cell">{fmtCurrency(totals.totalValue)}</td>
                        <td
                          className="pm-num-cell"
                          style={{ color: gainLossColor(totals.totalGainLoss) }}
                        >
                          {fmtCurrency(totals.totalGainLoss)}
                        </td>
                        <td className="pm-num-cell">100.0%</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </Panel>
        </>
      }
      rail={
        <>
          <RailBlock
            title="Allocation"
            right={
              <span className="pm-num" style={{ fontSize: 11, color: 'var(--muted-2)' }}>
                {holdings.length + (cash !== null ? 1 : 0)} lines
              </span>
            }
          >
            {investedRatio === null ? (
              <p style={{ margin: 0, padding: '14px 0', fontSize: 11.5, color: 'var(--muted-2)' }}>
                Allocation is reported only from settled positions.
              </p>
            ) : (
              <>
                <AllocationBar investedPct={investedRatio} />
                <div className="flex flex-col">
                  <div className="pm-defrow">
                    <span className="flex items-center" style={{ gap: 8, fontSize: 12.5, color: 'var(--ink)' }}>
                      <span style={{ width: 8, height: 8, background: 'var(--accent)' }} />
                      Equities
                    </span>
                    <span className="pm-num" style={{ fontSize: 12 }}>
                      {investedRatio.toFixed(1)}% · {fmtCurrency(totals?.totalMarketValue ?? null)}
                    </span>
                  </div>
                  <div className="pm-defrow">
                    <span className="flex items-center" style={{ gap: 8, fontSize: 12.5, color: 'var(--ink)' }}>
                      <span style={{ width: 8, height: 8, background: 'var(--chip-2)' }} />
                      Cash
                    </span>
                    <span className="pm-num" style={{ fontSize: 12 }}>
                      {cashRatio === null ? '—' : `${cashRatio.toFixed(1)}%`} · {fmtCurrency(cash)}
                    </span>
                  </div>
                  <DefRow label="Single-name concentration">
                    {concentration === null ? <Nil /> : `${concentration.toFixed(0)}% of equity`}
                  </DefRow>
                </div>
              </>
            )}
          </RailBlock>

          <RailBlock title="Mandate and risk">
            <div className="flex flex-col">
              <DefRow label="Current exposure">
                {investedRatio === null ? <Nil /> : `${investedRatio.toFixed(1)}%`}
              </DefRow>
              <DefRow label="Largest position">
                {largest ? `${largest.ticker} ${((largest.marketValue ?? 0) / (totals?.totalValue || 1) * 100).toFixed(1)}%` : <Nil />}
              </DefRow>
              <DefRow label="Positions held">{fmtNumber(holdings.length, 0)}</DefRow>
              {/* Target exposure, cash floor and position limits are set in the
                  research backend's mandate files and are not published to this
                  dashboard, so they are labelled rather than filled in. */}
              <DefRow label="Target exposure"><Nil /></DefRow>
              <DefRow label="Cash floor"><Nil /></DefRow>
            </div>
          </RailBlock>

          <RailBlock title="Activity" grow>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-2)' }}>
              The ledger of proposals, approvals and fills is kept on the research backend. Approvals
              are recorded on the Agents screen.
            </p>
          </RailBlock>

          <Footnote label="Reporting basis">
            Returns are adjusted for signed contributions and withdrawals. Prices come from the
            sheet-backed holdings record at last sync; intraday values are not shown.
          </Footnote>
        </>
      }
    />
  );
}

function StatCell({ label, first, children }: { label: string; first?: boolean; children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: '9px 18px',
        color: 'var(--muted)',
        borderLeft: first ? undefined : '1px solid var(--rule-soft)',
      }}
    >
      {label}{' '}
      <span className="pm-num" style={{ fontWeight: 500 }}>
        {children}
      </span>
    </span>
  );
}

function HoldingRow({ holding, totalValue }: { holding: Holding; totalValue: number | null }) {
  const weight =
    totalValue && holding.marketValue !== null ? (holding.marketValue / totalValue) * 100 : null;
  const gain = holding.gainLoss;
  return (
    <tr>
      <td className="pm-prose-cell">
        <span style={{ fontWeight: 600 }}>{holding.ticker}</span>
        <span style={{ color: 'var(--muted-2)', paddingLeft: 8 }}>{holding.name}</span>
      </td>
      <td className="pm-num-cell">{fmtNumber(holding.shares, 4)}</td>
      <td className="pm-num-cell">{holding.avgCost === null ? <Nil /> : fmtNumber(holding.avgCost)}</td>
      <td className="pm-num-cell">
        {holding.currentPrice === null ? <Nil /> : fmtNumber(holding.currentPrice)}
      </td>
      <td className="pm-num-cell">
        {holding.marketValue === null ? <Nil /> : fmtCurrency(holding.marketValue)}
      </td>
      <td className="pm-num-cell" style={{ color: gainLossColor(gain) }}>
        {gain === null ? (
          <Nil />
        ) : (
          <>
            {fmtCurrency(gain)}{' '}
            {holding.gainLossPct !== null && (
              <span style={{ color: gainLossSoftColor(gain) }}>
                ({fmtPercent(holding.gainLossPct)})
              </span>
            )}
          </>
        )}
      </td>
      <td className="pm-num-cell">{weight === null ? <Nil /> : `${weight.toFixed(1)}%`}</td>
    </tr>
  );
}
