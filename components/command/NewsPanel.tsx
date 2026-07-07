'use client';

import { useEffect, useState } from 'react';

interface NewsItem {
  date: string;
  ticker: string;
  action: string;
  rationale: string;
  links: string[];
}

/** Compact News / Catalysts feed for the Command Center — headlines derived from the Recommendations sheet tab via /api/news. */
export default function NewsPanel() {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/news')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setNews(Array.isArray(json.news) ? json.news : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load news');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = (news ?? []).slice(0, 8);

  return (
    <section className="terminal-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-200/70">Market Catalysts</p>
          <h2 className="text-lg font-semibold text-white">News / Catalysts</h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
          {loading ? 'Loading' : `${items.length} items`}
        </span>
      </div>

      {loading ? (
        <p className="p-5 font-mono text-xs uppercase tracking-[0.2em] text-slate-500">Pulling headlines...</p>
      ) : error ? (
        <p className="m-4 border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 sm:m-5">{error}</p>
      ) : items.length === 0 ? (
        <p className="p-5 text-sm text-slate-400">
          No catalysts on the tape yet — the research scan attaches headlines to each signal it files.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {items.map((item, i) => (
            <li key={`${item.date}-${item.ticker}-${i}`} className="px-4 py-3 sm:px-5">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="font-mono text-sm font-semibold text-white">{item.ticker}</span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">{item.date}</span>
              </div>
              <p className="line-clamp-2 text-xs leading-5 text-slate-400">{item.rationale}</p>
              {item.links.length > 0 && (
                <a
                  href={item.links[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate font-mono text-[11px] text-cyan-200 hover:text-emerald-200"
                >
                  {item.links[0]}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
