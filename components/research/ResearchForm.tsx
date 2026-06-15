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
    <form onSubmit={handleSubmit} className="terminal-panel flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ticker" className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">
          Ticker
        </label>
        <input
          id="ticker"
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="e.g. AAPL"
          maxLength={10}
          className="w-full max-w-xs border border-white/10 bg-black/30 px-3 py-2 font-mono text-base font-medium uppercase tracking-wide text-white placeholder:text-slate-600 focus:border-emerald-300/60 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="focus" className="text-sm font-medium text-slate-300">
          What should the analysis focus on?{" "}
          <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <textarea
          id="focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder={`e.g. "${EXAMPLE_PROMPTS[0]}"`}
          rows={3}
          className="w-full resize-none border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/60 focus:outline-none"
        />
        <div className="flex flex-wrap gap-2 pt-1">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setFocus(prompt)}
              className="border border-cyan-200/15 bg-cyan-200/[0.03] px-3 py-1 font-mono text-[10px] text-cyan-200/75 transition-colors hover:border-cyan-200/35 hover:text-cyan-100"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !ticker.trim()}
        className="self-start border border-emerald-300/40 bg-emerald-300/10 px-6 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Researching…" : "Analyze Company"}
      </button>
    </form>
  );
}
