'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AGENTS } from '@/lib/agents';

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

interface ProposalCash {
  cashAvailable: number;
  reservedBuyCash: number;
  availableBuyCash: number;
}

interface MarketScansPanelProps {
  showHeader?: boolean;
}

type ProposalSide = 'BUY' | 'SELL';
type ScanResearchState = 'idle' | 'scanning' | 'researching' | 'queued' | 'error';

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

function agentLabel(id: string) {
  const agent = AGENTS.find((a) => a.id === id);
  return agent?.name || `Agent ${id.split('-')[1]}`;
}

function defaultAgentFor(row: MarketScanRow) {
  return AGENTS.some((agent) => agent.id === row.agentHint) ? row.agentHint : AGENTS[0].id;
}

function statusUpdatedAt(status: ScanStatus | null) {
  const time = Date.parse(status?.updatedAt ?? '');
  return Number.isNaN(time) ? 0 : time;
}

export default function MarketScansPanel({ showHeader = true }: MarketScansPanelProps) {
  const [rows, setRows] = useState<MarketScanRow[]>([]);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposalAmount, setProposalAmount] = useState('100');
  const [proposalSide, setProposalSide] = useState<ProposalSide>('BUY');
  const [rowAgents, setRowAgents] = useState<Record<string, string>>({});
  const [creatingProposalFor, setCreatingProposalFor] = useState<string | null>(null);
  const [createdProposalIds, setCreatedProposalIds] = useState<Record<string, string>>({});
  const [scanResearchState, setScanResearchState] = useState<ScanResearchState>('idle');
  const [scanResearchRequestedAt, setScanResearchRequestedAt] = useState<number | null>(null);
  const [scanResearchMessage, setScanResearchMessage] = useState<string | null>(null);
  const [proposalCash, setProposalCash] = useState<ProposalCash | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/market-scans');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to load market scans');
      setRows(json.rows ?? []);
      setStatus(json.status ?? null);
      setProposalCash(json.proposalCash ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isSyncing = status?.state === 'queued' || status?.state === 'running';
  const scanResearchActive = scanResearchState === 'scanning' || scanResearchState === 'researching';
  const proposalAmountNumber = Number(proposalAmount);
  const buyProposalExceedsCash =
    proposalSide === 'BUY' &&
    proposalCash != null &&
    Number.isFinite(proposalAmountNumber) &&
    proposalAmountNumber > proposalCash.availableBuyCash + 0.005;

  useEffect(() => {
    if (!isSyncing && scanResearchState !== 'scanning') return;
    const interval = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(interval);
  }, [isSyncing, load, scanResearchState]);

  async function requestRefresh() {
    if (refreshing || scanResearchActive) return;
    setRefreshing(true);
    setError(null);
    setScanResearchState('idle');
    setScanResearchMessage(null);
    setScanResearchRequestedAt(null);
    try {
      const res = await fetch('/api/market-scans', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to queue scan sync');
      setStatus(json.status ?? { state: 'queued' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRefreshing(false);
    }
  }

  async function requestScanAndResearch() {
    if (refreshing || isSyncing || scanResearchActive) return;
    setError(null);
    setScanResearchState('scanning');
    setScanResearchMessage('Market scan queued. Waiting for fresh Robinhood MCP results...');
    setScanResearchRequestedAt(null);

    try {
      const res = await fetch('/api/market-scans', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to queue scan sync');

      const queuedStatus = json.status ?? { state: 'queued' };
      setStatus(queuedStatus);
      setScanResearchRequestedAt(statusUpdatedAt(queuedStatus) || Date.now());
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setScanResearchState('error');
      setScanResearchMessage(message);
    }
  }

  useEffect(() => {
    if (scanResearchState !== 'scanning' || !scanResearchRequestedAt || !status) return;

    if (status.state === 'error') {
      setScanResearchState('error');
      setScanResearchMessage(status.error || 'Market scan sync failed.');
      return;
    }

    if (status.state !== 'synced' || statusUpdatedAt(status) < scanResearchRequestedAt) return;

    async function startResearchScan() {
      setScanResearchState('researching');
      setScanResearchMessage('Market scan synced. Starting all-agent research scan...');
      try {
        const res = await fetch('/api/scan', { method: 'POST' });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || 'Failed to start research scan');
        setScanResearchState('queued');
        setScanResearchMessage(json.message || 'All-agent research scan started.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setScanResearchState('error');
        setScanResearchMessage(message);
      }
    }

    void startResearchScan();
  }, [scanResearchRequestedAt, scanResearchState, status]);

  async function queueProposal(row: MarketScanRow) {
    if (buyProposalExceedsCash) {
      setError(`This BUY proposal needs ${usd.format(proposalAmountNumber)}, but only ${usd.format(proposalCash?.availableBuyCash ?? 0)} cash is available after accepted BUY reserves.`);
      return;
    }

    const rowKey = `${row.scanName}-${row.ticker}`;
    const agentId = rowAgents[rowKey] ?? defaultAgentFor(row);
    setCreatingProposalFor(rowKey);
    setError(null);
    try {
      const rationale = [
        `${agentLabel(agentId)} is queuing ${row.ticker} from the Robinhood MCP scan feed for manager review.`,
        row.signal ? `Scan signal: ${row.signal}` : null,
        row.notes ? `Notes: ${row.notes}` : null,
        row.price != null ? `Last scanned price: ${usd.format(row.price)}.` : null,
      ].filter(Boolean).join('\n');

      const riskSummary = [
        'Scan-origin proposal only. This has not placed an order and still requires FundManager acceptance.',
        row.agentHint ? `Original scan route: ${row.agentHint}.` : 'Original scan route: open/unassigned.',
        row.marketCap != null ? `Market cap: ${compactUsd.format(row.marketCap)}.` : null,
        row.volume != null ? `Volume: ${nf0.format(row.volume)}.` : null,
      ].filter(Boolean).join('\n');

      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          ticker: row.ticker,
          side: proposalSide,
          amountDollars: proposalAmount,
          maxPrice: proposalSide === 'BUY' && row.price != null ? Math.round(row.price * 1.02 * 100) / 100 : '',
          rationale,
          riskSummary,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to queue proposal');
      setCreatedProposalIds((current) => ({ ...current, [rowKey]: json.proposal.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreatingProposalFor(null);
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
            {showHeader ? (
              <>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-200/75">Robinhood MCP</p>
                <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">Market Scans</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                  Scanner output and broker-native market context for the research agents. Scan rows can expand the next research run, but do not place orders.
                </p>
              </>
            ) : (
              <>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-200/75">Robinhood MCP</p>
                <h2 className="text-2xl font-black tracking-[-0.03em] text-white">Scanner Feed</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Controlled read-only scan sync for agent research. Results feed the next scheduled or manual research scan.
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] ${statusTone(status)}`}>
              {status?.state ?? 'idle'}{status?.count != null ? ` · ${status.count}` : ''}
            </span>
            <button
              onClick={requestRefresh}
              disabled={refreshing || isSyncing || scanResearchActive}
              className="border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:bg-cyan-300/15 disabled:opacity-40"
            >
              {refreshing ? 'Queued...' : isSyncing ? 'Syncing...' : 'Sync Scans'}
            </button>
            <button
              onClick={requestScanAndResearch}
              disabled={refreshing || isSyncing || scanResearchActive}
              className="border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:opacity-40"
            >
              {scanResearchState === 'scanning' ? 'Scanning...' : scanResearchState === 'researching' ? 'Starting Research...' : 'Scan + Research'}
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="border border-white/10 bg-white/[0.03] p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">BUY Cash</p>
            <p className="mt-2 font-mono text-2xl font-black text-amber-100">
              {proposalCash ? usd.format(proposalCash.availableBuyCash) : '—'}
            </p>
            {proposalCash && proposalCash.reservedBuyCash > 0 && (
              <p className="mt-1 text-xs text-slate-500">{usd.format(proposalCash.reservedBuyCash)} reserved</p>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 border border-white/10 bg-white/[0.025] p-3 sm:flex-row sm:items-end">
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Proposal Side</span>
            <select
              value={proposalSide}
              onChange={(e) => setProposalSide(e.target.value as ProposalSide)}
              className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white focus:border-cyan-300/50 focus:outline-none sm:w-32"
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Proposal Dollars</span>
            <input
              value={proposalAmount}
              onChange={(e) => setProposalAmount(e.target.value)}
              inputMode="decimal"
              className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white focus:border-cyan-300/50 focus:outline-none sm:w-36"
            />
          </label>
          <p className="text-xs leading-5 text-slate-500">
            Row actions create Pending approval proposals only. BUY proposals are capped by cash after accepted unfilled BUY reserves.
          </p>
        </div>
        {buyProposalExceedsCash && (
          <p className="mt-3 border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-sm text-amber-100">
            Entered BUY amount exceeds available cash after accepted proposal reserves.
          </p>
        )}
        {scanResearchMessage && (
          <p className={`mt-4 border px-4 py-3 text-sm ${
            scanResearchState === 'error'
              ? 'border-red-400/30 bg-red-500/10 text-red-200'
              : scanResearchState === 'queued'
                ? 'border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-100'
                : 'border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100'
          }`}>
            {scanResearchMessage}
          </p>
        )}
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
                <table className="w-full min-w-[1120px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.025] font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Ticker</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Move</th>
                      <th className="px-4 py-3">Volume</th>
                      <th className="px-4 py-3">Market Cap</th>
                      <th className="px-4 py-3">Signal</th>
                      <th className="px-4 py-3">Agent</th>
                      <th className="px-4 py-3">Proposal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {scanRows.map((row) => {
                      const rowKey = `${row.scanName}-${row.ticker}`;
                      const selectedAgent = rowAgents[rowKey] ?? defaultAgentFor(row);
                      const createdId = createdProposalIds[rowKey];
                      return (
                        <tr key={rowKey} className="hover:bg-cyan-300/[0.025]">
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
                          <td className="px-4 py-3">
                            <select
                              value={selectedAgent}
                              onChange={(e) => setRowAgents((current) => ({ ...current, [rowKey]: e.target.value }))}
                              className="w-36 border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-amber-100 focus:border-cyan-300/50 focus:outline-none"
                            >
                              {AGENTS.map((agent) => (
                                <option key={agent.id} value={agent.id}>{agentLabel(agent.id)}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            {createdId ? (
                              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-200">Queued</p>
                            ) : (
                              <button
                                onClick={() => queueProposal(row)}
                                disabled={creatingProposalFor === rowKey || buyProposalExceedsCash}
                                className="border border-emerald-300/30 bg-emerald-300/[0.08] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200 transition-colors hover:bg-emerald-300/[0.14] disabled:opacity-40"
                              >
                                {creatingProposalFor === rowKey ? 'Queuing...' : buyProposalExceedsCash ? 'Cash Capped' : 'Queue Proposal'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
