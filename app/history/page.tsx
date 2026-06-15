"use client";

import { useEffect, useState } from "react";
import HistoryList from "@/components/research/HistoryList";
import type { ReportSummary } from "@/lib/research/types";

export default function HistoryPage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/history");
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load history");
        }
        setReports(data.reports as ReportSummary[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Research Archive</p>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Report history</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Past research reports and comparisons. Re-download any report as an Excel workbook.
        </p>
      </div>

      {error && (
        <div className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="terminal-panel p-6 font-mono text-sm uppercase tracking-[0.2em] text-slate-400">
          Loading…
        </div>
      ) : (
        <HistoryList reports={reports} />
      )}
    </div>
  );
}
