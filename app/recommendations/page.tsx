'use client';

import { useEffect, useState } from 'react';
import type { Recommendation } from '@/lib/sheets';

const ACTION_STYLES: Record<string, string> = {
  BUY: 'bg-emerald-100 text-emerald-700',
  SELL: 'bg-red-100 text-red-700',
  HOLD: 'bg-stone-100 text-stone-600',
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

  if (loading) return <p className="text-stone-500">Loading...</p>;

  if (error) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold text-stone-900 mb-2">Recommendations</h1>
        <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900 mb-6">Recommendations</h1>

      {!recommendations || recommendations.length === 0 ? (
        <p className="text-sm text-stone-500">
          No recommendations yet — run research-scan to generate the first batch.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {recommendations.map((r, i) => (
            <div key={`${r.date}-${r.ticker}-${i}`} className="bg-white rounded-xl border border-stone-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-stone-900">{r.ticker}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_STYLES[r.action] ?? 'bg-stone-100 text-stone-600'}`}>
                    {r.action}
                  </span>
                  {r.quantScore !== null && (
                    <span className="text-xs text-stone-500">Quant score: {r.quantScore.toFixed(1)}</span>
                  )}
                </div>
                <span className="text-xs text-stone-400">{r.date}</span>
              </div>
              <p className="text-sm text-stone-700 mb-2">{r.rationale}</p>
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
                        className="text-xs text-emerald-600 hover:underline truncate max-w-xs"
                      >
                        {trimmed}
                      </a>
                    );
                  })}
                </div>
              )}
              {r.status && (
                <span className="inline-block mt-2 text-xs text-stone-400">Status: {r.status}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
