"use client";

import { useState } from "react";
import TickerInput from "@/components/research/TickerInput";
import ComparisonTable from "@/components/research/ComparisonTable";
import type { AnalyzeResponse } from "@/lib/research/types";

export default function ComparePage() {
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompare = async (tickers: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to compare companies");
      }
      setResult(data as AnalyzeResponse);
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
      const res = await fetch("/api/compare/export", {
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
      const tickers = result.companies.map((c) => c.ticker).join("-");
      a.download = `compare-${tickers}-${result.reportId.slice(0, 8)}.xlsx`;
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
      <div className="pm-panel border border-[var(--rule)] p-5 sm:p-6">
        <p className="pm-label">Comps Desk</p>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-[var(--ink)]">Fundamental comparison</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Compare up to five listed companies side by side and export the full workbook.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <TickerInput onCompare={handleCompare} loading={loading} />

        {error && (
          <div className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-3 text-sm text-[var(--warn)]">
            {error}
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                Generated {new Date(result.generatedAt).toLocaleString()}
              </h2>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--pos)] transition-colors hover:bg-[var(--panel-alt)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting ? "Generating…" : "Download Excel"}
              </button>
            </div>
            <ComparisonTable companies={result.companies} />
          </div>
        )}
      </div>
    </div>
  );
}
