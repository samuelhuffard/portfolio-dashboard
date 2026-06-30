'use client';

import { useEffect, useMemo, useState } from 'react';

interface MarketScanRow {
  syncedAt: string;
  scanName: string;
  ticker: string;
  name: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  avgVolume: number | null;
  marketCap: number | null;
  signal: string;
  score: number | null;
  agentHint: string;
  notes: string;
}

interface ScanStatus {
  state: string;
  count?: number;
  error?: string | null;
  updatedAt?: string;
}

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const compactUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

function formatPct(value: number | null) {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatDate(value: string) {
  if (!value) return 'Not synced';
  const d = new Date(value);
  return Number.isNaN(d.valueOf()) ? value : d.toLocaleString();
}

function statusTone(status: ScanStatus | null) {
  if (!status) return 'border-slate-300/20 bg-white/[0.03] text-slate-300';
  if (status.state === 'synced') return 'border-emerald-300/30 bg-emerald-300/[0.06] text-emerald-100';
  if (status.state === 'running' || status.state === 'queued') return 'border-cyan-300/30 bg-cyan-300/[0.06] text-cyan-100';
  if (status.state === 'error') return 'border-red-300/30 bg-red-300/[0.08] text-red-100';
  return 'border-slate-300/20 bg-white/[0.03] text-slate-300';
}

export default function MarketScansPage() {
  const [rows, setRows] = useState<MarketScanRow[]>([]);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/market-scans');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to load market scans');
      setRows(json.rows ?? []);
      setStatus(json.status ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function requestRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/market-scans', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to queue scan sync');
      setStatus(json.status ?? { state: 'queued' });
      setTimeout(load, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRefreshing(false);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, MarketScanRow[]>();
    for (const row of rows) {
      const key = row.scanName || 'Robinhood MCP';
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [rows]);

  const lastSynced = rows[0]?.syncedAt || status?.updatedAt || '';

  return (
    <div className="space-y-6">
      <section className="terminal-panel p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-200/75">Robinhood MCP</p>
            <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">Market Scans</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Scanner output and broker-native market context for the research agents. Scan rows can expand the next research run, but do not place orders.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] ${statusTone(status)}`}>
              {status?.state ?? 'idle'}{status?.count != null ? ` · ${status.count}` : ''}
            </span>
            <button
              onClick={requestRefresh}
              disabled={refreshing}
              className="border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:bg-cyan-300/15 disabled:opacity-40"
            >
              {refreshing ? 'Queued...' : 'Sync Scans'}
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="border border-white/10 bg-white/[0.03] p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Rows</p>
            <p className="mt-2 font-mono text-2xl font-black text-white">{rows.length}</p>
          </div>
          <div className="border border-white/10 bg-white/[0.03] p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Scans</p>
            <p className="mt-2 font-mono text-2xl font-black text-white">{groups.length}</p>
          </div>
          <div className="border border-white/10 bg-white/[0.03] p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Last Sync</p>
            <p className="mt-2 text-sm text-slate-300">{formatDate(lastSynced)}</p>
          </div>
        </div>
        {status?.error && <p className="mt-4 border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{status.error}</p>}
      </section>

      {error && <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      {loading ? (
        <p className="font-mono text-sm uppercase tracking-[0.24em] text-cyan-200">Loading market scans...</p>
      ) : rows.length === 0 ? (
        <section className="terminal-panel p-5 text-sm text-slate-400">
          No market scan rows yet. Queue a sync and keep the Mac companion running so it can call the Robinhood MCP.
        </section>
      ) : (
        <section className="space-y-4">
          {groups.map(([scanName, scanRows]) => (
            <div key={scanName} className="terminal-panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Scan</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-white">{scanName}</h2>
                </div>
                <span className="border border-emerald-300/25 bg-emerald-300/[0.06] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-100">
                  {scanRows.length} candidates
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.025] font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Ticker</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Move</th>
                      <th className="px-4 py-3">Volume</th>
                      <th className="px-4 py-3">Market Cap</th>
                      <th className="px-4 py-3">Signal</th>
                      <th className="px-4 py-3">Agent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {scanRows.map((row) => (
                      <tr key={`${row.scanName}-${row.ticker}`} className="hover:bg-cyan-300/[0.025]">
                        <td className="px-4 py-3">
                          <p className="font-mono text-lg font-black text-white">{row.ticker}</p>
                          <p className="max-w-[220px] truncate text-xs text-slate-500">{row.name || '—'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-200">{row.price == null ? '—' : usd.format(row.price)}</td>
                        <td className={`px-4 py-3 font-mono ${row.changePct != null && row.changePct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatPct(row.changePct)}</td>
                        <td className="px-4 py-3 font-mono text-slate-300">{row.volume == null ? '—' : nf0.format(row.volume)}</td>
                        <td className="px-4 py-3 font-mono text-slate-300">{row.marketCap == null ? '—' : compactUsd.format(row.marketCap)}</td>
                        <td className="px-4 py-3">
                          <p className="max-w-xl text-slate-300">{row.signal || row.notes || 'Matched Robinhood scan'}</p>
                          {row.score != null && <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200">Score {row.score}</p>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs uppercase tracking-[0.12em] text-amber-200">{row.agentHint || 'open'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
