'use client';

import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import NewsPanel from '@/components/command/NewsPanel';
import RunResearchButton from '@/components/command/RunResearchButton';
import { fmtCurrency, fmtPercent, gainLossColor } from '@/lib/format';
import { buildNavComparison, paddedReturnDomain } from '@/lib/portfolio-chart';
import type { Holding, PerformanceRow } from '@/lib/sheets';

interface PortfolioResponse {
  holdings: Holding[];
  cash: number | null;
  lastSynced: string | null;
  performance: PerformanceRow[];
  totals: {
    totalValue: number;
    totalMarketValue: number;
    totalCostBasis: number;
    totalGainLoss: number;
    totalGainLossPct: number | null;
  };
}

/** Padded Y domain so small accounts don't render as a flat line pinned to zero. */
function paddedDomain(values: number[], padRatio = 0.15, minPad = 0.5): [number, number] {
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * padRatio, minPad);
  return [min - pad, max + pad];
}

function fmtAxisDollar(v: number): string {
  if (Math.abs(v) >= 10_000) return `$${(v / 1000).toFixed(1)}k`;
  if (Math.abs(v) >= 100) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

function buildGrowthData(performance: PerformanceRow[]) {
  return performance
    .filter((p) => p.portfolioValue !== null)
    .map((p) => ({ date: p.date, Value: p.portfolioValue as number }));
}

function buildAllocation(holdings: Holding[]) {
  return holdings
    .filter((h) => h.marketValue !== null && h.marketValue > 0)
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
    .slice(0, 7)
    .map((h) => ({
      ticker: h.ticker,
      value: h.marketValue ?? 0,
      returnPct: h.gainLossPct ?? 0,
    }));
}

function getTopMovers(holdings: Holding[]) {
  return [...holdings]
    .filter((h) => h.gainLossPct !== null)
    .sort((a, b) => Math.abs(b.gainLossPct ?? 0) - Math.abs(a.gainLossPct ?? 0))
    .slice(0, 5);
}

const BAR_COLORS = ['#00ffb2', '#6ee7ff', '#ffd166', '#a7f3d0', '#38bdf8', '#f59e0b', '#94a3b8'];

type ChartMode = 'normalized' | 'growth';

export default function OverviewPage() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<ChartMode>('normalized');

  useEffect(() => {
    function load() {
      fetch('/api/portfolio')
        .then((res) => res.json())
        .then((json) => {
          if (json.error) setError(json.error);
          else { setData(json); setError(null); }
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
    load();
    const id = setInterval(load, 300_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading market console...</p>;

  if (error) {
    return (
      <div className="space-y-5">
        <section className="terminal-panel p-5 sm:p-7">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.36em] text-red-200/80">
            Data Feed Offline
          </p>
          <h1 className="max-w-4xl text-4xl font-black tracking-[-0.04em] text-white sm:text-6xl">
            Command center is waiting on portfolio data.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
            The interface is online, but the spreadsheet-backed holdings feed did not return data.
          </p>
        </section>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="terminal-panel p-5">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.28em] text-red-200/80">Feed Error</p>
            <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
          </div>
          <div className="market-card p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-200/80">Expected Source</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Run holdings sync or research scan, then refresh this desk to populate charts, allocation, and movers.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { totals, cash, lastSynced } = data;
  const navComparison = buildNavComparison(data.performance);
  const hasNavData = navComparison.length > 0;
  const growthData = buildGrowthData(data.performance);
  const allocation = buildAllocation(data.holdings);
  const topMovers = getTopMovers(data.holdings);
  const investedRatio = totals.totalValue ? (totals.totalMarketValue / totals.totalValue) * 100 : null;
  const cashRatio = totals.totalValue && cash !== null ? (cash / totals.totalValue) * 100 : null;

  // No NAV history yet → the deposit-proof comparison isn't possible; fall back
  // to the raw-value chart and never claim a vs-S&P comparison.
  const effectiveMode: ChartMode = hasNavData ? chartMode : 'growth';
  const comparisonDomain = paddedReturnDomain(navComparison.flatMap((d) => [d.Portfolio, d['S&P 500']]));
  const growthDomain = paddedDomain(
    growthData.map((d) => d.Value),
    0.18,
    1,
  );

  return (
    <div className="space-y-6">
      <section className="terminal-panel overflow-hidden p-5 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.36em] text-emerald-300/80">
              Capital, signals, and risk in one live desk.
            </p>
            <h1 className="max-w-4xl text-4xl font-black tracking-[-0.04em] text-white sm:text-6xl">
              Sam's Personal Investor
            </h1>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="grid min-w-full grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400 sm:min-w-[420px]">
              <div className="border border-white/10 bg-white/[0.035] p-3">
                <p>Last Sync</p>
                <p className="mt-2 truncate text-emerald-200">{lastSynced ?? 'Awaiting data'}</p>
              </div>
              <div className="border border-white/10 bg-white/[0.035] p-3">
                <p>Exposure</p>
                <p className="mt-2 text-amber-200">{investedRatio === null ? '—' : `${investedRatio.toFixed(1)}% invested`}</p>
              </div>
            </div>
            <RunResearchButton />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Value" value={fmtCurrency(totals.totalValue)} accent="text-white" sub="NAV across holdings + cash" />
        <MetricCard label="Cash Reserve" value={fmtCurrency(cash)} accent="text-amber-200" sub={cashRatio === null ? 'Liquidity buffer' : `${cashRatio.toFixed(1)}% of portfolio`} />
        <MetricCard label="Open P/L" value={fmtCurrency(totals.totalGainLoss)} accent={totals.totalGainLoss >= 0 ? 'text-emerald-300' : 'text-red-300'} sub="Unrealized gain / loss" />
        <MetricCard label="Total Return" value={fmtPercent(totals.totalGainLossPct)} accent={totals.totalGainLossPct !== null && totals.totalGainLossPct >= 0 ? 'text-emerald-300' : 'text-red-300'} sub="Since tracked cost basis" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.85fr)]">
        <section className="terminal-panel p-4 sm:p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">
                {effectiveMode === 'normalized' ? 'NAV Per Unit Return' : 'Portfolio Growth'}
              </p>
              <h2 className="text-xl font-semibold text-white">
                {effectiveMode === 'normalized' ? 'Return vs S&P 500' : 'Total Portfolio Value'}
              </h2>
              {!hasNavData && growthData.length > 0 && (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  No NAV-per-unit history yet — benchmark comparison unavailable
                </p>
              )}
            </div>
            {hasNavData && (
              <div className="flex gap-1 rounded border border-white/10 bg-white/[0.04] p-1">
                <button
                  onClick={() => setChartMode('normalized')}
                  className={`px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${effectiveMode === 'normalized' ? 'bg-cyan-400/20 text-cyan-200' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  vs S&P 500
                </button>
                <button
                  onClick={() => setChartMode('growth')}
                  className={`px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${effectiveMode === 'growth' ? 'bg-emerald-400/20 text-emerald-200' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Growth ($)
                </button>
              </div>
            )}
          </div>
          {(effectiveMode === 'normalized' ? navComparison : growthData).length === 0 ? (
            <p className="border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
              No performance history yet — run holdings-sync to start tracking.
            </p>
          ) : effectiveMode === 'normalized' ? (
            <div className="h-[260px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={navComparison} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="portfolioGlow" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#00ffb2" stopOpacity={0.36} />
                      <stop offset="95%" stopColor="#00ffb2" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    domain={comparisonDomain}
                    tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                    width={48}
                  />
                  <Tooltip
                    formatter={(v) => `${Number(v).toFixed(2)}%`}
                    contentStyle={{ background: '#071019', border: '1px solid rgba(0,255,178,.22)', color: '#e5fff7' }}
                  />
                  <ReferenceLine y={0} stroke="rgba(148,163,184,.35)" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="Portfolio" stroke="#00ffb2" strokeWidth={3} fill="url(#portfolioGlow)" dot={false} />
                  <Line type="monotone" dataKey="S&P 500" stroke="#7dd3fc" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[260px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="growthGlow" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#00ffb2" stopOpacity={0.36} />
                      <stop offset="95%" stopColor="#00ffb2" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    domain={growthDomain}
                    tickFormatter={(v) => fmtAxisDollar(Number(v))}
                    width={58}
                  />
                  <Tooltip
                    formatter={(v) => fmtCurrency(Number(v))}
                    contentStyle={{ background: '#071019', border: '1px solid rgba(0,255,178,.22)', color: '#e5fff7' }}
                  />
                  <Area type="monotone" dataKey="Value" stroke="#00ffb2" strokeWidth={3} fill="url(#growthGlow)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="terminal-panel p-4 sm:p-5">
          <div className="mb-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-200/70">Allocation Stack</p>
            <h2 className="text-xl font-semibold text-white">Top Capital Weights</h2>
          </div>
          {allocation.length === 0 ? (
            <p className="text-sm text-slate-400">No holdings allocation available.</p>
          ) : (
            <div className="h-[260px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={allocation} layout="vertical" margin={{ left: 8, right: 18 }}>
                  <CartesianGrid stroke="rgba(148,163,184,.1)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="ticker" type="category" width={54} tick={{ fontSize: 12, fill: '#cbd5e1', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => fmtCurrency(Number(value))} contentStyle={{ background: '#071019', border: '1px solid rgba(255,209,102,.2)', color: '#fff7df' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {allocation.map((entry, index) => (
                      <Cell key={entry.ticker} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.85fr)]">
      <section className="terminal-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-300/70">Position Diagnostics</p>
            <h2 className="text-lg font-semibold text-white">Largest return movers</h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{data.holdings.length} lines</span>
        </div>
        {topMovers.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">No position-level returns available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">Ticker</th>
                  <th className="px-4 py-3 text-left">Company</th>
                  <th className="px-4 py-3 text-right">Market Value</th>
                  <th className="px-4 py-3 text-right">Gain / Loss</th>
                  <th className="px-4 py-3 text-right">Return</th>
                </tr>
              </thead>
              <tbody>
                {topMovers.map((h) => (
                  <tr key={h.ticker}>
                    <td className="px-4 py-3 font-mono font-semibold text-white">{h.ticker}</td>
                    <td className="px-4 py-3 text-slate-400">{h.name}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-200">{fmtCurrency(h.marketValue)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${gainLossColor(h.gainLoss).replace('600', '300')}`}>{fmtCurrency(h.gainLoss)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${gainLossColor(h.gainLossPct).replace('600', '300')}`}>{fmtPercent(h.gainLossPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <NewsPanel />
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="market-card p-4">
      <div className="relative z-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
        <p className={`mt-3 text-2xl font-black tracking-[-0.03em] ${accent}`}>{value}</p>
        <p className="mt-2 text-xs text-slate-500">{sub}</p>
      </div>
    </div>
  );
}
