"use client";

import { useState } from "react";

interface TickerInputProps {
  onCompare: (tickers: string[]) => void;
  loading: boolean;
}

const MAX_TICKERS = 5;

export default function TickerInput({ onCompare, loading }: TickerInputProps) {
  const [tickers, setTickers] = useState<string[]>(["", ""]);

  const updateTicker = (index: number, value: string) => {
    setTickers((prev) => prev.map((t, i) => (i === index ? value.toUpperCase() : t)));
  };

  const addTicker = () => {
    if (tickers.length >= MAX_TICKERS) return;
    setTickers((prev) => [...prev, ""]);
  };

  const removeTicker = (index: number) => {
    setTickers((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)));
    if (cleaned.length === 0) return;
    onCompare(cleaned);
  };

  return (
    <form onSubmit={handleSubmit} className="terminal-panel flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">Tickers</label>
        <div className="flex flex-wrap gap-2">
          {tickers.map((ticker, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                type="text"
                value={ticker}
                onChange={(e) => updateTicker(index, e.target.value)}
                placeholder={`e.g. ${index === 0 ? "AAPL" : "MSFT"}`}
                maxLength={10}
                className="w-28 border border-white/10 bg-black/30 px-3 py-2 font-mono text-base font-medium uppercase tracking-wide text-white placeholder:text-slate-600 focus:border-cyan-200/60 focus:outline-none"
              />
              {tickers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTicker(index)}
                  className="text-slate-500 hover:text-red-300"
                  aria-label="Remove ticker"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {tickers.length < MAX_TICKERS && (
            <button
              type="button"
              onClick={addTicker}
              className="border border-dashed border-cyan-200/20 px-3 py-2 font-mono text-xs text-cyan-200/75 transition-colors hover:border-cyan-200/45 hover:text-cyan-100"
            >
              + Add ticker
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">Compare up to {MAX_TICKERS} companies side by side.</p>
      </div>

      <button
        type="submit"
        disabled={loading || tickers.every((t) => !t.trim())}
        className="self-start border border-emerald-300/40 bg-emerald-300/10 px-6 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Comparing…" : "Compare"}
      </button>
    </form>
  );
}
