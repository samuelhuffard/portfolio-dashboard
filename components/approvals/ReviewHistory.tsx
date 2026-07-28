'use client';

import { useMemo, useState } from 'react';
import { agentLabel } from '@/components/approvals/ProposalCard';
import type { ReviewAudit } from '@/lib/review-history';

function stamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
}

function actionTone(action: string | null): string {
  if (action === 'BUY') return 'text-[#315d4e]';
  if (action === 'SELL') return 'text-[#9a4039]';
  return 'text-[var(--muted)]';
}

function pathSummary(audit: ReviewAudit): string {
  const steps = [`${audit.generatorAction ?? 'No'} initial signal`];
  if (audit.evaluatorState !== 'not_run') {
    steps.push(audit.evaluatorRevisions ? `Evaluator requested ${audit.evaluatorRevisions} revision` : `Evaluator ${audit.evaluatorState}`);
  }
  if (audit.kairosOutcome !== 'not_recorded') steps.push(`Kairos ${audit.kairosOutcome.toLowerCase()}ed the exact proposal`);
  steps.push(`Final: ${audit.finalAction ?? 'NO_TRADE'}`);
  return steps.join(' → ');
}

export default function ReviewHistory({ audits }: { audits: ReviewAudit[] }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return audits;
    return audits.filter((audit) => [
      audit.ticker, audit.agentId, audit.generatorAction, audit.finalAction, audit.generatorThesis,
      audit.finalThesis, audit.reason, audit.evaluatorVerdict, ...audit.evaluatorCritique, ...audit.ruleCheck,
    ].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [audits, query]);

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <section className="space-y-3">
      <div className="pm-panel border border-[var(--rule)] p-4">
        <p className="pm-label">Research decision audit</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">Every reviewed name follows its actual path: analyst signal, deterministic controls, evaluator challenge, Kairos shadow result, and final disposition. This is research history, not an execution log.</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">{filtered.length} / {audits.length} reviews</p>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker, action, rationale, evaluator critique…" className="mt-3 w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:outline-none" />
      </div>

      {filtered.length === 0 ? <p className="pm-panel border border-[var(--rule)] p-5 text-sm text-[var(--muted)]">No retained review matches that search. New scheduled reviews enter this audit automatically.</p> : filtered.map((audit) => {
        const key = `${audit.runId}:${audit.agentId}:${audit.ticker}:${audit.decidedAt}`;
        const open = expanded.has(key);
        return <article key={key} className="pm-panel border border-[var(--rule)] p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{agentLabel(audit.agentId)} · {stamp(audit.decidedAt)}</p>
              <h3 className={`mt-1 font-mono text-xl font-semibold ${actionTone(audit.finalAction)}`}>{audit.ticker} · {audit.finalAction ?? 'NO_TRADE'}</h3>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Score {audit.quantScore ?? 'n/a'} · {audit.proposalDisposition.replaceAll('_', ' ')}</p>
          </div>
          <p className="mt-3 border-l-2 border-[#cbd9d0] pl-3 text-sm leading-6 text-[var(--ink-2)]">{pathSummary(audit)}</p>
          <button onClick={() => toggle(key)} className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-[var(--ink)]">{open ? '↑ collapse path' : '↓ inspect reasoning path'}</button>
          {open && <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="border border-[var(--rule)] bg-[var(--panel-alt)] p-3">
              <p className="pm-label">Analyst rationale</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">{audit.generatorThesis ?? audit.rationale ?? 'No narrative was retained for this early data/control outcome.'}</p>
              {audit.requestedTargetWeight != null && <p className="mt-2 text-xs text-[var(--muted)]">Requested weight: {audit.requestedTargetWeight}% · Final: {audit.finalTargetWeight ?? 0}%</p>}
            </div>
            <div className="border border-[var(--rule)] bg-[var(--panel-alt)] p-3">
              <p className="pm-label">Controls & evaluator</p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{audit.evaluatorVerdict}</p>
              {audit.evaluatorCritique.map((item) => <p key={item} className="mt-1 text-xs leading-5 text-[var(--ink-2)]">— {item}</p>)}
              {audit.ruleCheck.map((item) => <p key={item} className="mt-1 text-xs leading-5 text-[var(--muted)]">Control: {item}</p>)}
            </div>
            <div className="border border-[#cbd9d0] bg-[#f3f7f3] p-3">
              <p className="pm-label">Kairos · shadow governance</p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{audit.kairosOutcome === 'not_recorded' ? 'No Kairos review was recorded because no actionable proposal reached that stage.' : `Kairos ${audit.kairosOutcome.toLowerCase()}ed the exact proposal; it did not resize or execute it.`}</p>
              {audit.kairosExplanation.map((item) => <p key={item} className="mt-1 text-xs leading-5 text-[var(--ink-2)]">— {item}</p>)}
            </div>
            <div className="border border-[var(--rule)] bg-[var(--panel-alt)] p-3">
              <p className="pm-label">Final rationale</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">{audit.finalThesis ?? audit.reason ?? audit.rationale ?? 'No final narrative retained.'}</p>
            </div>
          </div>}
        </article>;
      })}
    </section>
  );
}
