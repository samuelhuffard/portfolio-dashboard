'use client';

import { useEffect, useRef, useState } from 'react';
import { DefRow, Footnote, Panel, RailBlock, ScreenGrid } from '@/components/chrome';
import RunResearchButton from '@/components/command/RunResearchButton';
import { AGENTS } from '@/lib/agents';
import { MAX_AMOUNT_DOLLARS } from '@/lib/contracts/proposal.js';
import { fmtCurrency } from '@/lib/format';
import type { ChatMessage } from '@/lib/agentChat';
import type { AgentBook } from '@/lib/agent-books';
import type { AgentMemory } from '@/lib/agentMemory';
import { NO_REASON_REJECTION, type AllocationProposal, type ProposalSide, type ProposalStatus } from '@/lib/proposals';

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
  Pending: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--warn)]',
  ApprovedForBrokerReview: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--pos)]',
  Rejected: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--warn)]',
  Expired: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--ink)]',
};

const STATUS_LABELS: Record<ProposalStatus, string> = {
  Pending: 'Pending',
  ApprovedForBrokerReview: 'Accepted',
  Rejected: 'Rejected',
  Expired: 'Expired (48h)',
};

function proposalStatusLabel(proposal: AllocationProposal): string {
  if (proposal.fulfilledAt) return 'Tracked';
  return STATUS_LABELS[proposal.status];
}

const DIRECTION_STYLES = {
  below: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--accent)]',
  above: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--pos)]',
};

