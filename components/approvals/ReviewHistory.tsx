'use client';

import { useMemo, useState } from 'react';
import { agentLabel } from '@/components/approvals/ProposalCard';
import { getReviewAuditPage, sortReviewAudits, type ReviewAudit, type ReviewAuditSortDirection, type ReviewAuditSortField } from '@/lib/review-history';

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
  if (audit.source === 'legacy_recommendation_sheet') {
    return `Historical recommendation retained → Final: ${audit.finalAction ?? 'NO_TRADE'}`;
  }
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
  const [sortField, setSortField] = useState<ReviewAuditSortField>('date');
  const [sortDirection, setSortDirection] = useState<ReviewAuditSortDirection>('desc');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = !term ? audits : audits.filter((audit) => [
      audit.ticker, audit.agentId, audit.generatorAction, audit.finalAction, audit.generatorThesis,
      audit.finalThesis, audit.reason, audit.evaluatorVerdict, ...audit.evaluatorCritique, ...audit.ruleCheck,
    ].filter(Boolean).join(' ').toLowerCase().includes(term));
    return sortReviewAudits(matches, sortField, sortDirection);
  }, [audits, query, sortDirection, sortField]);
  const pagination = useMemo(() => getReviewAuditPage(filtered, page), [filtered, page]);

  function selectSort(field: ReviewAuditSortField) {
    setSortField(field);
    setSortDirection(field === 'date' || field === 'score' ? 'desc' : 'asc');
    setPage(0);
  }

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
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search ticker, action, rationale, evaluator critique…" className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:outline-none" />
          <label className="sr-only" htmlFor="review-audit-sort">Order reviews by</label>
          <select id="review-audit-sort" value={sortField} onChange={(event) => selectSort(event.target.value as ReviewAuditSortField)} className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink)] focus:outline-none">
            <option value="date">Date</option>
            <option value="score">Score</option>
            <option value="action">Proposal type</option>
            <option value="company">Company A–Z</option>
          </select>
          <button type="button" onClick={() => { setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); setPage(0); }} className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-2)] hover:border-[#9a4039] hover:text-[#9a4039]">
            {sortDirection === 'asc' ? '↑ ascending' : '↓ descending'}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? <p className="pm-panel border border-[var(--rule)] p-5 text-sm text-[var(--muted)]">No retained review matches that search. New scheduled reviews enter this audit automatically.</p> : pagination.rows.map((audit) => {
        const key = `${audit.runId}:${audit.agentId}:${audit.ticker}:${audit.decidedAt}`;
        const open = expanded.has(key);
        return <article key={key} className="pm-panel border border-[var(--rule)] p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{agentLabel(audit.agentId)} · {stamp(audit.decidedAt)}</p>
              <h3 className={`mt-1 font-mono text-xl font-semibold ${actionTone(audit.finalAction)}`}>{audit.ticker} · {audit.finalAction ?? 'NO_TRADE'}</h3>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{audit.source === 'legacy_recommendation_sheet' ? 'Historical sheet record · ' : ''}Score {audit.quantScore ?? 'n/a'} · {audit.proposalDisposition.replaceAll('_', ' ')}</p>
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
              <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{audit.source === 'legacy_recommendation_sheet' ? 'Evaluator trace was not retained by the prior system.' : audit.evaluatorVerdict}</p>
              {audit.evaluatorCritique.map((item) => <p key={item} className="mt-1 text-xs leading-5 text-[var(--ink-2)]">— {item}</p>)}
              {audit.ruleCheck.map((item) => <p key={item} className="mt-1 text-xs leading-5 text-[var(--muted)]">Control: {item}</p>)}
            </div>
            <div className="border border-[#cbd9d0] bg-[#f3f7f3] p-3">
              <p className="pm-label">Kairos · shadow governance</p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{audit.source === 'legacy_recommendation_sheet' ? 'This record predates candidate-level Kairos trace retention.' : audit.kairosOutcome === 'not_recorded' ? 'No Kairos review was recorded because no actionable proposal reached that stage.' : `Kairos ${audit.kairosOutcome.toLowerCase()}ed the exact proposal; it did not resize or execute it.`}</p>
              {audit.kairosExplanation.map((item) => <p key={item} className="mt-1 text-xs leading-5 text-[var(--ink-2)]">— {item}</p>)}
            </div>
            <div className="border border-[var(--rule)] bg-[var(--panel-alt)] p-3">
              <p className="pm-label">Final rationale</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">{audit.finalThesis ?? audit.reason ?? audit.rationale ?? 'No final narrative retained.'}</p>
            </div>
          </div>}
        </article>;
      })}

      {filtered.length > 0 && <nav aria-label="Review audit pages" className="pm-panel flex flex-col gap-3 border border-[var(--rule)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Showing {pagination.start + 1}–{pagination.start + pagination.rows.length} of {filtered.length}</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={pagination.page === 0} className="border border-[var(--rule)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40 hover:border-[#9a4039] hover:text-[#9a4039]">← Previous</button>
          <span className="min-w-20 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Page {pagination.page + 1} / {pagination.totalPages}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(pagination.totalPages - 1, current + 1))} disabled={pagination.page === pagination.totalPages - 1} className="border border-[var(--rule)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40 hover:border-[#9a4039] hover:text-[#9a4039]">Next →</button>
        </div>
      </nav>}
    </section>
  );
}
