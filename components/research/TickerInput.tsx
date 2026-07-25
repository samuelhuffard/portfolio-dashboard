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
    <form onSubmit={handleSubmit} className="pm-panel border border-[var(--rule)] flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">Tickers</label>
        <div className="flex flex-wrap gap-2">
          {tickers.map((ticker, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                type="text"
                value={ticker}
                onChange={(e) => updateTicker(index, e.target.value)}
                placeholder={`e.g. ${index === 0 ? "AAPL" : "MSFT"}`}
                maxLength={10}
                className="w-28 border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-base font-medium uppercase tracking-wide text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none"
              />
              {tickers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTicker(index)}
                  className="text-[var(--muted)] hover:text-[var(--warn)]"
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
              className="border border-dashed border-[var(--rule)] px-3 py-2 font-mono text-xs text-[var(--accent)] transition-colors hover:border-[var(--rule)] hover:text-[var(--accent)]"
            >
              + Add ticker
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--muted)]">Compare up to {MAX_TICKERS} companies side by side.</p>
      </div>

      <button
        type="submit"
        disabled={loading || tickers.every((t) => !t.trim())}
        className="self-start border border-[var(--rule)] bg-[var(--panel-alt)] px-6 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--pos)] transition-colors hover:bg-[var(--panel-alt)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Comparing…" : "Compare"}
      </button>
    </form>
  );
}
