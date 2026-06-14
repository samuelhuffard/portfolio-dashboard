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

  if (loading) return <p className="text-stone-500">Loading...</p>;

  if (error) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold text-stone-900 mb-2">Holdings</h1>
        <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">Holdings</h1>
        {data.lastSynced && <span className="text-xs text-stone-400">Last synced {data.lastSynced}</span>}
      </div>

      {data.holdings.length === 0 ? (
        <p className="text-sm text-stone-500">No holdings yet — run holdings-sync to populate this page.</p>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200">
                <th className="px-4 py-3 font-medium">Ticker</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium text-right">Shares</th>
                <th className="px-4 py-3 font-medium text-right">Avg Cost</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium text-right">Market Value</th>
                <th className="px-4 py-3 font-medium text-right">Gain/Loss</th>
                <th className="px-4 py-3 font-medium text-right">Return</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h) => (
                <tr key={h.ticker} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-stone-900">{h.ticker}</td>
                  <td className="px-4 py-3 text-stone-600">{h.name}</td>
                  <td className="px-4 py-3 text-right">{fmtNumber(h.shares, 4)}</td>
                  <td className="px-4 py-3 text-right">{fmtCurrency(h.avgCost)}</td>
                  <td className="px-4 py-3 text-right">{fmtCurrency(h.currentPrice)}</td>
                  <td className="px-4 py-3 text-right">{fmtCurrency(h.marketValue)}</td>
                  <td className={`px-4 py-3 text-right ${gainLossColor(h.gainLoss)}`}>
                    {fmtCurrency(h.gainLoss)}
                  </td>
                  <td className={`px-4 py-3 text-right ${gainLossColor(h.gainLossPct)}`}>
                    {fmtPercent(h.gainLossPct)}
                  </td>
                </tr>
              ))}
              {data.cash !== null && (
                <tr className="bg-stone-50">
                  <td className="px-4 py-3 font-medium text-stone-900">Cash</td>
                  <td className="px-4 py-3 text-stone-600" colSpan={4}></td>
                  <td className="px-4 py-3 text-right font-medium">{fmtCurrency(data.cash)}</td>
                  <td className="px-4 py-3 text-right">—</td>
                  <td className="px-4 py-3 text-right">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
