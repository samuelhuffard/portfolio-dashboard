'use client';

import { useEffect, useState } from 'react';

interface NewsItem {
  date: string;
  ticker: string;
  action: string;
  rationale: string;
  links: string[];
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/news')
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setNews(json.news);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading catalysts...</p>;

  if (error) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-2 text-2xl font-semibold text-white">Catalysts</h1>
        <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Market Catalysts</p>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white">News Tape</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          Headlines attached to research signals, kept close to the decision trail.
        </p>
      </div>

      {!news || news.length === 0 ? (
        <p className="terminal-panel p-5 text-sm text-slate-400">
          No news yet — research-scan pulls headlines alongside each recommendation.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {news.map((item, i) => (
            <div key={`${item.date}-${item.ticker}-${i}`} className="market-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-lg font-semibold text-white">{item.ticker}</span>
                <span className="font-mono text-xs text-slate-500">{item.date}</span>
              </div>
              <p className="mb-3 text-sm leading-6 text-slate-300">{item.rationale}</p>
              <div className="flex flex-col gap-1">
                {item.links.map((link, j) => (
                  <a
                    key={j}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-mono text-[11px] text-cyan-200 hover:text-emerald-200"
                  >
                    {link}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
