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

  if (loading) return <p className="text-stone-500">Loading...</p>;

  if (error) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold text-stone-900 mb-2">News</h1>
        <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900 mb-6">News</h1>

      {!news || news.length === 0 ? (
        <p className="text-sm text-stone-500">
          No news yet — research-scan pulls headlines alongside each recommendation.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {news.map((item, i) => (
            <div key={`${item.date}-${item.ticker}-${i}`} className="bg-white rounded-xl border border-stone-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-stone-900">{item.ticker}</span>
                <span className="text-xs text-stone-400">{item.date}</span>
              </div>
              <p className="text-sm text-stone-700 mb-2">{item.rationale}</p>
              <div className="flex flex-col gap-1">
                {item.links.map((link, j) => (
                  <a
                    key={j}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-600 hover:underline truncate"
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
