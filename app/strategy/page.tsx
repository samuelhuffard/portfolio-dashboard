'use client';

import { useEffect, useState } from 'react';
import { AGENTS } from '@/lib/agents';

function agentLabel(id: string, name: string): string {
  if (name) return name;
  return `Agent ${id.split('-')[1]}`;
}

export default function StrategyPage() {
  const [agentId, setAgentId] = useState(AGENTS[0].id);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    setSaved(false);
    fetch(`/api/strategy?agentId=${agentId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setNotes(json.notes ?? '');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [agentId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, notes }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="pm-panel border border-[var(--rule)] p-5 sm:p-6">
        <p className="pm-label">Mandate Layer</p>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-[var(--ink)]">Strategy</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Notes read by the AI overlay during the next research scan: risk posture, sectors to avoid,
          cash preference, income tilt, or current investment constraints.
        </p>
      </div>

      <div className="flex gap-2 border border-[var(--rule)] bg-[var(--panel-alt)] p-2">
        {AGENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAgentId(a.id)}
            className={`flex-1 border px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] transition-colors ${
              a.id === agentId
                ? 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--pos)]'
                : 'border-[var(--rule)] bg-transparent text-[var(--muted)] hover:border-[var(--rule)] hover:text-[var(--ink)]'
            }`}
          >
            {agentLabel(a.id, a.name)}
          </button>
        ))}
      </div>

      {error && (
        <p className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-3 text-sm text-[var(--warn)]">{error}</p>
      )}

      {loading ? (
        <p className="font-mono text-sm uppercase tracking-[0.24em] text-[var(--pos)]">Loading mandate...</p>
      ) : (
        <div className="pm-panel border border-[var(--rule)] p-5">
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setSaved(false);
            }}
            rows={10}
            className="min-h-[320px] w-full resize-y border border-[var(--rule)] bg-[var(--panel-alt)] p-4 font-mono text-sm leading-6 text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none"
            placeholder="Write your strategy direction here..."
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--pos)] transition-colors hover:bg-[var(--panel-alt)] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {saved && <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--pos)]">Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}
