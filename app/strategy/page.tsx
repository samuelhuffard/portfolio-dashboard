'use client';

import { useEffect, useState } from 'react';

export default function StrategyPage() {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/strategy')
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
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
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
      <div className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Mandate Layer</p>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Strategy</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Notes read by the AI overlay during the next research scan: risk posture, sectors to avoid,
          cash preference, income tilt, or current investment constraints.
        </p>
      </div>

      {error && (
        <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
      )}

      {loading ? (
        <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading mandate...</p>
      ) : (
        <div className="terminal-panel p-5">
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setSaved(false);
            }}
            rows={10}
            className="min-h-[320px] w-full resize-y border border-white/10 bg-black/30 p-4 font-mono text-sm leading-6 text-slate-100 placeholder:text-slate-600 focus:border-amber-200/60 focus:outline-none"
            placeholder="Write your strategy direction here..."
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {saved && <span className="font-mono text-xs uppercase tracking-[0.16em] text-emerald-300">Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}
