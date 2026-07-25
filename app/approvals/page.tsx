'use client';

import { useEffect, useMemo, useState } from 'react';
import { AGENTS } from '@/lib/agents';
import {
  NO_REASON_REJECTION,
  partitionProposalsForView,
  type AllocationProposal,
  type ProposalSide,
  type ProposalStatus,
} from '@/lib/proposals';
import ProposalCard, { agentLabel } from '@/components/approvals/ProposalCard';

interface Agent4Decision {
  proposalId: string;
  outcome: 'ACCEPT' | 'REJECT';
  explanation: string[];
  policyVersion: string;
  decidedAt: string;
}

interface Draft {
  agentId: string;
  ticker: string;
  side: ProposalSide;
  amountDollars: string;
  maxPrice: string;
  rationale: string;
  riskSummary: string;
}

const INITIAL_DRAFT: Draft = {
  agentId: AGENTS[0].id,
  ticker: '',
  side: 'BUY',
  amountDollars: '',
  maxPrice: '',
  rationale: '',
  riskSummary: '',
};

const REJECT_REASONS = [
  NO_REASON_REJECTION,
  "I didn't like this proposal.",
  'Liked another proposal better.',
] as const;

type Tab = 'active' | 'history';

interface AgentResearchScanSummary {
  agentId: string;
  status: 'running' | 'completed' | 'failed';
  recommendationsWritten: number;
  attemptedReviews: number;
  actionCounts: {
    BUY: number;
    SELL: number;
    HOLD: number;
  };
  proposalsCreated: number;
  proposalCounts: {
    BUY: number;
    SELL: number;
  };
  scanErrors: number;
  evaluatorRejects: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

interface ResearchScanSummary {
  source: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  agents: AgentResearchScanSummary[];
  totals?: {
    recommendationsWritten: number;
    attemptedReviews: number;
    proposalsCreated: number;
    scanErrors: number;
    evaluatorRejects: number;
  };
  error: string | null;
}

// History filter chips. "Fulfilled" is derived (fulfilledAt set); the status
// filters exclude fulfilled proposals so the two don't overlap.
type HistoryFilter = 'All' | 'Fulfilled' | Exclude<ProposalStatus, 'Pending'>;

const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'All', label: 'All' },
  { id: 'ApprovedForBrokerReview', label: 'Accepted' },
  { id: 'Fulfilled', label: 'Fulfilled' },
  { id: 'Rejected', label: 'Rejected' },
  { id: 'Expired', label: 'Expired' },
];

function matchesHistoryFilter(proposal: AllocationProposal, filter: HistoryFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Fulfilled') return !!proposal.fulfilledAt;
  return proposal.status === filter && !proposal.fulfilledAt;
}

