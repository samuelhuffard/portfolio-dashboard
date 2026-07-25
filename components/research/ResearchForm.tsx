"use client";

import { useState } from "react";

interface ResearchFormProps {
  onAnalyze: (ticker: string, focus: string) => void;
  loading: boolean;
}

const EXAMPLE_PROMPTS = [
  "Focus on balance sheet strength and debt risk",
  "How does this compare to its growth story?",
  "Is the valuation justified by profitability?",
];

export default function ResearchForm({ onAnalyze, loading }: ResearchFormProps) {
  const [ticker, setTicker] = useState("");
  const [focus, setFocus] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = ticker.trim().toUpperCase();
    if (!cleaned) return;
    onAnalyze(cleaned, focus.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="pm-panel border border-[var(--rule)] flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ticker" className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
          Ticker
        </label>
        <input
          id="ticker"
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="e.g. AAPL"
          maxLength={10}
          className="w-full max-w-xs border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-base font-medium uppercase tracking-wide text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="focus" className="text-sm font-medium text-[var(--ink-2)]">
          What should the analysis focus on?{" "}
          <span className="font-normal text-[var(--muted)]">(optional)</span>
        </label>
        <textarea
          id="focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder={`e.g. "${EXAMPLE_PROMPTS[0]}"`}
          rows={3}
          className="w-full resize-none border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:border-[var(--rule)] focus:outline-none"
        />
        <div className="flex flex-wrap gap-2 pt-1">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setFocus(prompt)}
              className="border border-[var(--rule)] bg-[var(--panel-alt)] px-3 py-1 font-mono text-[10px] text-[var(--accent)] transition-colors hover:border-[var(--rule)] hover:text-[var(--accent)]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !ticker.trim()}
        className="self-start border border-[var(--rule)] bg-[var(--panel-alt)] px-6 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--pos)] transition-colors hover:bg-[var(--panel-alt)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Researching…" : "Analyze Company"}
      </button>
    </form>
  );
}
