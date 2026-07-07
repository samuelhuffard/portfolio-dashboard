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
            ? 'cursor-wait border-cyan-200/30 bg-cyan-200/[0.08] text-cyan-200/70'
            : 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200 hover:border-emerald-300/70 hover:bg-emerald-300/20'
        }`}
      >
        {state === 'pending' ? 'Dispatching Agents...' : 'Run Research'}
      </button>
      {message && (
        <p
          role="status"
          className={`max-w-xs border px-3 py-2 text-right font-mono text-[10px] leading-4 tracking-[0.06em] ${
            state === 'started'
              ? 'border-emerald-300/30 bg-emerald-300/[0.06] text-emerald-200'
              : 'border-red-400/30 bg-red-500/10 text-red-200'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
