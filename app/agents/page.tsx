'use client';

import { useEffect, useRef, useState } from 'react';
import { AGENTS } from '@/lib/agents';
import { fmtCurrency } from '@/lib/format';
import type { ChatMessage } from '@/lib/agentChat';
import type { AgentBook } from '@/lib/agent-books';
import type { AgentMemory } from '@/lib/agentMemory';
import type { AllocationProposal, ProposalSide, ProposalStatus } from '@/lib/proposals';

// ─── shared helpers ──────────────────────────────────────────────────────────

function agentLabel(id: string): string {
  const agent = AGENTS.find((a) => a.id === id);
  if (agent?.name) return agent.name;
  return `Agent ${id.split('-')[1]}`;
}

function fmtUsd(value: number | null): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
}

// ─── types ───────────────────────────────────────────────────────────────────

interface PriceAlert {
  id: string;
  agentId: string;
  ticker: string;
  direction: 'below' | 'above';
  targetPrice: number;
  note: string;
  createdAt: string;
}

type SectionTab = 'alerts' | 'proposals' | 'chat' | 'memory';

// ─── proposal signal chips (mirrors approvals page) ──────────────────────────

const SIGNAL_KEYWORDS: { label: string; terms: string[] }[] = [
  { label: 'MOMENTUM', terms: ['momentum', 'breakout', 'surge', 'rally', 'acceleration'] },
  { label: 'EARNINGS', terms: ['earnings', 'eps', 'beat', 'revenue', 'guidance'] },
  { label: 'CATALYST', terms: ['catalyst', 'event', 'merger', 'acquisition', 'spinoff', 'announcement'] },
  { label: 'VALUE', terms: ['undervalued', 'value', 'cheap', 'discount', 'p/e', 'pe ratio'] },
  { label: 'GROWTH', terms: ['growth', 'expanding', 'market share', 'compounding'] },
  { label: 'TECHNICAL', terms: ['technical', 'moving average', 'support', 'resistance', 'rsi', 'macd', 'chart'] },
  { label: 'MACRO', terms: ['macro', 'fed', 'rate', 'inflation', 'gdp', 'recession', 'cycle'] },
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
};

const STATUS_LABELS: Record<ProposalStatus, string> = {
  Pending: 'Pending',
  ApprovedForBrokerReview: 'Accepted',
  Rejected: 'Rejected',
};

function proposalStatusLabel(proposal: AllocationProposal): string {
  if (proposal.fulfilledAt) return 'Tracked';
  return STATUS_LABELS[proposal.status];
}

const DIRECTION_STYLES = {
  below: 'border-cyan-300/30 bg-cyan-300/[0.06] text-cyan-100',
  above: 'border-emerald-300/30 bg-emerald-300/[0.06] text-emerald-100',
};

// ─── AgentBook strip ─────────────────────────────────────────────────────────

