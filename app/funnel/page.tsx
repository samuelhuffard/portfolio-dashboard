'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FunnelSnapshot } from '@/lib/funnel';
import type { ResearchDataHealth } from '@/lib/research-data-health';

interface FunnelResponse {
  snapshots: FunnelSnapshot[];
  history: FunnelSnapshot[];
  researchDataHealth?: ResearchDataHealth;
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
  if (bucket === 'holdings') return 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--pos)]';
  if (bucket === 'movers') return 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--accent)]';
  if (bucket === 'exploration') return 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--warn)]';
  return 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--ink)]';
}

function Metric({ label, value, sub, tone = 'text-[var(--ink)]' }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="border border-[var(--rule)] bg-[var(--panel-alt)] p-4">
      <p className="pm-label">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-[-0.01em] ${tone}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{sub}</p>
    </div>
  );
}

function SnapshotPanel({ snapshot }: { snapshot: FunnelSnapshot }) {
  const enrichedPct =
    snapshot.universe.cataloged && snapshot.universe.sectorEnriched != null
      ? (snapshot.universe.sectorEnriched / snapshot.universe.cataloged) * 100
      : null;

  return (
    <section className="pm-panel border border-[var(--rule)] p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="pm-label">{snapshot.agentId}</p>
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[var(--ink)]">{snapshot.source} funnel</h2>
        </div>
        <p className="pm-label">
          {staleLabel(snapshot.updatedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-[0.16em] sm:grid-cols-4">
        {BUCKETS.map((bucket) => (
          <div key={bucket} className={`border px-3 py-2 ${bucketColor(bucket)}`}>
            <p className="text-[var(--muted)]">{bucket}</p>
            <p className="mt-1 text-lg font-semibold text-[var(--ink)]">{snapshot.slate.counts[bucket]}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Enrichment" value={pct(enrichedPct)} sub={`${num(snapshot.universe.sectorEnriched)} / ${num(snapshot.universe.cataloged)} catalog names`} tone={enrichedPct != null && enrichedPct >= 90 ? 'text-[var(--pos)]' : 'text-[var(--warn)]'} />
        <Metric label="Ledger Coverage" value={pct(snapshot.researchLedger.screenedCoveragePct)} sub={`${num(snapshot.researchLedger.researchedScreened)} / ${num(snapshot.researchLedger.screenedTickers)} screened names`} tone="text-[var(--accent)]" />
        <Metric label="Evaluator Reject" value={pct(snapshot.evaluator.rejectionRatePct)} sub={`${snapshot.evaluator.rejected + snapshot.evaluator.failedClosed} rejected or failed closed / ${snapshot.evaluator.total} verdicts`} tone="text-[var(--warn)]" />
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

function ResearchDataPanel({ health }: { health: ResearchDataHealth | undefined }) {
  const unavailable = !health || health.availability !== 'available';
  const status = health?.researchData;
  const disabled = !unavailable && !health?.researchDataEnabled;
  const missing = !unavailable && health?.researchDataEnabled && !status;
  const completedAt = status?.completedAt ?? status?.startedAt ?? null;
  const tone = status?.state === 'failed' ? 'text-[var(--warn)]' : unavailable || disabled ? 'text-[var(--ink-2)]' : status?.state === 'completed' ? 'text-[var(--pos)]' : 'text-[var(--warn)]';
  const selection = health?.shadowSelection;
  const selectionMode = selection?.mode ?? status?.selectionMode ?? null;
  const selectionPolicy = selection?.policyVersion ?? status?.selectionPolicyVersion ?? null;
  const selectionUnresolved = selection?.policyUnresolved ?? status?.selectionPolicyUnresolved ?? false;
  const selectionCounts = {
    candidates: selection?.candidateCount ?? status?.selectionCandidateCount,
    selected: selection?.selectedCount ?? status?.selectionSelectedCount,
    displaced: selection?.displacedCount ?? status?.selectionDisplacedCount,
    overlap: selection?.overlapCount ?? status?.selectionOverlapCount,
  };
  const reasonCounts = selection?.reasonCodeCounts ?? status?.selectionReasonCodeCounts ?? {};
  return (
    <section className="pm-panel border border-[var(--rule)] p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="pm-label">Advisory data refresh</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.01em] text-[var(--ink)]">Universe → peers → mandate scores</h2>
        </div>
        <p className={`font-mono text-[10px] uppercase tracking-[0.18em] ${tone}`}>{unavailable ? 'Backend unavailable' : disabled ? 'Not enabled' : missing ? 'Awaiting status' : `${status?.state ?? 'unknown'} · ${staleLabel(completedAt)}`}</p>
      </div>
      {unavailable ? (
        <p className="mt-3 text-sm text-[var(--muted)]">{health?.unavailableReason === 'not-configured' ? 'The Portfolio Manager backend is not configured for this dashboard.' : 'The Portfolio Manager health endpoint is unavailable, so workflow state cannot be determined.'}</p>
      ) : disabled ? (
        <p className="mt-3 text-sm text-[var(--muted)]">This advisory workflow stays off until the peer-metrics store is configured. It does not create proposals or touch execution.</p>
      ) : missing ? (
        <p className="mt-3 text-sm text-[var(--warn)]">The workflow is configured, but it has not published a run status yet. The system sentinel will flag this if it persists.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Cataloged" value={num(status?.cataloged)} sub="Universe names" tone="text-[var(--ink)]" />
            <Metric label="Metric Rows" value={num(status?.metricRows)} sub={`${num(status?.classified)} classified`} tone="text-[var(--accent)]" />
            <Metric label="Scored" value={num(status?.scored)} sub={`${num(status?.complete)} complete`} tone="text-[var(--pos)]" />
            <Metric label="Incomplete" value={num(status?.partial)} sub={status?.failureStage ? `Failed: ${status.failureStage}` : `${num(status?.unsupported)} unsupported`} tone={status?.failureStage ? 'text-[var(--warn)]' : 'text-[var(--warn)]'} />
          </div>
          <div className="mt-5 border border-[var(--rule)] bg-[var(--panel-alt)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="pm-label">Shadow selection</p>
              <p className={`font-mono text-[10px] uppercase tracking-[0.16em] ${selectionUnresolved ? 'text-[var(--warn)]' : 'text-[var(--pos)]'}`}>
                {selectionMode ? `${selectionMode} · ${selectionPolicy ?? 'policy unknown'}` : selection?.state === 'not_configured' ? 'Baseline unavailable' : 'Awaiting selection'}
              </p>
            </div>
            {selectionUnresolved && <p className="mt-2 text-xs text-[var(--warn)]">Materiality/event-age policy is unresolved; eligible events remain fail-closed.</p>}
            {selectionMode && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Candidates" value={num(selectionCounts.candidates)} sub="Considered pool" tone="text-[var(--ink)]" />
              <Metric label="Selected" value={num(selectionCounts.selected)} sub="Advisory only" tone="text-[var(--accent)]" />
              <Metric label="Displaced" value={num(selectionCounts.displaced)} sub="Shadow comparison" tone="text-[var(--warn)]" />
              <Metric label="Overlap" value={num(selectionCounts.overlap)} sub="Non-holding only" tone="text-[var(--pos)]" />
            </div>}
            {Object.keys(reasonCounts).length > 0 && <p className="mt-3 font-mono text-[10px] text-[var(--muted)]">{Object.entries(reasonCounts).map(([reason, count]) => `${reason}: ${count}`).join(' · ')}</p>}
          </div>
        </>
      )}
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

  if (loading) return <p className="font-mono text-sm uppercase tracking-[0.24em] text-[var(--pos)]">Loading funnel evidence...</p>;

  if (error) {
    return (
      <section className="pm-panel border border-[var(--rule)] p-6">
        <p className="pm-label">Funnel Feed Offline</p>
        <h1 className="mt-3 text-[22px] font-semibold tracking-[-0.01em] text-[var(--ink)]">No observability data loaded.</h1>
        <p className="mt-4 border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-3 text-sm text-[var(--warn)]">{error}</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="pm-panel border border-[var(--rule)] p-5 sm:p-7">
        <p className="pm-label">Phase 1 Evidence Gate</p>
        <h1 className="max-w-4xl text-[22px] font-semibold tracking-[-0.01em] text-[var(--ink)] sm:text-[22px]">Discovery Funnel</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Live snapshots from the research scan: slate bucket composition, research-ledger coverage, catalog enrichment, and evaluator rejection mix.
        </p>
      </section>

      <ResearchDataPanel health={data?.researchDataHealth} />

      {!data?.snapshots.length ? (
        <section className="pm-panel border border-[var(--rule)] p-5">
          <p className="pm-label">Awaiting First Snapshot</p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Run the scheduled research scan once after this deploy. The Jetson will write `pm:funnel:*` evidence records as each agent finishes.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {data.snapshots.map((snapshot) => <SnapshotPanel key={snapshot.agentId} snapshot={snapshot} />)}
        </div>
      )}

      <section className="pm-panel border border-[var(--rule)] p-5">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="pm-label">Agent-1 Rotation History</p>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[var(--ink)]">Recent slate evidence</h2>
          </div>
          <p className="pm-label">{data?.history.length ?? 0} snapshots retained</p>
        </div>

        {!data?.history.length ? (
          <p className="border border-[var(--rule)] bg-[var(--panel-alt)] p-4 text-sm text-[var(--muted)]">No history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                <tr className="border-b border-[var(--rule)]">
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
                  <tr key={`${row.agentId}-${row.updatedAt}`} className="border-b border-[var(--rule)] text-[var(--ink-2)]">
                    <td className="py-3 pr-4 font-mono text-xs text-[var(--muted)]">{row.date}</td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {BUCKETS.map((b) => `${row.slate.counts[b]} ${b[0]}`).join(' / ')}
                    </td>
                    <td className="py-3 pr-4">{row.aiReview.count}{row.aiReview.budget ? ` / ${row.aiReview.budget}` : ''}</td>
                    <td className="py-3 pr-4">{pct(row.researchLedger.screenedCoveragePct)} coverage, {row.researchLedger.reviewedLast7d} last 7d</td>
                    <td className="py-3 pr-4">{pct(row.evaluator.rejectionRatePct)} reject</td>
                    <td className="py-3 pr-4 font-mono text-xs text-[var(--warn)]">
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
          <Metric label="Screened Pool" value={num(agentOne.universe.screened)} sub="Current mandate-fit names" tone="text-[var(--ink)]" />
          <Metric label="Never Researched" value={num(agentOne.researchLedger.neverResearchedScreened)} sub="Coverage remaining in screened pool" tone="text-[var(--warn)]" />
          <Metric label="This Run" value={num(agentOne.researchLedger.researchedThisRun)} sub="Ledger records added by latest scan" tone="text-[var(--pos)]" />
          <Metric label="Revisions" value={num(agentOne.evaluator.revised)} sub="Evaluator forced generator revision" tone="text-[var(--accent)]" />
        </section>
      )}
    </div>
  );
}
