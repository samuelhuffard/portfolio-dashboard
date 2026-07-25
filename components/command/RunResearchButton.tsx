'use client';

import { useState } from 'react';

type RunState = 'idle' | 'pending' | 'started' | 'error';

/** Kicks off the all-agent research scan on the backend via the existing /api/scan proxy. */
export default function RunResearchButton() {
  const [state, setState] = useState<RunState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    if (state === 'pending') return;
    setState('pending');
    setMessage(null);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      let body: { error?: string; message?: string } = {};
      try {
        body = await res.json();
      } catch {
        // non-JSON body (e.g. gateway error page) — fall through to status handling
      }

      if (res.status === 409) {
        setState('error');
        setMessage(body.error || body.message || 'A research scan is already running on the backend.');
      } else if (res.ok) {
        setState('started');
        setMessage('All-agent research scan started — proposals will land in Approvals in a few minutes.');
      } else if (res.status === 503 || res.status === 502) {
        setState('error');
        setMessage(body.error || 'Backend unreachable — the Jetson research server did not respond.');
      } else {
        setState('error');
        setMessage(body.error || `Scan request failed (HTTP ${res.status}).`);
      }
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Scan request failed.');
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button
        onClick={run}
        disabled={state === 'pending'}
        className={`border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors ${
          state === 'pending'
            ? 'cursor-wait border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--accent)]'
            : 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--pos)] hover:border-[var(--rule)] hover:bg-[var(--panel-alt)]'
        }`}
      >
        {state === 'pending' ? 'Dispatching Agents...' : 'Run Research'}
      </button>
      {message && (
        <p
          role="status"
          className={`max-w-xs border px-3 py-2 text-right font-mono text-[10px] leading-4 tracking-[0.06em] ${
            state === 'started'
              ? 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--pos)]'
              : 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--warn)]'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
