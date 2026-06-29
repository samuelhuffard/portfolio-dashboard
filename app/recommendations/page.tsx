'use client';

import { useEffect, useState } from 'react';
import type { Recommendation } from '@/lib/sheets';

interface NewsItem {
  date: string;
  ticker: string;
  action: string;
  rationale: string;
  links: string[];
}

const ACTION_STYLES: Record<string, string> = {
  BUY: 'border-emerald-300/35 bg-emerald-300/10 text-emerald-200',
  SELL: 'border-red-300/35 bg-red-300/10 text-red-200',
  HOLD: 'border-slate-300/20 bg-slate-300/10 text-slate-200',
};

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);

  function loadRecommendations() {
    setLoading(true);
    fetch('/api/recommendations')
      .then((res) => res.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setRecommendations(json.recommendations);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRecommendations();
    fetch('/api/news')
      .then((r) => r.json())
      .then((j) => { if (!j.error) setNews(j.news); })
      .catch(() => {});
  }, []);

  async function runScan() {
    setScanning(true);
    setScanMessage(null);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setScanMessage(json.error ?? 'Scan failed');
      } else {
        setScanMessage('All three agents are scanning — cash-capped proposals will appear in Approvals when ready.');
      }
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setScanning(false);
    }
  }

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
          Quant-ranked candidates with qualitative overlays, news context, and acceptance/tracking status.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={runScan}
            disabled={scanning}
            className="border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-emerald-200 hover:border-emerald-400/70 hover:bg-emerald-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {scanning ? 'Running...' : 'Run Scan Now'}
          </button>
          <button
            onClick={loadRecommendations}
            className="border border-slate-400/20 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-slate-400 hover:border-slate-400/40 hover:text-slate-300 transition-colors"
          >
            Refresh
          </button>
          {scanMessage && (
            <p className="font-mono text-xs text-slate-400">{scanMessage}</p>
          )}
        </div>
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

      <div className="border-t border-white/[0.06] pt-6">
        <div className="terminal-panel p-5 sm:p-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Market Catalysts</p>
          <h2 className="text-2xl font-black tracking-[-0.03em] text-white">News Tape</h2>
          <p className="mt-2 text-sm text-slate-400">Headlines attached to research signals.</p>
        </div>

        {!news || news.length === 0 ? (
          <p className="mt-3 terminal-panel p-5 text-sm text-slate-400">
            No catalysts yet — research-scan pulls headlines alongside each recommendation.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
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
    </div>
  );
}
