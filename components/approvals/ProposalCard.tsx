'use client';

import { AGENTS } from '@/lib/agents';
import { fmtCurrency } from '@/lib/format';
import type { AllocationProposal, ProposalStatus } from '@/lib/proposals';

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

export function proposalStatusLabel(proposal: AllocationProposal): string {
  if (proposal.fulfilledAt) return 'Fulfilled / tracked';
  return STATUS_LABELS[proposal.status];
}

export function agentLabel(id: string): string {
  const agent = AGENTS.find((a) => a.id === id);
  return agent?.name || `Agent ${id.split('-')[1]}`;
}

interface ProposalCardProps {
  proposal: AllocationProposal;
  expanded: boolean;
  onToggleExpanded: (id: string) => void;
  /** Omit both handlers to render a read-only card (History view). */
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  agent4Decision?: {
    outcome: 'ACCEPT' | 'REJECT';
    explanation: string[];
    policyVersion: string;
    decidedAt: string;
  };
}

export default function ProposalCard({ proposal, expanded, onToggleExpanded, onAccept, onReject, agent4Decision }: ProposalCardProps) {
  const signals = extractSignals(proposal.rationale + ' ' + proposal.riskSummary);
  const hook = firstSentence(proposal.rationale);
  const hasMore = proposal.rationale.trim().length > hook.length + 2 || !!proposal.riskSummary;

  return (
    <article className="terminal-panel p-5">
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
            {proposal.decidedAt ? ` - Decided ${new Date(proposal.decidedAt).toLocaleString()}` : ''}
          </p>
        </div>
        {proposal.status === 'Pending' && onAccept && onReject && (
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(proposal.id)}
              className="border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-emerald-200 hover:bg-emerald-300/15"
            >
              Accept Proposal
            </button>
            <button
              onClick={() => onReject(proposal.id)}
              className="border border-red-300/35 bg-red-300/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-red-200 hover:bg-red-300/15"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
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
              onClick={() => onToggleExpanded(proposal.id)}
              className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500 transition-colors hover:text-slate-300"
            >
              {expanded ? '↑ collapse' : '↓ full rationale'}
            </button>
          )}
        </div>

        {expanded && (
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
      </div>

      <aside className="mt-3 border border-[#cbd9d0] bg-[#f3f7f3] px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#315d4e]">Agent 4 portfolio review</p>
          {agent4Decision && (
            <span className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${agent4Decision.outcome === 'ACCEPT' ? 'border-[#a7c5b5] text-[#315d4e]' : 'border-[#e3c2bf] text-[#9a4039]'}`}>
              {agent4Decision.outcome === 'ACCEPT' ? 'Within shadow policy' : 'Blocked in shadow'}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs leading-5 text-slate-500">
          {agent4Decision
            ? `${agent4Decision.explanation.join(' ')} Policy ${agent4Decision.policyVersion}.`
            : 'Awaiting Agent 4’s independent shadow review. This does not affect your ability to approve or reject the proposal.'}
        </p>
      </aside>

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
  );
}
