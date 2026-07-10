'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FunnelSnapshot } from '@/lib/funnel';

interface FunnelResponse {
  snapshots: FunnelSnapshot[];
  history: FunnelSnapshot[];
  error?: string;
}

const BUCKETS = ['holdings', 'movers', 'ranked', 'exploration'] as const;

function staleLabel(updatedAt: string | null): string {
  if (!updatedAt) return 'No snapshot';
  const ageMs = Date.now() - Date.parse(updatedAt);
  if (!Number.isFinite(ageMs)) return 'Unknown age';
  const hours = ageMs / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function pct(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function num(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString();
}

function bucketColor(bucket: string): string {
  if (bucket === 'holdings') return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
  if (bucket === 'movers') return 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100';
  if (bucket === 'exploration') return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  return 'border-white/10 bg-white/[0.04] text-slate-200';
}

function Metric({ label, value, sub, tone = 'text-white' }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.035] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black tracking-[-0.04em] ${tone}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{sub}</p>
    </div>
  );
}

function SnapshotPanel({ snapshot }: { snapshot: FunnelSnapshot }) {
  const enrichedPct =
    snapshot.universe.cataloged && snapshot.universe.sectorEnriched != null
      ? (snapshot.universe.sectorEnriched / snapshot.universe.cataloged) * 100
      : null;

  return (
    <section className="terminal-panel p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">{snapshot.agentId}</p>
          <h2 className="text-2xl font-black tracking-[-0.04em] text-white">{snapshot.source} funnel</h2>
        </div>
        <p className="border border-white/10 bg-white/[0.035] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
          {staleLabel(snapshot.updatedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-[0.16em] sm:grid-cols-4">
        {BUCKETS.map((bucket) => (
          <div key={bucket} className={`border px-3 py-2 ${bucketColor(bucket)}`}>
            <p className="text-slate-400">{bucket}</p>
            <p className="mt-1 text-lg font-black text-white">{snapshot.slate.counts[bucket]}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Enrichment" value={pct(enrichedPct)} sub={`${num(snapshot.universe.sectorEnriched)} / ${num(snapshot.universe.cataloged)} catalog names`} tone={enrichedPct != null && enrichedPct >= 90 ? 'text-emerald-300' : 'text-amber-200'} />
        <Metric label="Ledger Coverage" value={pct(snapshot.researchLedger.screenedCoveragePct)} sub={`${num(snapshot.researchLedger.researchedScreened)} / ${num(snapshot.researchLedger.screenedTickers)} screened names`} tone="text-cyan-200" />
        <Metric label="Evaluator Reject" value={pct(snapshot.evaluator.rejectionRatePct)} sub={`${snapshot.evaluator.rejected + snapshot.evaluator.failedClosed} rejected or failed closed / ${snapshot.evaluator.total} verdicts`} tone="text-red-200" />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {snapshot.slate.tickers.slice(0, 28).map((item) => (
          <span key={`${item.bucket}-${item.ticker}`} className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${bucketColor(item.bucket)}`}>
            {item.ticker}
          </span>
        ))}
      </div>
    </section>
  );
}

export default function FunnelPage() {
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function load() {
      fetch('/api/funnel?agentId=agent-1')
        .then((res) => res.json())
        .then((json: FunnelResponse) => {
          if (json.error) setError(json.error);
          else {
            setData(json);
            setError(null);
          }
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
    load();
    const id = setInterval(load, 300_000);
    return () => clearInterval(id);
  }, []);

  const agentOne = useMemo(() => data?.snapshots.find((s) => s.agentId === 'agent-1') ?? data?.snapshots[0] ?? null, [data]);

  if (loading) return <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading funnel evidence...</p>;

  if (error) {
    return (
      <section className="terminal-panel p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-red-200/80">Funnel Feed Offline</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-white">No observability data loaded.</h1>
        <p className="mt-4 border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="terminal-panel p-5 sm:p-7">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.36em] text-emerald-300/80">Phase 1 Evidence Gate</p>
        <h1 className="max-w-4xl text-4xl font-black tracking-[-0.04em] text-white sm:text-6xl">Discovery Funnel</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
          Live snapshots from the research scan: slate bucket composition, research-ledger coverage, catalog enrichment, and evaluator rejection mix.
        </p>
      </section>

      {!data?.snapshots.length ? (
        <section className="terminal-panel p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-200/80">Awaiting First Snapshot</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Run the scheduled research scan once after this deploy. The Jetson will write `pm:funnel:*` evidence records as each agent finishes.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {data.snapshots.map((snapshot) => <SnapshotPanel key={snapshot.agentId} snapshot={snapshot} />)}
        </div>
      )}

      <section className="terminal-panel p-5">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">Agent-1 Rotation History</p>
            <h2 className="text-2xl font-black tracking-[-0.04em] text-white">Recent slate evidence</h2>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{data?.history.length ?? 0} snapshots retained</p>
        </div>

        {!data?.history.length ? (
          <p className="border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                <tr className="border-b border-white/10">
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Slate</th>
                  <th className="py-3 pr-4">AI Reviews</th>
                  <th className="py-3 pr-4">Ledger</th>
                  <th className="py-3 pr-4">Evaluator</th>
                  <th className="py-3 pr-4">Exploration</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((row) => (
                  <tr key={`${row.agentId}-${row.updatedAt}`} className="border-b border-white/[0.06] text-slate-300">
                    <td className="py-3 pr-4 font-mono text-xs text-slate-400">{row.date}</td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {BUCKETS.map((b) => `${row.slate.counts[b]} ${b[0]}`).join(' / ')}
                    </td>
                    <td className="py-3 pr-4">{row.aiReview.count}{row.aiReview.budget ? ` / ${row.aiReview.budget}` : ''}</td>
                    <td className="py-3 pr-4">{pct(row.researchLedger.screenedCoveragePct)} coverage, {row.researchLedger.reviewedLast7d} last 7d</td>
                    <td className="py-3 pr-4">{pct(row.evaluator.rejectionRatePct)} reject</td>
                    <td className="py-3 pr-4 font-mono text-xs text-amber-100">
                      {row.slate.tickers.filter((t) => t.bucket === 'exploration').map((t) => t.ticker).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {agentOne && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Metric label="Screened Pool" value={num(agentOne.universe.screened)} sub="Current mandate-fit names" tone="text-white" />
          <Metric label="Never Researched" value={num(agentOne.researchLedger.neverResearchedScreened)} sub="Coverage remaining in screened pool" tone="text-amber-200" />
          <Metric label="This Run" value={num(agentOne.researchLedger.researchedThisRun)} sub="Ledger records added by latest scan" tone="text-emerald-200" />
          <Metric label="Revisions" value={num(agentOne.evaluator.revised)} sub="Evaluator forced generator revision" tone="text-cyan-200" />
        </section>
      )}
    </div>
  );
}