const REJECT_REASONS = [
  NO_REASON_REJECTION,
  "I didn't like this proposal.",
  'Liked another proposal better.',
] as const;

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
    <div className="flex flex-wrap gap-6 border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-3 font-mono text-xs">
      <span className="text-[var(--muted)]">
        Unrealized <span className={book.unrealizedGain >= 0 ? 'text-[var(--pos)]' : 'text-[var(--warn)]'}>{fmtUsd(book.unrealizedGain)}</span>
      </span>
      <span className="text-[var(--muted)]">
        Realized <span className={book.realizedGain >= 0 ? 'text-[var(--pos)]' : 'text-[var(--warn)]'}>{fmtUsd(book.realizedGain)}</span>
      </span>
      <span className="text-[var(--muted)]">
        Win rate <span className="text-[var(--ink)]">{book.winRatePct != null ? `${book.winRatePct}%` : '—'}</span>
        <span className="text-[var(--muted-2)]"> ({book.closedTradeCount} closed)</span>
      </span>
      {book.positions.map((p) => (
        <span key={p.ticker} className="text-[var(--muted)]">
          {p.ticker} <span className={(p.unrealizedGain ?? 0) >= 0 ? 'text-[var(--pos)]' : 'text-[var(--warn)]'}>{fmtUsd(p.unrealizedGain)}</span>
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
      <div className="pm-panel border border-[var(--rule)] p-4">
        <p className="pm-label">New Alert</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Ticker</span>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="NVDA"
              className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm uppercase text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none" />
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Direction</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'below' | 'above')}
              className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm text-[var(--ink)] focus:border-[var(--rule)] focus:outline-none">
              <option value="below">Falls below</option>
              <option value="above">Rises above</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Target Price</span>
            <input value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} inputMode="decimal" placeholder="185.00"
              className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none" />
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional"
              className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none" />
          </label>
        </div>
        {error && <p className="mt-2 text-xs text-[var(--warn)]">{error}</p>}
        <button onClick={addAlert} disabled={saving || !ticker || !targetPrice}
          className="mt-3 border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)] transition-colors hover:bg-[var(--panel-alt)] disabled:opacity-40">
          {saving ? 'Setting...' : 'Set Alert'}
        </button>
      </div>

      {loading ? (
        <p className="font-mono text-sm uppercase tracking-[0.24em] text-[var(--accent)]">Loading...</p>
      ) : agentAlerts.length === 0 ? (
        <p className="pm-panel border border-[var(--rule)] p-5 text-sm text-[var(--muted)]">No alerts set for this agent.</p>
      ) : (
        <div className="space-y-2">
          {agentAlerts.map((alert) => (
            <article key={alert.id} className="pm-panel border border-[var(--rule)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xl font-semibold tracking-[-0.01em] text-[var(--ink)]">{alert.ticker}</span>
                  <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] ${DIRECTION_STYLES[alert.direction]}`}>
                    {alert.direction === 'below' ? '↓ below' : '↑ above'}
                  </span>
                  <span className="font-mono text-base font-semibold text-[var(--ink)]">${alert.targetPrice.toFixed(2)}</span>
                  {alert.note && <span className="text-sm text-[var(--muted)]">{alert.note}</span>}
                </div>
                <button onClick={() => deleteAlert(alert.id)}
                  className="border border-[var(--rule)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--warn)] hover:border-[var(--rule)] transition-colors">
                  Remove
                </button>
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-[var(--muted-2)]">
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
  const [status, setStatus] = useState<'online' | 'offline' | 'unknown'>('unknown');
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('/api/companion/trigger');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Status unavailable');
        if (!cancelled) {
          setStatus(json.online ? 'online' : 'offline');
          setLastSeen(json.lastSeen ?? null);
        }
      } catch {
        if (!cancelled) setStatus('unknown');
      }
    }
    check();
    const interval = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const styles = {
    online: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--pos)]',
    offline: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--warn)]',
    unknown: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--warn)]',
  }[status];
  const dot = status === 'online' ? 'bg-emerald-400' : status === 'offline' ? 'bg-red-400' : 'bg-amber-300';
  const label = status === 'online'
    ? 'Execution companion online'
    : status === 'offline'
      ? `Execution companion offline${lastSeen ? ` · last seen ${new Date(lastSeen).toLocaleString()}` : ''}`
      : 'Execution companion status unavailable';

  return (
    <div className={`flex items-center gap-2 border px-4 py-2 ${styles}`}>
      <span className={`h-1.5 w-1.5 ${dot}`} />
      <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
        {label}
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
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [showCustomReason, setShowCustomReason] = useState(false);

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

  async function decide(id: string, status: Exclude<ProposalStatus, 'Pending'>, note?: string) {
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          note: note ?? (status === 'ApprovedForBrokerReview' ? 'Accepted for broker review. Dashboard did not submit this order.' : 'Rejected.'),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error);
      setProposals((prev) => prev.map((p) => (p.id === id ? json.proposal : p)));
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

  if (loading) return <p className="font-mono text-sm uppercase tracking-[0.24em] text-[var(--pos)]">Loading...</p>;
  if (error) return <p className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-3 text-sm text-[var(--warn)]">{error}</p>;
  if (agentProposals.length === 0) return <p className="pm-panel border border-[var(--rule)] p-5 text-sm text-[var(--muted)]">No proposals from this agent.</p>;

  return (
    <div className="space-y-2">
      {triggerMsg && (
        <p className="pm-label">{triggerMsg}</p>
      )}

      {agentProposals.map((proposal) => {
        const isEditing = editingId === proposal.id;
        const isExpanded = expandedIds.has(proposal.id);
        const signals = extractSignals(proposal.rationale + ' ' + proposal.riskSummary);
        const hook = firstSentence(proposal.rationale);
        const hasMore = proposal.rationale.trim().length > hook.length + 2 || !!proposal.riskSummary;
        return (
          <article key={proposal.id} className="pm-panel border border-[var(--rule)] p-4">
            {isEditing && editDraft ? (
              /* ── edit mode ── */
              <div className="space-y-3">
                <p className="pm-label">Editing Proposal</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Ticker</span>
                    <input value={editDraft.ticker} onChange={(e) => setEditDraft((d) => d && ({ ...d, ticker: e.target.value.toUpperCase() }))}
                      className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm uppercase text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none" />
                  </label>
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Side</span>
                    <select value={editDraft.side} onChange={(e) => setEditDraft((d) => d && ({ ...d, side: e.target.value as ProposalSide }))}
                      className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm text-[var(--ink)] focus:border-[var(--rule)] focus:outline-none">
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Dollars</span>
                    <input value={editDraft.amountDollars} onChange={(e) => setEditDraft((d) => d && ({ ...d, amountDollars: e.target.value }))}
                      inputMode="decimal"
                      className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none" />
                  </label>
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Max Price</span>
                    <input value={editDraft.maxPrice} onChange={(e) => setEditDraft((d) => d && ({ ...d, maxPrice: e.target.value }))}
                      inputMode="decimal" placeholder="none"
                      className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none" />
                  </label>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Rationale</span>
                    <textarea value={editDraft.rationale} onChange={(e) => setEditDraft((d) => d && ({ ...d, rationale: e.target.value }))}
                      rows={4}
                      className="w-full resize-none border border-[var(--rule)] bg-[var(--panel-alt)] p-3 text-sm leading-6 text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none" />
                  </label>
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Risk Notes</span>
                    <textarea value={editDraft.riskSummary} onChange={(e) => setEditDraft((d) => d && ({ ...d, riskSummary: e.target.value }))}
                      rows={4}
                      className="w-full resize-none border border-[var(--rule)] bg-[var(--panel-alt)] p-3 text-sm leading-6 text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none" />
                  </label>
                </div>
                {editError && <p className="text-xs text-[var(--warn)]">{editError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(proposal.id)} disabled={saving}
                    className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)] transition-colors hover:bg-[var(--panel-alt)] disabled:opacity-40">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={cancelEdit} disabled={saving}
                    className="border border-[var(--rule)] px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)] transition-colors hover:text-[var(--ink)] disabled:opacity-40">
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
                      <span className="font-mono text-xs text-[var(--muted)]">{new Date(proposal.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h3 className="font-mono text-xl font-semibold tracking-[-0.01em] text-[var(--ink)]">
                      {proposal.side} {proposal.ticker} — {fmtCurrency(proposal.amountDollars)}
                    </h3>
                    <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
                      Max price: {proposal.maxPrice == null ? 'none' : fmtCurrency(proposal.maxPrice)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {proposal.status === 'Pending' && (
                      <>
                        <button onClick={() => startEdit(proposal)}
                          className="border border-[var(--rule)] px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)] transition-colors hover:border-[var(--rule)] hover:text-[var(--accent)]">
                          Edit
                        </button>
                        <button onClick={() => decide(proposal.id, 'ApprovedForBrokerReview')}
                          className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-[var(--pos)] hover:bg-[var(--panel-alt)]">
                          Accept
                        </button>
                        <button onClick={() => startReject(proposal.id)}
                          className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-[var(--warn)] hover:bg-[var(--panel-alt)]">
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

                <div className="mt-3 border border-[var(--rule)] bg-[var(--panel-alt)] p-3">
                  <p className="text-sm leading-6 text-[var(--ink)]">{hook}</p>
                  {signals.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {signals.map((s) => (
                        <span key={s} className="border border-[var(--rule)] bg-[var(--panel-alt)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--accent)]">{s}</span>
                      ))}
                    </div>
                  )}
                  {hasMore && (
                    <button onClick={() => toggleExpanded(proposal.id)}
                      className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] transition-colors hover:text-[var(--ink-2)]">
                      {isExpanded ? '↑ collapse' : '↓ full rationale'}
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                    <div className="border border-[var(--rule)] bg-[var(--panel-alt)] p-3">
                      <p className="pm-label">Full Rationale</p>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--ink-2)]">{proposal.rationale}</p>
                    </div>
                    <div className="border border-[var(--rule)] bg-[var(--panel-alt)] p-3">
                      <p className="pm-label">Risk Notes</p>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--ink-2)]">{proposal.riskSummary || 'No risk notes recorded.'}</p>
                    </div>
                  </div>
                )}

                {proposal.fulfilledAt && (
                  <p className="pm-label">
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

      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--panel-alt)] p-4" onClick={cancelReject}>
          <div className="pm-panel border border-[var(--rule)] w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <p className="pm-label">Reject Proposal</p>
            <h2 className="mb-4 text-lg font-bold text-[var(--ink)]">Why did you reject this proposal?</h2>
            <div className="space-y-2">
              {REJECT_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => submitReject(reason)}
                  className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 text-left text-sm text-[var(--ink)] hover:border-[var(--rule)] hover:bg-[var(--panel-alt)]"
                >
                  {reason}
                </button>
              ))}
              {!showCustomReason ? (
                <button
                  onClick={() => setShowCustomReason(true)}
                  className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 text-left text-sm text-[var(--ink)] hover:border-[var(--rule)] hover:bg-[var(--panel-alt)]"
                >
                  Other (type a reason)
                </button>
              ) : (
                <div className="space-y-2 border border-[var(--rule)] bg-[var(--panel-alt)] p-3">
                  <textarea
                    autoFocus
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    rows={3}
                    placeholder="Type your reason..."
                    className="w-full resize-none border border-[var(--rule)] bg-[var(--panel-alt)] p-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none"
                  />
                  <button
                    onClick={() => submitReject(customReason.trim() || 'No reason given.')}
                    disabled={!customReason.trim()}
                    className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--warn)] hover:bg-[var(--panel-alt)] disabled:opacity-40"
                  >
                    Submit Reason
                  </button>
                </div>
              )}
            </div>
            <button onClick={cancelReject} className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-[var(--ink-2)]">
              Cancel
            </button>
          </div>
        </div>
      )}
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
    <div className="pm-panel border border-[var(--rule)] flex h-[540px] flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Conversation</span>
        <button onClick={clearChat} disabled={clearing || sending || history.length === 0}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--warn)] transition-colors hover:text-[var(--warn)] disabled:opacity-30">
          {clearing ? 'Clearing...' : 'Clear'}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {loading ? (
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-[var(--pos)]">Loading...</p>
        ) : history.length === 0 ? (
          <p className="font-mono text-sm text-[var(--muted)]">
            No conversation yet. Ask {agentLabel(agentId)} about its watchlist, recent signals, or track record.
          </p>
        ) : (
          history.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] whitespace-pre-wrap border px-4 py-3 text-sm leading-6 ${
                m.role === 'user'
                  ? 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--ink)]'
                  : 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--ink)]'
              }`}>
                {m.content}
              </div>
            </div>
          ))
        )}
        {sending && <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--pos)]">Thinking...</p>}
      </div>

      {error && <p className="border-t border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-2 text-xs text-[var(--warn)]">{error}</p>}

      <div className="flex items-end gap-3 border-t border-[var(--rule)] p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={2}
          placeholder={`Message ${agentLabel(agentId)}...`}
          className="flex-1 resize-none border border-[var(--rule)] bg-[var(--panel-alt)] p-3 font-mono text-sm leading-6 text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none"
        />
        <button onClick={send} disabled={sending || !input.trim()}
          className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--pos)] transition-colors hover:bg-[var(--panel-alt)] disabled:opacity-40">
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
  const [category, setCategory] = useState<'investment' | 'workflow'>('investment');

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
        body: JSON.stringify({ text: value, importance: Number(importance), category, scope: 'agent' }),
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
      <div className="pm-panel border border-[var(--rule)] p-4">
        <p className="pm-label">Add Memory</p>
        <div className="grid gap-2 lg:grid-cols-[1fr_140px_120px_auto]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Sam prefers..."
            className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as 'investment' | 'workflow')}
            aria-label="Memory category"
            className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm text-[var(--ink)] focus:border-[var(--rule)] focus:outline-none"
          >
            <option value="investment">Investment</option>
            <option value="workflow">Workflow</option>
          </select>
          <select
            value={importance}
            onChange={(e) => setImportance(e.target.value)}
            className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm text-[var(--ink)] focus:border-[var(--rule)] focus:outline-none"
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
            className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--pos)] transition-colors hover:bg-[var(--panel-alt)] disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Remember'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-[var(--warn)]">{error}</p>}
      </div>

      {loading ? (
        <p className="font-mono text-sm uppercase tracking-[0.24em] text-[var(--pos)]">Loading...</p>
      ) : memories.length === 0 ? (
        <p className="pm-panel border border-[var(--rule)] p-5 text-sm text-[var(--muted)]">No durable memories saved for this agent yet.</p>
      ) : (
        <div className="space-y-2">
          {memories.map((memory) => (
            <article key={memory.id} className="pm-panel border border-[var(--rule)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="border border-[var(--rule)] bg-[var(--panel-alt)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--pos)]">
                      I{memory.importance}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">{memory.source}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">{memory.category ?? 'legacy'}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-2)]">{memory.scope}</span>
                  </div>
                  <p className="text-sm leading-6 text-[var(--ink)]">{memory.text}</p>
                  <p className="mt-2 font-mono text-[10px] text-[var(--muted-2)]">Updated {new Date(memory.updatedAt).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => deleteMemory(memory.id)}
                  className="border border-[var(--rule)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--warn)] transition-colors hover:border-[var(--rule)]"
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

  // Desks are unnamed until Sam names each one after its philosophy, so the
  // caption states the standing fact rather than inventing a mandate.
  const activeAgent = AGENTS.find((a) => a.id === activeId);

  return (
    <ScreenGrid
      main={
        <>
          {/* Desk and section are both segmented controls; the screen is named
              in the nav, so there is no page title. */}
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: '9px 18px' }}>
              <div className="pm-seg" role="group" aria-label="Research desk">
                {AGENTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={a.id === activeId}
                    onClick={() => { setActiveId(a.id); setSection('chat'); }}
                    className="pm-seg-item"
                  >
                    {agentLabel(a.id)}
                  </button>
                ))}
              </div>
              <span className="pm-caption">
                {activeAgent?.name || 'Independent desks · advisory only, nothing executes without sign-off'}
              </span>
            </div>
          </Panel>

          <CompanionStatusBanner />

          <AgentBookStrip agentId={activeId} />

          <Panel>
            <div style={{ padding: '9px 18px' }}>
              <div className="pm-seg inline-flex" role="group" aria-label="Desk section">
                {(['alerts', 'proposals', 'chat', 'memory'] as SectionTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={section === tab}
                    onClick={() => setSection(tab)}
                    className="pm-seg-item capitalize"
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {section === 'alerts' && <AlertsSection agentId={activeId} />}
          {section === 'proposals' && <ProposalsSection agentId={activeId} refreshKey={proposalRefreshKey} onProposalUpdated={handleProposalUpdated} />}
          {section === 'chat' && <ChatSection agentId={activeId} onProposalEdited={handleProposalUpdated} />}
          {section === 'memory' && <MemorySection agentId={activeId} />}
        </>
      }
      rail={
        <>
          <RailBlock title="Red lines">
            <div className="flex flex-col">
              <DefRow label="Execution">Approval required</DefRow>
              <DefRow label="Max single order">{fmtCurrency(MAX_AMOUNT_DOLLARS, 0)}</DefRow>
              <DefRow label="Leverage">Not permitted</DefRow>
              <DefRow label="Desk authority">Propose only</DefRow>
            </div>
          </RailBlock>

          <RailBlock title="Run controls">
            <RunResearchButton />
            <p style={{ margin: '9px 0 0', fontSize: 11.5, color: 'var(--muted-2)' }}>
              Desks also run on the backend&apos;s own schedule.
            </p>
          </RailBlock>

          <RailBlock title="Desk" grow>
            <div className="flex flex-col">
              <DefRow label="Selected">{agentLabel(activeId)}</DefRow>
              <DefRow label="Section">{section}</DefRow>
            </div>
          </RailBlock>

          <Footnote label="Authority">
            Desks may research and propose. Only the account holder can approve a trade, and every
            approval is signed and written to the audit trail.
          </Footnote>
        </>
      }
    />
  );
}
