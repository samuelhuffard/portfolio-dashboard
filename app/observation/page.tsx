'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ObservationChecklistState, ObservationUpdate, ObservationWindowSummary, Phase0DayRecord } from '@/lib/observation-shared';
import { OBSERVATION_HUMAN_CHECKLIST, verdictLabel, verdictTone } from '@/lib/observation-shared';

interface ObservationResponse {
  window: ObservationWindowSummary;
  days: Phase0DayRecord[];
  updates: ObservationUpdate[];
  checklist: ObservationChecklistState[];
  error?: string;
}

const TONE_CLASSES: Record<ReturnType<typeof verdictTone>, string> = {
  good: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  warn: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  bad: 'border-rose-400/30 bg-rose-400/10 text-rose-100',
  muted: 'border-white/10 bg-white/[0.04] text-slate-400',
};

function Metric({ label, value, sub, tone = 'text-white' }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.035] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black tracking-[-0.04em] ${tone}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{sub}</p>
    </div>
  );
}

function DayRow({ day }: { day: Phase0DayRecord }) {
  const tone = verdictTone(day);
  const reasons = (day.reasons ?? []).slice(0, 4);
  return (
    <div className={`border p-4 ${TONE_CLASSES[tone]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-bold">{day.dateET}</p>
        <p className="text-xs">{verdictLabel(day)}</p>
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs leading-5 opacity-80">
          {reasons.map((reason, index) => (
            <li key={index}>• {reason}</li>
          ))}
        </ul>
      )}
      {day.deployment?.commit && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] opacity-60">
          {day.deployment.branch ?? 'unknown-branch'}@{String(day.deployment.commit).slice(0, 10)}
        </p>
      )}
    </div>
  );
}

export default function ObservationPage() {
  const [data, setData] = useState<ObservationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [updatingChecklist, setUpdatingChecklist] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/observation');
      const body = (await res.json()) as ObservationResponse;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load observation data');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const postUpdate = useCallback(async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch('/api/observation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setDraft('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post update');
    } finally {
      setPosting(false);
    }
  }, [draft, posting, load]);

  const window = data?.window;
  const checklistById = new Map((data?.checklist ?? []).map((item) => [item.id, item]));

  const updateChecklist = useCallback(async (id: string, completed: boolean) => {
    if (updatingChecklist) return;
    setUpdatingChecklist(id);
    try {
      const res = await fetch('/api/observation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklistItemId: id, completed }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update checklist');
    } finally {
      setUpdatingChecklist(null);
    }
  }, [load, updatingChecklist]);

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">Phase 0 · Supervised baseline</p>
        <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">Observation Window</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          The system must run 5 consecutive clean trading days before any autonomy expands. An automated
          observer signs one verdict per trading day at 8:15 PM ET; days shown here are displayed exactly as
          recorded on the Jetson, and the append-only record in the backend repo remains authoritative.
        </p>
      </header>

      {error && (
        <div className="border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div>
      )}

      {window && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Clean safety days"
            value={`${window.consecutiveCleanDays} / ${window.target}`}
            sub={window.headline}
            tone={window.consecutiveCleanDays > 0 ? 'text-emerald-200' : 'text-white'}
          />
          <Metric
            label="Actionable proposals"
            value={`${window.actionableProposals} / ${window.proposalTarget}`}
            sub="Genuine proposals the pipeline must produce during the window."
          />
          <Metric
            label="Evaluator approvals"
            value={`${window.evaluatorApprovals} / ${window.approvalTarget}`}
            sub="At least one proposal must earn an independent evaluator APPROVE."
          />
          <Metric
            label="Latest observation"
            value={window.latestDate ?? '—'}
            sub={window.latestLabel ?? 'No observation recorded yet.'}
          />
        </section>
      )}

      <section className="terminal-panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-[0.24em] text-slate-400">Human completion checklist</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Offline work required before this branch is offered for review. Checkmarks are manager-maintained;
              they do not advance Phase 0 or authorize a deployment.
            </p>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
            {Array.from(checklistById.values()).filter((item) => item.completed).length} / {OBSERVATION_HUMAN_CHECKLIST.length} complete
          </p>
        </div>
        <div className="mt-4 divide-y divide-white/10 border border-white/10">
          {OBSERVATION_HUMAN_CHECKLIST.map((item) => {
            const state = checklistById.get(item.id);
            const completed = state?.completed === true;
            const busy = updatingChecklist === item.id;
            return (
              <label key={item.id} className="flex cursor-pointer gap-3 bg-white/[0.025] p-4 transition hover:bg-white/[0.045]">
                <input
                  type="checkbox"
                  checked={completed}
                  disabled={busy}
                  onChange={(event) => void updateChecklist(item.id, event.target.checked)}
                  className="mt-1 h-4 w-4 accent-emerald-300 disabled:opacity-40"
                />
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${completed ? 'text-emerald-200 line-through decoration-emerald-300/40' : 'text-slate-100'}`}>{item.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{item.detail}</span>
                  {state?.updatedAt && (
                    <span className="mt-2 block font-mono text-[10px] text-slate-600">
                      {completed ? 'Completed' : 'Reopened'} by {state.updatedBy ?? 'FundManager'} · {new Date(state.updatedAt).toLocaleString()}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="terminal-panel p-5">
        <h2 className="font-mono text-xs uppercase tracking-[0.24em] text-slate-400">Manager updates</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Plain-English notes from the fund managers about how the window is going — what passed, what
          failed, what was repaired, and what happens next.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="e.g. Day 2 was clean — parity matched and every job ran. Waiting on the first genuine proposal."
            className="flex-1 border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-300/40 focus:outline-none"
          />
          <button
            onClick={() => void postUpdate()}
            disabled={posting || !draft.trim()}
            className="border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-emerald-100 disabled:opacity-40"
          >
            {posting ? 'Posting…' : 'Post update'}
          </button>
        </div>
        <div className="mt-5 space-y-3">
          {(data?.updates ?? []).length === 0 && (
            <p className="text-sm text-slate-500">No updates posted yet.</p>
          )}
          {(data?.updates ?? []).map((update) => (
            <div key={update.id} className="border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{update.author}</p>
                <p className="font-mono text-[10px] text-slate-600">{new Date(update.createdAt).toLocaleString()}</p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{update.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.24em] text-slate-400">Daily verdicts</h2>
        {(data?.days ?? []).length === 0 && !error && (
          <p className="text-sm text-slate-500">
            No observation days recorded yet. The first record appears after the observer runs at 8:15 PM ET
            on the next trading day.
          </p>
        )}
        {(data?.days ?? []).map((day) => (
          <DayRow key={day.dateET} day={day} />
        ))}
      </section>
    </div>
  );
}
