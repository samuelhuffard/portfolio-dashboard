'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { fmtCurrency, fmtPercent, gainLossColor } from '@/lib/format';
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

function buildChartData(performance: PerformanceRow[]) {
  const valid = performance.filter((p) => p.portfolioValue !== null && p.spyPrice !== null);
  if (valid.length === 0) return [];

  const basePortfolio = valid[0].portfolioValue as number;
  const baseSpy = valid[0].spyPrice as number;

  return valid.map((p) => ({
    date: p.date,
    Portfolio: ((p.portfolioValue as number) / basePortfolio) * 100,
    'S&P 500': ((p.spyPrice as number) / baseSpy) * 100,
  }));
}

export default function OverviewPage() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portfolio')
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-stone-500">Loading...</p>;
  }

  if (error) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold text-stone-900 mb-2">Overview</h1>
        <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { totals, cash, lastSynced } = data;
  const chartData = buildChartData(data.performance);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">Overview</h1>
        {lastSynced && <span className="text-xs text-stone-400">Last synced {lastSynced}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-xs text-stone-500 mb-1">Total Value</p>
          <p className="text-xl font-semibold text-stone-900">{fmtCurrency(totals.totalValue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-xs text-stone-500 mb-1">Cash</p>
          <p className="text-xl font-semibold text-stone-900">{fmtCurrency(cash)}</p>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-xs text-stone-500 mb-1">Total Gain/Loss</p>
          <p className={`text-xl font-semibold ${gainLossColor(totals.totalGainLoss)}`}>
            {fmtCurrency(totals.totalGainLoss)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-xs text-stone-500 mb-1">Total Return</p>
          <p className={`text-xl font-semibold ${gainLossColor(totals.totalGainLossPct)}`}>
            {fmtPercent(totals.totalGainLossPct)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <h2 className="text-sm font-medium text-stone-700 mb-4">Portfolio vs S&P 500 (normalized to 100)</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-stone-500">
            No performance history yet — run holdings-sync to start tracking.
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#a8a29e" />
                <YAxis tick={{ fontSize: 12 }} stroke="#a8a29e" domain={['auto', 'auto']} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="Portfolio" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="S&P 500" stroke="#64748b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
