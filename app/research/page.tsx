"use client";

import { useState } from "react";
import ResearchForm from "@/components/research/ResearchForm";
import AnalysisReport from "@/components/research/AnalysisReport";
import TickerInput from "@/components/research/TickerInput";
import ComparisonTable from "@/components/research/ComparisonTable";
import MarketScansPanel from "@/components/market-scans/MarketScansPanel";
import type { ResearchResponse, AnalyzeResponse } from "@/lib/research/types";

type LabTab = "research" | "comps" | "scans";

// ─── Single-name research ────────────────────────────────────────────────────

function ResearchTab() {
  const [result, setResult] = useState<ResearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze(ticker: string, focus: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, focus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to analyze company");
      setResult(data as ResearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
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
  }

  return (
    <div className="flex flex-col gap-6">
      <ResearchForm onAnalyze={handleAnalyze} loading={loading} />
      {error && <div className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {result && <AnalysisReport result={result} onExport={handleExport} exporting={exporting} />}
    </div>
  );
}

// ─── Comps ───────────────────────────────────────────────────────────────────

function CompsTab() {
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCompare(tickers: string[]) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to compare companies");
      setResult(data as AnalyzeResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
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
  }

  return (
    <div className="flex flex-col gap-6">
      <TickerInput onCompare={handleCompare} loading={loading} />
      {error && <div className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {result && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Generated {new Date(result.generatedAt).toLocaleString()}
            </h2>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? "Generating…" : "Download Excel"}
            </button>
          </div>
          <ComparisonTable companies={result.companies} />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { id: LabTab; label: string; description: string }[] = [
  { id: "research", label: "Research", description: "Single-name fundamentals, focused read, export analyst note" },
  { id: "comps", label: "Comps", description: "Compare up to five companies side by side" },
  { id: "scans", label: "Scans", description: "Robinhood MCP scanner feed for agent research candidates" },
];

export default function LabPage() {
  const [tab, setTab] = useState<LabTab>("research");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-5">
      <div className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-300/75">Analyst Lab</p>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Lab</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{active.description}</p>
      </div>

      <div className="flex gap-0 border border-white/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 border-r border-white/10 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.2em] transition-colors last:border-r-0 ${
              tab === t.id
                ? "bg-white/[0.05] text-white"
                : "bg-transparent text-slate-500 hover:bg-white/[0.02] hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "research" && <ResearchTab />}
      {tab === "comps" && <CompsTab />}
      {tab === "scans" && <MarketScansPanel showHeader={false} />}
    </div>
  );
}
