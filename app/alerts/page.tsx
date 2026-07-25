'use client';

import { useEffect, useState } from 'react';

interface PriceAlert {
  id: string;
  agentId: string;
  ticker: string;
  direction: 'below' | 'above';
  targetPrice: number;
  note: string;
  createdAt: string;
}

interface Draft {
  ticker: string;
  direction: 'below' | 'above';
  targetPrice: string;
  note: string;
}

const INITIAL_DRAFT: Draft = { ticker: '', direction: 'below', targetPrice: '', note: '' };

const DIRECTION_STYLES = {
  below: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--accent)]',
  above: 'border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--pos)]',
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/alerts');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to load alerts');
      setAlerts(json.alerts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function addAlert() {
    if (saving) return;
    if (!draft.ticker || !draft.targetPrice) {
      setError('Ticker and target price are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: draft.ticker.toUpperCase(),
          direction: draft.direction,
          targetPrice: parseFloat(draft.targetPrice),
          note: draft.note,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to create alert');
      setAlerts((prev) => [...prev, json.alert]);
      setDraft(INITIAL_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAlert(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete alert');
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <section className="pm-panel border border-[var(--rule)] p-5 sm:p-6">
        <p className="pm-label">Agent One</p>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-[var(--ink)]">Price Alerts</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          Set a target price and direction. The intraday monitor checks every 30 minutes — when triggered,
          Agent One queues a proposal automatically for your approval.
        </p>
      </section>

      {error && (
        <p className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-3 text-sm text-[var(--warn)]">{error}</p>
      )}

      <section className="pm-panel border border-[var(--rule)] p-5">
        <p className="pm-label">New Alert</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Ticker</span>
            <input
              value={draft.ticker}
              onChange={(e) => setDraft((d) => ({ ...d, ticker: e.target.value.toUpperCase() }))}
              placeholder="NVDA"
              className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm uppercase text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Direction</span>
            <select
              value={draft.direction}
              onChange={(e) => setDraft((d) => ({ ...d, direction: e.target.value as 'below' | 'above' }))}
              className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm text-[var(--ink)] focus:border-[var(--rule)] focus:outline-none"
            >
              <option value="below">Falls below</option>
              <option value="above">Rises above</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Target Price</span>
            <input
              value={draft.targetPrice}
              onChange={(e) => setDraft((d) => ({ ...d, targetPrice: e.target.value }))}
              inputMode="decimal"
              placeholder="185.00"
              className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Note (optional)</span>
            <input
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Entry on pullback"
              className="w-full border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none"
            />
          </label>
        </div>
        <button
          onClick={addAlert}
          disabled={saving}
          className="mt-4 border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--accent)] transition-colors hover:bg-[var(--panel-alt)] disabled:opacity-40"
        >
          {saving ? 'Setting...' : 'Set Alert'}
        </button>
      </section>

      <section className="space-y-3">
        {loading ? (
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-[var(--accent)]">Loading alerts...</p>
        ) : alerts.length === 0 ? (
          <p className="pm-panel border border-[var(--rule)] p-5 text-sm text-[var(--muted)]">
            No alerts set. Add one above and Agent One will queue a proposal the moment the price is hit.
          </p>
        ) : (
          alerts.map((alert) => (
            <article key={alert.id} className="pm-panel border border-[var(--rule)] p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-2xl font-semibold tracking-[-0.01em] text-[var(--ink)]">{alert.ticker}</span>
                  <span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${DIRECTION_STYLES[alert.direction]}`}>
                    {alert.direction === 'below' ? '↓ Falls below' : '↑ Rises above'}
                  </span>
                  <span className="font-mono text-lg font-semibold text-[var(--ink)]">
                    ${alert.targetPrice.toFixed(2)}
                  </span>
                </div>
                <button
                  onClick={() => deleteAlert(alert.id)}
                  className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--warn)] hover:border-[var(--rule)] hover:bg-[var(--panel-alt)] transition-colors"
                >
                  Remove
                </button>
              </div>
              {alert.note && (
                <p className="mt-2 text-sm text-[var(--muted)]">{alert.note}</p>
              )}
              <p className="mt-2 font-mono text-[10px] text-[var(--muted-2)]">
                Set {new Date(alert.createdAt).toLocaleString()} · Checked every 30 min during market hours
              </p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