function formatRunTime(value: string | null): string {
  if (!value) return 'In progress';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function describeAgentScan(agent: AgentResearchScanSummary): string {
  if (agent.status === 'failed') return agent.error || 'Agent failed before writing a result.';
  if (agent.status === 'running') return 'Research is still running.';
  const pieces = [
    `${agent.actionCounts.HOLD} hold${agent.actionCounts.HOLD === 1 ? '' : 's'}`,
    agent.actionCounts.BUY ? `${agent.actionCounts.BUY} buy signal${agent.actionCounts.BUY === 1 ? '' : 's'}` : null,
    agent.actionCounts.SELL ? `${agent.actionCounts.SELL} sell signal${agent.actionCounts.SELL === 1 ? '' : 's'}` : null,
    `${agent.proposalsCreated} proposal${agent.proposalsCreated === 1 ? '' : 's'}`,
  ].filter(Boolean);
  return pieces.join(' · ');
}

function ResearchRunSummaryCard({ scan }: { scan: ResearchScanSummary | null }) {
  const completedAt = scan?.completedAt ?? null;
  const statusTone =
    scan?.status === 'failed'
      ? 'border-red-300/35 bg-red-300/[0.06] text-red-100'
      : scan?.status === 'running'
        ? 'border-cyan-300/35 bg-cyan-300/[0.06] text-cyan-100'
        : 'border-emerald-300/25 bg-emerald-300/[0.05] text-emerald-100';

  return (
    <section className="terminal-panel p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">
            Latest Research Run
          </p>
          <h2 className="text-xl font-black tracking-[-0.03em] text-white">
            {scan ? formatRunTime(scan.status === 'running' ? scan.startedAt : completedAt) : 'No run recorded yet'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {scan
              ? `${scan.source === 'manual' ? 'Run Research button' : 'Scheduled scan'} · ${scan.totals?.recommendationsWritten ?? 0} recommendations · ${scan.totals?.proposalsCreated ?? 0} proposals`
              : 'Run research once to populate this status.'}
          </p>
        </div>
        <div className={`w-fit border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] ${statusTone}`}>
          {scan?.status ?? 'waiting'}
        </div>
      </div>

      {scan?.error && <p className="mt-3 text-sm text-red-200">{scan.error}</p>}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {AGENTS.map((agent) => {
          const summary = scan?.agents.find((item) => item.agentId === agent.id);
          return (
            <div key={agent.id} className="border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  {agentLabel(agent.id)}
                </p>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  {summary ? `${summary.recommendationsWritten}/${summary.attemptedReviews}` : 'no data'}
                </span>
              </div>
              <p className="text-sm text-slate-200">
                {summary ? describeAgentScan(summary) : 'No result recorded for this agent.'}
              </p>
              {summary && (summary.scanErrors > 0 || summary.evaluatorRejects > 0) && (
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200/80">
                  {summary.scanErrors ? `${summary.scanErrors} scan error${summary.scanErrors === 1 ? '' : 's'}` : ''}
                  {summary.scanErrors && summary.evaluatorRejects ? ' · ' : ''}
                  {summary.evaluatorRejects ? `${summary.evaluatorRejects} evaluator reject${summary.evaluatorRejects === 1 ? '' : 's'}` : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ApprovalsPage() {
  const [proposals, setProposals] = useState<AllocationProposal[]>([]);
  const [researchScan, setResearchScan] = useState<ResearchScanSummary | null>(null);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [showCustomReason, setShowCustomReason] = useState(false);
  const [executorOnline, setExecutorOnline] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('active');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('All');
  const [agent4Decisions, setAgent4Decisions] = useState<Record<string, Agent4Decision>>({});

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // View-only split: Pending + accepted-awaiting-execution + decided within 7
  // days stay on the Active tab; older decided/expired/fulfilled proposals move
  // to History. Nothing is deleted — everything stays in Redis.
  const { active: activeProposals, archive: archivedProposals } = useMemo(
    () => partitionProposalsForView(proposals),
    [proposals]
  );
  const filteredArchive = useMemo(
    () => archivedProposals.filter((p) => matchesHistoryFilter(p, historyFilter)),
    [archivedProposals, historyFilter]
  );
  const pendingCount = useMemo(() => proposals.filter((p) => p.status === 'Pending').length, [proposals]);

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/proposals');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to load proposals');
      setProposals(json.proposals ?? []);
      setResearchScan(json.researchScan ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portfolio-manager', { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data?.decisions) return;
        setAgent4Decisions(Object.fromEntries(data.decisions.map((decision: Agent4Decision) => [decision.proposalId, decision])));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Executor (Mac companion) liveness — approved proposals only execute while
  // it's awake, so a stale heartbeat with accepted-unfilled proposals means
  // "nothing is listening" and deserves a banner, not silence.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('/api/companion/trigger');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setExecutorOnline(Boolean(json.online));
      } catch {
        /* leave unknown */
      }
    }
    check();
    const interval = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const awaitingExecution = useMemo(
    () => proposals.filter((p) => p.status === 'ApprovedForBrokerReview' && !p.fulfilledAt).length,
    [proposals]
  );

  async function createProposal() {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to create proposal');
      setProposals((current) => [json.proposal, ...current]);
      setDraft(INITIAL_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function decide(id: string, status: Exclude<ProposalStatus, 'Pending'>, note?: string) {
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          note:
            note ??
            (status === 'ApprovedForBrokerReview'
              ? 'Accepted by FundManager for broker review. Dashboard did not submit this order.'
              : 'Rejected by FundManager.'),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to update proposal');
      setProposals((current) => current.map((p) => (p.id === id ? json.proposal : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  function startReject(id: string) {
    setRejectingId(id);
    setCustomReason('');
    setShowCustomReason(false);
  }

  function cancelReject() {
    setRejectingId(null);
    setCustomReason('');
    setShowCustomReason(false);
  }

  async function submitReject(reason: string) {
    if (!rejectingId) return;
    const id = rejectingId;
    setRejectingId(null);
    setShowCustomReason(false);
    setCustomReason('');
    await decide(id, 'Rejected', reason);
  }

  return (
    <div className="max-w-6xl space-y-6">
      <section className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Agent 4 · Approval Queue</p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-serif text-4xl font-semibold tracking-[-0.04em] text-white">Approval desk</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Review each specialist recommendation alongside Agent 4&apos;s independent portfolio check. Your
              approval remains the only authorization sent to the execution queue.
            </p>
          </div>
          <div className="border border-amber-200/20 bg-amber-200/[0.04] px-4 py-3 font-mono text-xs uppercase tracking-[0.16em] text-amber-100">
            {pendingCount} pending
          </div>
        </div>
      </section>

      {error && <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      <ResearchRunSummaryCard scan={researchScan} />

      {executorOnline === false && awaitingExecution > 0 && (
        <p className="border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          ⚠ The trade executor is offline (Mac companion heartbeat is stale) — {awaitingExecution} accepted{' '}
          {awaitingExecution === 1 ? 'proposal is' : 'proposals are'} waiting and nothing is listening. Wake the Mac
          running <span className="font-mono">portfolio-executor</span> to resume execution.
        </p>
      )}

      <div className="flex gap-2 border-b border-white/10">
        <button
          onClick={() => setTab('active')}
          className={`-mb-px border-b-2 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.2em] transition-colors ${
            tab === 'active'
              ? 'border-emerald-300/70 text-emerald-200'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Active{activeProposals.length > 0 ? ` (${activeProposals.length})` : ''}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`-mb-px border-b-2 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.2em] transition-colors ${
            tab === 'history'
              ? 'border-emerald-300/70 text-emerald-200'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          History{archivedProposals.length > 0 ? ` (${archivedProposals.length})` : ''}
        </button>
      </div>

      {tab === 'active' && (
        <>
          <section className="terminal-panel p-5">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">New Proposal</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Agent</span>
                <select
                  value={draft.agentId}
                  onChange={(e) => setDraft((d) => ({ ...d, agentId: e.target.value }))}
                  className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white focus:border-emerald-300/50 focus:outline-none"
                >
                  {AGENTS.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agentLabel(agent.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Ticker</span>
                <input
                  value={draft.ticker}
                  onChange={(e) => setDraft((d) => ({ ...d, ticker: e.target.value.toUpperCase() }))}
                  placeholder="VTI"
                  className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm uppercase text-white placeholder:text-slate-600 focus:border-emerald-300/50 focus:outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Side</span>
                <select
                  value={draft.side}
                  onChange={(e) => setDraft((d) => ({ ...d, side: e.target.value as ProposalSide }))}
                  className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white focus:border-emerald-300/50 focus:outline-none"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Dollars</span>
                <input
                  value={draft.amountDollars}
                  onChange={(e) => setDraft((d) => ({ ...d, amountDollars: e.target.value }))}
                  inputMode="decimal"
                  placeholder="2500"
                  className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-emerald-300/50 focus:outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Max Price</span>
                <input
                  value={draft.maxPrice}
                  onChange={(e) => setDraft((d) => ({ ...d, maxPrice: e.target.value }))}
                  inputMode="decimal"
                  placeholder="optional"
                  className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-emerald-300/50 focus:outline-none"
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <textarea
                value={draft.rationale}
                onChange={(e) => setDraft((d) => ({ ...d, rationale: e.target.value }))}
                rows={4}
                placeholder="Why this allocation belongs in the portfolio..."
                className="resize-none border border-white/10 bg-black/30 p-3 text-sm leading-6 text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/50 focus:outline-none"
              />
              <textarea
                value={draft.riskSummary}
                onChange={(e) => setDraft((d) => ({ ...d, riskSummary: e.target.value }))}
                rows={4}
                placeholder="Sizing, liquidity, concentration, and downside notes..."
                className="resize-none border border-white/10 bg-black/30 p-3 text-sm leading-6 text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/50 focus:outline-none"
              />
            </div>

            <button
              onClick={createProposal}
              disabled={saving}
              className="mt-4 border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Queue Proposal'}
            </button>
          </section>

          <section className="space-y-3">
            {loading ? (
              <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading proposals...</p>
            ) : activeProposals.length === 0 ? (
              <p className="terminal-panel p-5 text-sm text-slate-400">
                No active proposals. Older decisions live in the History tab.
              </p>
            ) : (
              activeProposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  expanded={expandedIds.has(proposal.id)}
                  onToggleExpanded={toggleExpanded}
                  onAccept={(id) => decide(id, 'ApprovedForBrokerReview')}
                  onReject={startReject}
                  agent4Decision={agent4Decisions[proposal.id]}
                />
              ))
            )}
          </section>
        </>
      )}

      {tab === 'history' && (
        <>
          <div className="flex flex-wrap gap-2">
            {HISTORY_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setHistoryFilter(id)}
                className={`border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                  historyFilter === id
                    ? 'border-cyan-300/40 bg-cyan-300/[0.08] text-cyan-100'
                    : 'border-white/10 bg-white/[0.02] text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <section className="space-y-3">
            {loading ? (
              <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading proposals...</p>
            ) : filteredArchive.length === 0 ? (
              <p className="terminal-panel p-5 text-sm text-slate-400">
                {archivedProposals.length === 0
                  ? 'Nothing archived yet — decided proposals move here 7 days after their decision.'
                  : 'No archived proposals match this filter.'}
              </p>
            ) : (
              filteredArchive.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  expanded={expandedIds.has(proposal.id)}
                  onToggleExpanded={toggleExpanded}
                  agent4Decision={agent4Decisions[proposal.id]}
                />
              ))
            )}
          </section>
        </>
      )}

      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={cancelReject}>
          <div
            className="terminal-panel w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.24em] text-red-200/70">Reject Proposal</p>
            <h2 className="mb-4 text-lg font-bold text-white">Why did you reject this proposal?</h2>
            <div className="space-y-2">
              {REJECT_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => submitReject(reason)}
                  className="w-full border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-slate-200 hover:border-red-300/35 hover:bg-red-300/[0.06]"
                >
                  {reason}
                </button>
              ))}
              {!showCustomReason ? (
                <button
                  onClick={() => setShowCustomReason(true)}
                  className="w-full border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-slate-200 hover:border-red-300/35 hover:bg-red-300/[0.06]"
                >
                  Other (type a reason)
                </button>
              ) : (
                <div className="space-y-2 border border-white/10 bg-white/[0.03] p-3">
                  <textarea
                    autoFocus
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    rows={3}
                    placeholder="Type your reason..."
                    className="w-full resize-none border border-white/10 bg-black/30 p-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-red-300/50 focus:outline-none"
                  />
                  <button
                    onClick={() => submitReject(customReason.trim() || 'No reason given.')}
                    disabled={!customReason.trim()}
                    className="border border-red-300/35 bg-red-300/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-red-200 hover:bg-red-300/15 disabled:opacity-40"
                  >
                    Submit Reason
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={cancelReject}
              className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500 hover:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
