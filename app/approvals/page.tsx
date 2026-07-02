'use client';

import { useEffect, useMemo, useState } from 'react';
import { AGENTS } from '@/lib/agents';
import { fmtCurrency } from '@/lib/format';
import { NO_REASON_REJECTION, type AllocationProposal, type ProposalSide, type ProposalStatus } from '@/lib/proposals';

const SIGNAL_KEYWORDS: { label: string; terms: string[] }[] = [
  { label: 'MOMENTUM', terms: ['momentum', 'breakout', 'surge', 'rally', 'acceleration'] },
  { label: 'EARNINGS', terms: ['earnings', 'eps', 'beat', 'revenue', 'guidance'] },
  { label: 'CATALYST', terms: ['catalyst', 'event', 'merger', 'acquisition', 'spinoff', 'announcement'] },
  { label: 'VALUE', terms: ['undervalued', 'value', 'cheap', 'discount', 'p/e', 'pe ratio'] },
  { label: 'GROWTH', terms: ['growth', 'expanding', 'market share', 'compounding'] },
  { label: 'TECHNICAL', terms: ['technical', 'moving average', 'support', 'resistance', 'rsi', 'macd', 'chart'] },
  { label: 'MACRO', terms: ['macro', 'fed', 'rate', 'inflation', 'gdp', 'recession', 'cycle'] },
  { label: 'SECTOR', terms: ['sector', 'rotation', 'industry', 'thematic'] },
  { label: 'TREND', terms: ['trend', 'uptrend', 'bullish', 'bearish', 'regime'] },
  { label: 'HEDGE', terms: ['hedge', 'defensive', 'volatility', 'downside protection', 'risk-off'] },
];

function extractSignals(text: string): string[] {
  const lower = text.toLowerCase();
  return SIGNAL_KEYWORDS.filter(({ terms }) => terms.some((t) => lower.includes(t))).map(({ label }) => label);
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?\n]+[.!?]?/);
  return match ? match[0].trim() : text.slice(0, 140);
}

const STATUS_STYLES: Record<ProposalStatus, string> = {
  Pending: 'border-amber-200/30 bg-amber-200/[0.06] text-amber-100',
  ApprovedForBrokerReview: 'border-emerald-300/30 bg-emerald-300/[0.06] text-emerald-100',
  Rejected: 'border-red-300/30 bg-red-300/[0.06] text-red-100',
  Expired: 'border-white/15 bg-white/[0.04] text-white/50',
};

const STATUS_LABELS: Record<ProposalStatus, string> = {
  Pending: 'Pending',
  ApprovedForBrokerReview: 'Accepted for broker review',
  Rejected: 'Rejected',
  Expired: 'Expired (48h)',
};

function proposalStatusLabel(proposal: AllocationProposal): string {
  if (proposal.fulfilledAt) return 'Fulfilled / tracked';
  return STATUS_LABELS[proposal.status];
}

