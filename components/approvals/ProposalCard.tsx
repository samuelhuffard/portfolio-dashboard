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

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function BuyDecisionDossier({ proposal }: { proposal: AllocationProposal }) {
  const dossier = proposal.buyDossier;
  if (!dossier) return null;
  const valuation = dossier.valuation;
  return (
    <section className="mt-4 border border-[#b9c9bf] bg-[#f5f8f4] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#cbd9d0] pb-3">
        <div>
          <p className="pm-label text-[#315d4e]">Investment decision dossier</p>
          <h3 className="mt-1 font-serif text-xl text-[var(--ink)]">The case to review before approving</h3>
        </div>
        <div className="text-right font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
          <p>{titleCase(dossier.businessType)}</p>
          <p className="mt-1">Owner · {dossier.owner.label}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-3">
          <div>
            <p className="pm-label">Business thesis</p>
            <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{dossier.thesis}</p>
          </div>
          <div className="border-l-2 border-[#7e9f8a] pl-3">
            <p className="pm-label">Return mechanism</p>
            <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{dossier.returnMechanism}</p>
          </div>
        </div>
        <div className="border border-[#cbd9d0] bg-[#fbfcfa] p-3">
          <p className="pm-label">Horizon & sizing</p>
          <p className="mt-1 font-serif text-lg text-[var(--ink)]">{dossier.horizon}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-2)]">{dossier.sizingRationale}</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Thesis owner · {dossier.owner.label}</p>
        </div>
      </div>

      <div className="mt-3 border border-[#cbd9d0] bg-[#fbfcfa] p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="pm-label">Valuation scenario · not a forecast</p>
          <p className="font-mono text-[10px] text-[var(--muted)]">{dossier.valuation.method}</p>
        </div>
        <div className="mt-3 grid grid-cols-3 divide-x divide-[#cbd9d0]">
          {[
            ['Downside', valuation.downsidePrice, 'text-[#9a4039]'],
            ['Base', valuation.basePrice, 'text-[var(--ink)]'],
            ['Upside', valuation.upsidePrice, 'text-[#315d4e]'],
          ].map(([label, price, color]) => (
            <div key={String(label)} className="px-3 first:pl-0 last:pr-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]">{label}</p>
              <p className={`mt-1 font-serif text-xl ${color}`}>{fmtCurrency(Number(price))}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--ink-2)]">{valuation.assumptions}</p>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="border border-[#e3c2bf] bg-[#fff9f8] p-3">
          <p className="pm-label text-[#9a4039]">Bear case</p>
          <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{dossier.bearCase}</p>
        </div>
        <div className="border border-[#d5cdb5] bg-[#fffcf4] p-3">
          <p className="pm-label text-[#6f5d2a]">Kill criteria · what changes the call</p>
          <ul className="mt-1 space-y-1.5 text-sm leading-6 text-[var(--ink)]">
            {dossier.killCriteria.map((criterion) => <li key={criterion}>— {criterion}</li>)}
          </ul>
        </div>
      </div>

      <details className="mt-3 border-t border-[#cbd9d0] pt-3">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--ink)]">Evidence map · {dossier.evidence.length} cited claims</summary>
        <ul className="mt-2 space-y-2 text-xs leading-5 text-[var(--ink-2)]">
          {dossier.evidence.map((item) => <li key={item.claim}><span className="text-[var(--ink)]">{item.claim}</span><span className="font-mono text-[10px] text-[var(--muted)]"> · {item.evidenceIds.join(', ')}</span></li>)}
        </ul>
      </details>
    </section>
  );
}

function SellDecisionDossier({ proposal }: { proposal: AllocationProposal }) {
  const dossier = proposal.sellDossier;
  if (!dossier) return null;
  return <section className="mt-4 border border-[#e3c2bf] bg-[#fff9f8] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ecd5d1] pb-3">
      <div><p className="pm-label text-[#9a4039]">Exit decision dossier</p><h3 className="mt-1 font-serif text-xl text-[var(--ink)]">Why reduce or exit this owned position</h3></div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9a4039]">{dossier.urgency} · {dossier.owner.label}</p>
    </div>
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <div><p className="pm-label">Exit trigger</p><p className="mt-1 text-sm leading-6 text-[var(--ink)]">{dossier.exitTrigger}</p></div>
      <div className="border border-[#ecd5d1] bg-white/50 p-3"><p className="pm-label">Position scope</p><p className="mt-1 text-sm leading-6 text-[var(--ink)]">{dossier.positionScope}</p></div>
      <div className="border border-[#ecd5d1] bg-white/50 p-3"><p className="pm-label">What remains true</p><p className="mt-1 text-sm leading-6 text-[var(--ink)]">{dossier.remainingThesis}</p></div>
      <div className="border border-[#ecd5d1] bg-white/50 p-3"><p className="pm-label">What would keep us invested</p><p className="mt-1 text-sm leading-6 text-[var(--ink)]">{dossier.stayInvestedIf}</p></div>
    </div>
    <div className="mt-3 border-l-2 border-[#c27b73] pl-3"><p className="pm-label">Exit criteria</p>{dossier.killCriteria.map((criterion) => <p key={criterion} className="mt-1 text-sm leading-6 text-[var(--ink)]">— {criterion}</p>)}</div>
  </section>;
}

