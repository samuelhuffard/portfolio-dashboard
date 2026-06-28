'use client';

import { useEffect, useMemo, useState } from 'react';
import { AGENTS } from '@/lib/agents';
import { fmtCurrency } from '@/lib/format';
import type { AllocationProposal, ProposalSide, ProposalStatus } from '@/lib/proposals';

const STATUS_STYLES: Record<ProposalStatus, string> = {
  Pending: 'border-amber-200/30 bg-amber-200/[0.06] text-amber-100',
  ApprovedForBrokerReview: 'border-emerald-300/30 bg-emerald-300/[0.06] text-emerald-100',
  Rejected: 'border-red-300/30 bg-red-300/[0.06] text-red-100',
};

const STATUS_LABELS: Record<ProposalStatus, string> = {
  Pending: 'Pending',
  ApprovedForBrokerReview: 'Approved for MCP execution',
  Rejected: 'Rejected',
};

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

export default function ApprovalsPage() {
  const [proposals, setProposals] = useState<AllocationProposal[]>([]);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function decide(id: string, status: Exclude<ProposalStatus, 'Pending'>) {
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          note:
            status === 'ApprovedForBrokerReview'
              ? 'Approved by FundManager for Robinhood MCP execution. Dashboard did not submit this order.'
              : 'Rejected by FundManager.',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to update proposal');
      setProposals((current) => current.map((p) => (p.id === id ? json.proposal : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <section className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Approval Queue</p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Proposed Allocations</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Research agents can inform these tickets, but approval here only records manager authorization.
              The dashboard does not submit anything to Robinhood or move money.
            </p>
          </div>
          <div className="border border-amber-200/20 bg-amber-200/[0.04] px-4 py-3 font-mono text-xs uppercase tracking-[0.16em] text-amber-100">
            {pendingCount} pending
          </div>
        </div>
      </section>

      {error && <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

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
        ) : proposals.length === 0 ? (
          <p className="terminal-panel p-5 text-sm text-slate-400">No proposals queued yet.</p>
        ) : (
          proposals.map((proposal) => (
            <article key={proposal.id} className="terminal-panel p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">{agentLabel(proposal.agentId)}</span>
                    <span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${STATUS_STYLES[proposal.status]}`}>
                      {STATUS_LABELS[proposal.status]}
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
                      Approve
                    </button>
                    <button
                      onClick={() => decide(proposal.id, 'Rejected')}
                      className="border border-red-300/35 bg-red-300/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-red-200 hover:bg-red-300/15"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="border border-white/10 bg-white/[0.025] p-3">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">Rationale</p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{proposal.rationale}</p>
                </div>
                <div className="border border-white/10 bg-white/[0.025] p-3">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-200/70">Risk Notes</p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{proposal.riskSummary || 'No risk notes recorded.'}</p>
                </div>
              </div>

              {proposal.decisionNote && (
                <p className="mt-3 border border-white/10 bg-white/[0.025] px-3 py-2 text-xs leading-5 text-slate-400">
                  {proposal.decisionNote}
                </p>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