function agentLabel(id: string): string {
  const agent = AGENTS.find((a) => a.id === id);
  return agent?.name || `Agent ${id.split('-')[1]}`;
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

export default function ApprovalsPage() {
  const [proposals, setProposals] = useState<AllocationProposal[]>([]);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [showCustomReason, setShowCustomReason] = useState(false);
  const [executorOnline, setExecutorOnline] = useState<boolean | null>(null);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleProposals = useMemo(() => proposals.filter((p) => p.status !== 'Rejected'), [proposals]);
  const pendingCount = useMemo(() => proposals.filter((p) => p.status === 'Pending').length, [proposals]);

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/proposals');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to load proposals');
      setProposals(json.proposals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
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
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Approval Queue</p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Proposed Allocations</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Accepting a proposal authorizes it for execution: the Mac executor picks it up and places the
              order through the Robinhood MCP, then records the fill. The dashboard itself never submits
              orders — it only records signed manager authorization.
            </p>
          </div>
          <div className="border border-amber-200/20 bg-amber-200/[0.04] px-4 py-3 font-mono text-xs uppercase tracking-[0.16em] text-amber-100">
            {pendingCount} pending
          </div>
        </div>
      </section>

      {error && <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      {executorOnline === false && awaitingExecution > 0 && (
        <p className="border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          ⚠ The trade executor is offline (Mac companion heartbeat is stale) — {awaitingExecution} accepted{' '}
          {awaitingExecution === 1 ? 'proposal is' : 'proposals are'} waiting and nothing is listening. Wake the Mac
          running <span className="font-mono">portfolio-executor</span> to resume execution.
        </p>
      )}

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
        ) : visibleProposals.length === 0 ? (
          <p className="terminal-panel p-5 text-sm text-slate-400">No proposals queued yet.</p>
        ) : (
          visibleProposals.map((proposal) => (
            <article key={proposal.id} className="terminal-panel p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">{agentLabel(proposal.agentId)}</span>
                    <span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${STATUS_STYLES[proposal.status]}`}>
                      {proposalStatusLabel(proposal)}
                    </span>
                  </div>
                  <h2 className="font-mono text-2xl font-black tracking-[-0.03em] text-white">
                    {proposal.side} {proposal.ticker} - {fmtCurrency(proposal.amountDollars)}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    Max price: {proposal.maxPrice == null ? 'none set' : fmtCurrency(proposal.maxPrice)} - Created {new Date(proposal.createdAt).toLocaleString()}
                  </p>
                </div>
                {proposal.status === 'Pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => decide(proposal.id, 'ApprovedForBrokerReview')}
                      className="border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-emerald-200 hover:bg-emerald-300/15"
                    >
                      Accept Proposal
                    </button>
                    <button
                      onClick={() => startReject(proposal.id)}
                      className="border border-red-300/35 bg-red-300/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-red-200 hover:bg-red-300/15"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4">
                {(() => {
                  const isExpanded = expandedIds.has(proposal.id);
                  const signals = extractSignals(proposal.rationale + ' ' + proposal.riskSummary);
                  const hook = firstSentence(proposal.rationale);
                  const hasMore = proposal.rationale.trim().length > hook.length + 2 || !!proposal.riskSummary;
                  return (
                    <>
                      <div className="border border-white/10 bg-white/[0.025] p-3">
                        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">Rationale</p>
                        <p className="text-sm leading-6 text-slate-200">{hook}</p>
                        {signals.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {signals.map((s) => (
                              <span
                                key={s}
                                className="border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-200/60"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                        {hasMore && (
                          <button
                            onClick={() => toggleExpanded(proposal.id)}
                            className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500 transition-colors hover:text-slate-300"
                          >
                            {isExpanded ? '↑ collapse' : '↓ full rationale'}
                          </button>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="mt-2 grid gap-2 lg:grid-cols-2">
                          <div className="border border-white/10 bg-white/[0.025] p-3">
                            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200/50">Full Rationale</p>
                            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{proposal.rationale}</p>
                          </div>
                          <div className="border border-white/10 bg-white/[0.025] p-3">
                            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-200/70">Risk Notes</p>
                            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{proposal.riskSummary || 'No risk notes recorded.'}</p>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {proposal.decisionNote && (
                <p className="mt-3 border border-white/10 bg-white/[0.025] px-3 py-2 text-xs leading-5 text-slate-400">
                  {proposal.decisionNote}
                </p>
              )}
              {proposal.fulfilledAt && (
                <p className="mt-3 border border-emerald-300/20 bg-emerald-300/[0.04] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200/80">
                  Executed {new Date(proposal.fulfilledAt).toLocaleString()}
                  {proposal.fulfilledOrderId ? ` · order ${proposal.fulfilledOrderId}` : ''}
                  {proposal.fulfilledShares != null ? ` · ${proposal.fulfilledShares} shares` : ''}
                </p>
              )}
            </article>
          ))
        )}
      </section>

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