const STATUS_STYLES: Record<ProposalStatus, string> = {
  Pending: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--warn)]',
  ApprovedForBrokerReview: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--pos)]',
  Rejected: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--warn)]',
  Expired: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--ink)]',
  ExecutionFailed: 'border-[#c27b73] bg-[#fff3f1] text-[#9f3b32]',
};

const STATUS_LABELS: Record<ProposalStatus, string> = {
  Pending: 'Pending',
  ApprovedForBrokerReview: 'Accepted for broker review',
  Rejected: 'Rejected',
  Expired: 'Expired (48h)',
  ExecutionFailed: 'Broker execution failed — re-approval required',
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
    <article className="pm-panel border border-[var(--rule)] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{agentLabel(proposal.agentId)}</span>
            <span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${STATUS_STYLES[proposal.status]}`}>
              {proposalStatusLabel(proposal)}
            </span>
          </div>
          <h2 className="font-mono text-2xl font-semibold tracking-[-0.01em] text-[var(--ink)]">
            {proposal.side} {proposal.ticker} - {fmtCurrency(proposal.amountDollars)}
          </h2>
          <p className="mt-1 font-mono text-xs text-[var(--muted)]">
            Max price: {proposal.maxPrice == null ? 'none set' : fmtCurrency(proposal.maxPrice)} - Created {new Date(proposal.createdAt).toLocaleString()}
            {proposal.decidedAt ? ` - Decided ${new Date(proposal.decidedAt).toLocaleString()}` : ''}
          </p>
        </div>
        {proposal.status === 'Pending' && onAccept && onReject && (
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(proposal.id)}
              className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--pos)] hover:bg-[var(--panel-alt)]"
            >
              Accept Proposal
            </button>
            <button
              onClick={() => onReject(proposal.id)}
              className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--warn)] hover:bg-[var(--panel-alt)]"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      <BuyDecisionDossier proposal={proposal} />
      <SellDecisionDossier proposal={proposal} />

      <div className={proposal.buyDossier || proposal.sellDossier ? "mt-3" : "mt-4"}>
        <div className="border border-[var(--rule)] bg-[var(--panel-alt)] p-3">
          <p className="pm-label">{proposal.buyDossier || proposal.sellDossier ? "Source rationale · audit record" : "Rationale"}</p>
          <p className="text-sm leading-6 text-[var(--ink)]">{hook}</p>
          {signals.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {signals.map((s) => (
                <span
                  key={s}
                  className="border border-[var(--rule)] bg-[var(--panel-alt)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--accent)]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          {hasMore && (
            <button
              onClick={() => onToggleExpanded(proposal.id)}
              className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] transition-colors hover:text-[var(--ink-2)]"
            >
              {expanded ? '↑ collapse' : proposal.buyDossier ? '↓ source rationale & risk record' : '↓ full rationale'}
            </button>
          )}
        </div>

        {expanded && (
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
      </div>

      <aside className="mt-3 border border-[#cbd9d0] bg-[#f3f7f3] px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="pm-label">Kairos · Portfolio review</p>
          {agent4Decision && (
            <span className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${agent4Decision.outcome === 'ACCEPT' ? 'border-[#a7c5b5] text-[#315d4e]' : 'border-[#e3c2bf] text-[#9a4039]'}`}>
              {agent4Decision.outcome === 'ACCEPT' ? 'Within policy' : 'Blocked in '}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
          {agent4Decision
            ? `${agent4Decision.explanation.join(' ')} Policy ${agent4Decision.policyVersion}.`
            : 'Awaiting Kairos’s independent review. This does not affect your ability to approve or reject the proposal.'}
        </p>
      </aside>

      {proposal.decisionNote && (
        <p className="mt-3 border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
          {proposal.decisionNote}
        </p>
      )}
      {proposal.fulfilledAt && (
        <p className="pm-label">
          Executed {new Date(proposal.fulfilledAt).toLocaleString()}
          {proposal.fulfilledOrderId ? ` · order ${proposal.fulfilledOrderId}` : ''}
          {proposal.fulfilledShares != null ? ` · ${proposal.fulfilledShares} shares` : ''}
        </p>
      )}
    </article>
  );
}
