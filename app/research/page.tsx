"use client";

import { useState } from "react";
import { DefRow, Footnote, Panel, RailBlock, ScreenGrid } from "@/components/chrome";
import ResearchForm from "@/components/research/ResearchForm";
import AnalysisReport from "@/components/research/AnalysisReport";
import TickerInput from "@/components/research/TickerInput";
import ComparisonTable from "@/components/research/ComparisonTable";
import AgentResearchPanel from "@/components/research/AgentResearchPanel";
import type { ResearchResponse, AnalyzeResponse } from "@/lib/research/types";

type LabTab = "research" | "comps";

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
      {error && <div className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-3 text-sm text-[var(--warn)]">{error}</div>}
      {result && <AnalysisReport result={result} onExport={handleExport} exporting={exporting} />}
      <AgentResearchPanel defaultTicker={result?.ticker} />
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
      {error && <div className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-3 text-sm text-[var(--warn)]">{error}</div>}
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
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { id: LabTab; label: string; description: string }[] = [
  { id: "research", label: "Research", description: "Single-name fundamentals, focused read, export analyst note" },
  { id: "comps", label: "Comps", description: "Compare up to five companies side by side" },
];

export default function LabPage() {
  const [tab, setTab] = useState<LabTab>("research");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <ScreenGrid
      main={
        <>
          {/* The screen is named in the nav, so this toolbar carries the scope
              switch and the standing caveat instead of a hero panel. */}
          <Panel>
            <div className="flex items-center justify-between" style={{ padding: "9px 18px" }}>
              <div className="flex items-center" style={{ gap: 10 }}>
                <div className="pm-seg" role="group" aria-label="Lab scope">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={tab === t.id}
                      onClick={() => setTab(t.id)}
                      className="pm-seg-item"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <span className="pm-caption">{active.description}</span>
              </div>
              <span className="pm-caption">Runs are queued and logged · no live trading</span>
            </div>
          </Panel>

          {tab === "research" && <ResearchTab />}
          {tab === "comps" && <CompsTab />}
        </>
      }
      rail={
        <>
          <RailBlock title="Method">
            <p style={{ margin: "0 0 9px", fontSize: 12, color: "var(--ink-2)" }}>
              Fair value is a discounted cash-flow estimate; screens use reported fundamentals only.
              Figures are research output, not a recommendation to trade.
            </p>
          </RailBlock>
          <RailBlock title="Scope" grow>
            <div className="flex flex-col">
              <DefRow label="Mode">{active.label}</DefRow>
              <DefRow label="Execution">Not permitted</DefRow>
              <DefRow label="Record">Runs are logged</DefRow>
            </div>
          </RailBlock>
          <Footnote label="Caveat">
            Estimates are research output, not a recommendation to trade. Partial data is labelled
            rather than filled in.
          </Footnote>
        </>
      }
    />
  );
}