function AgentBookStrip({ agentId }: { agentId: string }) {
  const [book, setBook] = useState<AgentBook | null>(null);

  useEffect(() => {
    setBook(null);
    function load() {
      fetch(`/api/agents/${agentId}/book`)
        .then((r) => r.json())
        .then((j) => { if (!j.error) setBook(j.book); })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 300_000);
    return () => clearInterval(id);
  }, [agentId]);

  if (!book) return null;

  return (
    <div className="flex flex-wrap gap-6 border border-white/10 bg-white/[0.025] px-4 py-3 font-mono text-xs">
      <span className="text-slate-500">
        Unrealized <span className={book.unrealizedGain >= 0 ? 'text-emerald-300' : 'text-red-300'}>{fmtUsd(book.unrealizedGain)}</span>
      </span>
      <span className="text-slate-500">
        Realized <span className={book.realizedGain >= 0 ? 'text-emerald-300' : 'text-red-300'}>{fmtUsd(book.realizedGain)}</span>
      </span>
      <span className="text-slate-500">
        Win rate <span className="text-slate-200">{book.winRatePct != null ? `${book.winRatePct}%` : '—'}</span>
        <span className="text-slate-600"> ({book.closedTradeCount} closed)</span>
      </span>
      {book.positions.map((p) => (
        <span key={p.ticker} className="text-slate-500">
          {p.ticker} <span className={(p.unrealizedGain ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}>{fmtUsd(p.unrealizedGain)}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Alerts section ───────────────────────────────────────────────────────────

function AlertsSection({ agentId }: { agentId: string }) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState('');
  const [direction, setDirection] = useState<'below' | 'above'>('below');
  const [targetPrice, setTargetPrice] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/alerts')
      .then((r) => r.json())
      .then((j) => { if (!j.error) setAlerts(j.alerts ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  const agentAlerts = alerts.filter((a) => a.agentId === agentId);

  async function addAlert() {
    if (saving || !ticker || !targetPrice) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, ticker: ticker.toUpperCase(), direction, targetPrice: parseFloat(targetPrice), note }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to create alert');
      setAlerts((prev) => [...prev, json.alert]);
      setTicker(''); setTargetPrice(''); setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAlert(id: string) {
    try {
      await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="terminal-panel p-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">New Alert</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Ticker</span>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="NVDA"
              className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm uppercase text-white placeholder:text-slate-600 focus:border-cyan-300/50 focus:outline-none" />
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Direction</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'below' | 'above')}
              className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white focus:border-cyan-300/50 focus:outline-none">
              <option value="below">Falls below</option>
              <option value="above">Rises above</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Target Price</span>
            <input value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} inputMode="decimal" placeholder="185.00"
              className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-cyan-300/50 focus:outline-none" />
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional"
              className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-cyan-300/50 focus:outline-none" />
          </label>
        </div>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <button onClick={addAlert} disabled={saving || !ticker || !targetPrice}
          className="mt-3 border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:bg-cyan-300/15 disabled:opacity-40">
          {saving ? 'Setting...' : 'Set Alert'}
        </button>
      </div>

      {loading ? (
        <p className="font-mono text-sm uppercase tracking-[0.24em] text-cyan-200">Loading...</p>
      ) : agentAlerts.length === 0 ? (
        <p className="terminal-panel p-5 text-sm text-slate-400">No alerts set for this agent.</p>
      ) : (
        <div className="space-y-2">
          {agentAlerts.map((alert) => (
            <article key={alert.id} className="terminal-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xl font-black tracking-[-0.03em] text-white">{alert.ticker}</span>
                  <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] ${DIRECTION_STYLES[alert.direction]}`}>
                    {alert.direction === 'below' ? '↓ below' : '↑ above'}
                  </span>
                  <span className="font-mono text-base font-semibold text-white">${alert.targetPrice.toFixed(2)}</span>
                  {alert.note && <span className="text-sm text-slate-400">{alert.note}</span>}
                </div>
                <button onClick={() => deleteAlert(alert.id)}
                  className="border border-red-300/25 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-red-300 hover:border-red-300/50 transition-colors">
                  Remove
                </button>
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-slate-600">
                Set {new Date(alert.createdAt).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Robinhood connect banner ─────────────────────────────────────────────────

function CompanionStatusBanner() {
  return (
    <div className="flex items-center gap-2 border border-emerald-300/20 bg-emerald-300/[0.04] px-4 py-2">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300/80">
        Mac companion active · Robinhood ••••4149
      </span>
    </div>
  );
}

// ─── Proposals section ────────────────────────────────────────────────────────

interface ExecutePreview {
  proposal: AllocationProposal;
  livePrice: number | null;
  estimatedShares: number | null;
  maxPriceBreached: boolean;
  accountNumber: string;
}

interface ProposalEditDraft {
  ticker: string;
  side: ProposalSide;
  amountDollars: string;
  maxPrice: string;
  rationale: string;
  riskSummary: string;
}

function proposalToEditDraft(p: AllocationProposal): ProposalEditDraft {
  return {
    ticker: p.ticker,
    side: p.side,
    amountDollars: String(p.amountDollars),
    maxPrice: p.maxPrice != null ? String(p.maxPrice) : '',
    rationale: p.rationale,
    riskSummary: p.riskSummary,
  };
}

function ProposalsSection({ agentId, refreshKey, onProposalUpdated }: { agentId: string; refreshKey: number; onProposalUpdated: (p: AllocationProposal) => void }) {
  const [proposals, setProposals] = useState<AllocationProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ProposalEditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function startEdit(proposal: AllocationProposal) {
    setEditingId(proposal.id);
    setEditDraft(proposalToEditDraft(proposal));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  }

  useEffect(() => {
    setLoading(true);
    setEditingId(null);
    setEditDraft(null);
    function load(initial = false) {
      fetch('/api/proposals')
        .then((r) => r.json())
        .then((j) => {
          if (j.error) setError(j.error);
          else setProposals(j.proposals ?? []);
        })
        .catch((err) => setError(err.message))
        .finally(() => { if (initial) setLoading(false); });
    }
    load(true);
    const id = setInterval(() => load(false), 300_000);
    return () => clearInterval(id);
  }, [agentId, refreshKey]);

  async function decide(id: string, status: Exclude<ProposalStatus, 'Pending'>) {
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          note: status === 'ApprovedForBrokerReview' ? 'Accepted for broker review. Dashboard did not submit this order.' : 'Rejected.',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error);
      setProposals((prev) => prev.map((p) => (p.id === id ? json.proposal : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function saveEdit(id: string) {
    if (!editDraft || saving) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: editDraft.ticker,
          side: editDraft.side,
          amountDollars: editDraft.amountDollars,
          maxPrice: editDraft.maxPrice || null,
          rationale: editDraft.rationale,
          riskSummary: editDraft.riskSummary,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error);
      setProposals((prev) => prev.map((p) => (p.id === id ? json.proposal : p)));
      onProposalUpdated(json.proposal);
      setEditingId(null);
      setEditDraft(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function triggerCompanion() {
    if (triggering) return;
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const res = await fetch('/api/companion/trigger', { method: 'POST' });
      const json = await res.json();
      setTriggerMsg(json.ok ? 'Companion triggered — check pm2 logs.' : (json.error ?? 'Failed'));
    } catch {
      setTriggerMsg('Failed to reach trigger endpoint');
    } finally {
      setTriggering(false);
    }
  }

  const agentProposals = proposals.filter((p) => p.agentId === agentId);

  if (loading) return <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading...</p>;
  if (error) return <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>;
  if (agentProposals.length === 0) return <p className="terminal-panel p-5 text-sm text-slate-400">No proposals from this agent.</p>;

  return (
    <div className="space-y-2">
      {triggerMsg && (
        <p className="border border-cyan-300/20 bg-cyan-300/[0.04] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200/80">{triggerMsg}</p>
      )}

      {agentProposals.map((proposal) => {
        const isEditing = editingId === proposal.id;
        const isExpanded = expandedIds.has(proposal.id);
        const signals = extractSignals(proposal.rationale + ' ' + proposal.riskSummary);
        const hook = firstSentence(proposal.rationale);
        const hasMore = proposal.rationale.trim().length > hook.length + 2 || !!proposal.riskSummary;
        return (
          <article key={proposal.id} className="terminal-panel p-4">
            {isEditing && editDraft ? (
              /* ── edit mode ── */
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">Editing Proposal</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Ticker</span>
                    <input value={editDraft.ticker} onChange={(e) => setEditDraft((d) => d && ({ ...d, ticker: e.target.value.toUpperCase() }))}
                      className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm uppercase text-white placeholder:text-slate-600 focus:border-cyan-300/50 focus:outline-none" />
                  </label>
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Side</span>
                    <select value={editDraft.side} onChange={(e) => setEditDraft((d) => d && ({ ...d, side: e.target.value as ProposalSide }))}
                      className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white focus:border-cyan-300/50 focus:outline-none">
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Dollars</span>
                    <input value={editDraft.amountDollars} onChange={(e) => setEditDraft((d) => d && ({ ...d, amountDollars: e.target.value }))}
                      inputMode="decimal"
                      className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-cyan-300/50 focus:outline-none" />
                  </label>
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Max Price</span>
                    <input value={editDraft.maxPrice} onChange={(e) => setEditDraft((d) => d && ({ ...d, maxPrice: e.target.value }))}
                      inputMode="decimal" placeholder="none"
                      className="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-cyan-300/50 focus:outline-none" />
                  </label>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Rationale</span>
                    <textarea value={editDraft.rationale} onChange={(e) => setEditDraft((d) => d && ({ ...d, rationale: e.target.value }))}
                      rows={4}
                      className="w-full resize-none border border-white/10 bg-black/30 p-3 text-sm leading-6 text-slate-100 placeholder:text-slate-600 focus:border-cyan-300/50 focus:outline-none" />
                  </label>
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Risk Notes</span>
                    <textarea value={editDraft.riskSummary} onChange={(e) => setEditDraft((d) => d && ({ ...d, riskSummary: e.target.value }))}
                      rows={4}
                      className="w-full resize-none border border-white/10 bg-black/30 p-3 text-sm leading-6 text-slate-100 placeholder:text-slate-600 focus:border-cyan-300/50 focus:outline-none" />
                  </label>
                </div>
                {editError && <p className="text-xs text-red-300">{editError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(proposal.id)} disabled={saving}
                    className="border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:bg-cyan-300/15 disabled:opacity-40">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={cancelEdit} disabled={saving}
                    className="border border-white/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-40">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ── view mode ── */
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] ${STATUS_STYLES[proposal.status]}`}>
                        {proposalStatusLabel(proposal)}
                      </span>
                      <span className="font-mono text-xs text-slate-500">{new Date(proposal.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h3 className="font-mono text-xl font-black tracking-[-0.03em] text-white">
                      {proposal.side} {proposal.ticker} — {fmtCurrency(proposal.amountDollars)}
                    </h3>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">
                      Max price: {proposal.maxPrice == null ? 'none' : fmtCurrency(proposal.maxPrice)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {proposal.status === 'Pending' && (
                      <>
                        <button onClick={() => startEdit(proposal)}
                          className="border border-white/15 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-slate-400 transition-colors hover:border-cyan-300/30 hover:text-cyan-200">
                          Edit
                        </button>
                        <button onClick={() => decide(proposal.id, 'ApprovedForBrokerReview')}
                          className="border border-emerald-300/35 bg-emerald-300/10 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-emerald-200 hover:bg-emerald-300/15">
                          Accept
                        </button>
                        <button onClick={() => decide(proposal.id, 'Rejected')}
                          className="border border-red-300/35 bg-red-300/10 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-red-200 hover:bg-red-300/15">
                          Reject
                        </button>
                      </>
                    )}
                    {proposal.status === 'ApprovedForBrokerReview' && !proposal.fulfilledAt && (
                      <button onClick={triggerCompanion} disabled={triggering}
                        className="border border-violet-300/40 bg-violet-300/10 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-violet-200 transition-colors hover:bg-violet-300/15 disabled:opacity-40">
                        {triggering ? 'Triggering...' : 'Trigger Now'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 border border-white/10 bg-white/[0.025] p-3">
                  <p className="text-sm leading-6 text-slate-200">{hook}</p>
                  {signals.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {signals.map((s) => (
                        <span key={s} className="border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-200/60">{s}</span>
                      ))}
                    </div>
                  )}
                  {hasMore && (
                    <button onClick={() => toggleExpanded(proposal.id)}
                      className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500 transition-colors hover:text-slate-300">
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

                {proposal.fulfilledAt && (
                  <p className="mt-2 border border-emerald-300/20 bg-emerald-300/[0.04] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200/80">
                    Executed {new Date(proposal.fulfilledAt).toLocaleString()}
                    {proposal.fulfilledOrderId ? ` · order ${proposal.fulfilledOrderId}` : ''}
                    {proposal.fulfilledShares != null ? ` · ${proposal.fulfilledShares} shares` : ''}
                  </p>
                )}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

// ─── Chat section ─────────────────────────────────────────────────────────────

function ChatSection({ agentId, onProposalEdited }: { agentId: string; onProposalEdited?: () => void }) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setHistory([]);
    fetch(`/api/agents/${agentId}/chat`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setHistory(j.history ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, sending]);

  async function send() {
    const message = input.trim();
    if (!message || sending) return;
    setInput('');
    setError(null);
    setSending(true);
    setHistory((h) => [...h, { role: 'user', content: message, ts: new Date().toISOString() }]);
    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      if (json.error) setError(json.error);
      else {
        setHistory((h) => [...h, { role: 'assistant', content: json.reply, ts: new Date().toISOString() }]);
        if (json.editedProposals?.length > 0) onProposalEdited?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSending(false);
    }
  }

  async function clearChat() {
    if (clearing || sending) return;
    setClearing(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="terminal-panel flex h-[540px] flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Conversation</span>
        <button onClick={clearChat} disabled={clearing || sending || history.length === 0}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-red-300/70 transition-colors hover:text-red-300 disabled:opacity-30">
          {clearing ? 'Clearing...' : 'Clear'}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {loading ? (
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading...</p>
        ) : history.length === 0 ? (
          <p className="font-mono text-sm text-slate-500">
            No conversation yet. Ask {agentLabel(agentId)} about its watchlist, recent signals, or track record.
          </p>
        ) : (
          history.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] whitespace-pre-wrap border px-4 py-3 text-sm leading-6 ${
                m.role === 'user'
                  ? 'border-cyan-200/25 bg-cyan-200/[0.06] text-slate-100'
                  : 'border-emerald-300/25 bg-emerald-300/[0.05] text-slate-100'
              }`}>
                {m.content}
              </div>
            </div>
          ))
        )}
        {sending && <p className="font-mono text-xs uppercase tracking-[0.16em] text-emerald-200/70">Thinking...</p>}
      </div>

      {error && <p className="border-t border-red-400/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{error}</p>}

      <div className="flex items-end gap-3 border-t border-white/10 p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={2}
          placeholder={`Message ${agentLabel(agentId)}...`}
          className="flex-1 resize-none border border-white/10 bg-black/30 p-3 font-mono text-sm leading-6 text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/40 focus:outline-none"
        />
        <button onClick={send} disabled={sending || !input.trim()}
          className="border border-emerald-300/35 bg-emerald-300/10 px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:opacity-40">
          Send
        </button>
      </div>
    </div>
  );
}

// ─── Memory section ───────────────────────────────────────────────────────────

function MemorySection({ agentId }: { agentId: string }) {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [importance, setImportance] = useState('3');

  function loadMemories() {
    setLoading(true);
    setError(null);
    fetch(`/api/agents/${agentId}/memory`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setMemories(j.memories ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setText('');
    loadMemories();
  }, [agentId]);

  async function addMemory() {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, importance: Number(importance), scope: 'agent' }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to add memory');
      setText('');
      loadMemories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteMemory(id: string) {
    try {
      const res = await fetch(`/api/agents/${agentId}/memory`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to delete memory');
      setMemories((current) => current.filter((memory) => memory.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="terminal-panel p-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.24em] text-emerald-200/70">Add Memory</p>
        <div className="grid gap-2 lg:grid-cols-[1fr_120px_auto]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Sam prefers..."
            className="border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-300/50 focus:outline-none"
          />
          <select
            value={importance}
            onChange={(e) => setImportance(e.target.value)}
            className="border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white focus:border-emerald-300/50 focus:outline-none"
          >
            <option value="1">1 low</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5 high</option>
          </select>
          <button
            onClick={addMemory}
            disabled={saving || !text.trim()}
            className="border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Remember'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </div>

      {loading ? (
        <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading...</p>
      ) : memories.length === 0 ? (
        <p className="terminal-panel p-5 text-sm text-slate-400">No durable memories saved for this agent yet.</p>
      ) : (
        <div className="space-y-2">
          {memories.map((memory) => (
            <article key={memory.id} className="terminal-panel p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="border border-emerald-300/20 bg-emerald-300/[0.06] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-200/80">
                      I{memory.importance}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{memory.source}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600">{memory.scope}</span>
                  </div>
                  <p className="text-sm leading-6 text-slate-200">{memory.text}</p>
                  <p className="mt-2 font-mono text-[10px] text-slate-600">Updated {new Date(memory.updatedAt).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => deleteMemory(memory.id)}
                  className="border border-red-300/25 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-red-300 transition-colors hover:border-red-300/50"
                >
                  Forget
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [activeId, setActiveId] = useState(AGENTS[0].id);
  const [section, setSection] = useState<SectionTab>('chat');
  const [proposalRefreshKey, setProposalRefreshKey] = useState(0);

  function handleProposalUpdated() {
    setProposalRefreshKey((k) => k + 1);
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Independent Desks</p>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Agents</h1>
      </div>

      <CompanionStatusBanner />

      {/* Agent tabs */}
      <div className="flex gap-1 border border-white/10 bg-white/[0.02] p-1">
        {AGENTS.map((a) => {
          const active = a.id === activeId;
          return (
            <button
              key={a.id}
              onClick={() => { setActiveId(a.id); setSection('chat'); }}
              className={`flex-1 border px-4 py-2.5 font-mono text-xs uppercase tracking-[0.16em] transition-colors ${
                active
                  ? 'border-emerald-300/35 bg-emerald-300/[0.08] text-emerald-200'
                  : 'border-white/5 bg-transparent text-slate-500 hover:border-cyan-200/20 hover:text-slate-200'
              }`}
            >
              {agentLabel(a.id)}
            </button>
          );
        })}
      </div>

      {/* Book strip */}
      <AgentBookStrip agentId={activeId} />

      {/* Section tabs */}
      <div className="flex gap-0 border border-white/10">
        {(['alerts', 'proposals', 'chat', 'memory'] as SectionTab[]).map((tab) => {
          const active = section === tab;
          return (
            <button
              key={tab}
              onClick={() => setSection(tab)}
              className={`flex-1 border-r border-white/10 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.2em] transition-colors last:border-r-0 ${
                active
                  ? 'bg-white/[0.05] text-white'
                  : 'bg-transparent text-slate-500 hover:bg-white/[0.02] hover:text-slate-300'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Section content */}
      {section === 'alerts' && <AlertsSection agentId={activeId} />}
      {section === 'proposals' && <ProposalsSection agentId={activeId} refreshKey={proposalRefreshKey} onProposalUpdated={handleProposalUpdated} />}
      {section === 'chat' && <ChatSection agentId={activeId} onProposalEdited={handleProposalUpdated} />}
      {section === 'memory' && <MemorySection agentId={activeId} />}
    </div>
  );
}
