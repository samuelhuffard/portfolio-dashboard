'use client';

import { useEffect, useState } from 'react';
import type { Recommendation } from '@/lib/sheets';

const ACTION_STYLES: Record<string, string> = {
  BUY: 'border-emerald-300/35 bg-emerald-300/10 text-emerald-200',
  SELL: 'border-red-300/35 bg-red-300/10 text-red-200',
  HOLD: 'border-slate-300/20 bg-slate-300/10 text-slate-200',
};

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/recommendations')
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setRecommendations(json.recommendations);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading signals...</p>;

  if (error) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-2 text-2xl font-semibold text-white">Signals</h1>
        <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-300/75">AI Overlay</p>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Signal Queue</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          Quant-ranked candidates with qualitative overlays, news context, and manual-execution status.
        </p>
      </div>

      {!recommendations || recommendations.length === 0 ? (
        <p className="terminal-panel p-5 text-sm text-slate-400">
          No recommendations yet — run research-scan to generate the first batch.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {recommendations.map((r, i) => (
            <div key={`${r.date}-${r.ticker}-${i}`} className="market-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-lg font-semibold text-white">{r.ticker}</span>
                  <span className={`border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] ${ACTION_STYLES[r.action] ?? 'border-slate-300/20 bg-slate-300/10 text-slate-200'}`}>
                    {r.action}
                  </span>
                  {r.quantScore !== null && (
                    <span className="font-mono text-xs text-cyan-200">Q {r.quantScore.toFixed(1)}</span>
                  )}
                </div>
                <span className="font-mono text-xs text-slate-500">{r.date}</span>
              </div>
              <p className="mb-3 text-sm leading-6 text-slate-300">{r.rationale}</p>
              {r.newsLinks && (
                <div className="flex flex-wrap gap-2">
                  {r.newsLinks.split(',').map((link, j) => {
                    const trimmed = link.trim();
                    if (!trimmed) return null;
                    return (
                      <a
                        key={j}
                        href={trimmed}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="max-w-xs truncate border border-cyan-200/15 bg-cyan-200/[0.04] px-2 py-1 font-mono text-[10px] text-cyan-200 hover:border-cyan-200/35"
                      >
                        {trimmed}
                      </a>
                    );
                  })}
                </div>
              )}
              {r.status && (
                <span className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Status: {r.status}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
