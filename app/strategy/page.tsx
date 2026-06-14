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
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-stone-900 mb-2">Strategy</h1>
      <p className="text-sm text-stone-500 mb-4">
        Free-text notes read by the AI overlay during the next research scan — e.g. &ldquo;lean defensive&rdquo;,
        &ldquo;avoid airlines&rdquo;, &ldquo;prioritize dividend growth&rdquo;.
      </p>

      {error && (
        <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-stone-500">Loading...</p>
      ) : (
        <>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setSaved(false);
            }}
            rows={10}
            className="w-full bg-white rounded-xl border border-stone-200 p-4 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Write your strategy direction here..."
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
          </div>
        </>
      )}
    </div>
  );
}
