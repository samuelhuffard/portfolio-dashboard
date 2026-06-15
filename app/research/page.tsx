"use client";

import { useState } from "react";
import ResearchForm from "@/components/research/ResearchForm";
import AnalysisReport from "@/components/research/AnalysisReport";
import type { ResearchResponse } from "@/lib/research/types";

export default function ResearchPage() {
  const [result, setResult] = useState<ResearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (ticker: string, focus: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, focus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to analyze company");
      }
      setResult(data as ResearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!result) return;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/research/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to generate Excel file");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `research-${result.ticker}-${result.reportId.slice(0, 8)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-300/75">Analyst Lab</p>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Single-name research</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Pull fundamentals, ask for a focused read, and export the analyst note with the metric snapshot.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <ResearchForm onAnalyze={handleAnalyze} loading={loading} />

        {error && (
          <div className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {result && <AnalysisReport result={result} onExport={handleExport} exporting={exporting} />}
      </div>
    </div>
  );
}
