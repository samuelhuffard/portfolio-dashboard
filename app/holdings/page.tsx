'use client';

import { useEffect, useState } from 'react';
import { fmtCurrency, fmtPercent, fmtNumber, gainLossColor } from '@/lib/format';
import type { Holding } from '@/lib/sheets';

interface PortfolioResponse {
  holdings: Holding[];
  cash: number | null;
  lastSynced: string | null;
}

export default function HoldingsPage() {
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

  if (loading) return <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading positions...</p>;

  if (error) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-2 text-2xl font-semibold text-white">Positions</h1>
        <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="terminal-panel p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-300/75">Position Blotter</p>
            <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Holdings</h1>
          </div>
          {data.lastSynced && <span className="font-mono text-xs uppercase tracking-[0.14em] text-slate-500">Last synced {data.lastSynced}</span>}
        </div>
      </div>

      {data.holdings.length === 0 ? (
        <p className="terminal-panel p-5 text-sm text-slate-400">No holdings yet — run holdings-sync to populate this page.</p>
      ) : (
        <div className="terminal-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">Open positions</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{data.holdings.length} equities</p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">Ticker</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-right">Shares</th>
                  <th className="px-4 py-3 text-right">Avg Cost</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Market Value</th>
                  <th className="px-4 py-3 text-right">Gain/Loss</th>
                  <th className="px-4 py-3 text-right">Return</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => (
                  <tr key={h.ticker}>
                    <td className="px-4 py-3 font-mono font-semibold text-white">{h.ticker}</td>
                    <td className="px-4 py-3 text-slate-400">{h.name}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{fmtNumber(h.shares, 4)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{fmtCurrency(h.avgCost)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{fmtCurrency(h.currentPrice)}</td>
                    <td className="px-4 py-3 text-right font-mono text-white">{fmtCurrency(h.marketValue)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${gainLossColor(h.gainLoss).replace('600', '300')}`}>
                      {fmtCurrency(h.gainLoss)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${gainLossColor(h.gainLossPct).replace('600', '300')}`}>
                      {fmtPercent(h.gainLossPct)}
                    </td>
                  </tr>
                ))}
                {data.cash !== null && (
                  <tr className="bg-amber-200/[0.04]">
                    <td className="px-4 py-3 font-mono font-semibold text-amber-200">CASH</td>
                    <td className="px-4 py-3 text-slate-500" colSpan={4}></td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-amber-200">{fmtCurrency(data.cash)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">—</td>
                    <td className="px-4 py-3 text-right text-slate-600">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
