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
      <div className="pm-panel border border-[var(--rule)] p-5 sm:p-6">
        <p className="pm-label">Research Archive</p>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-[var(--ink)]">Report history</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Past research reports and comparisons. Re-download any report as an Excel workbook.
        </p>
      </div>

      {error && (
        <div className="border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-3 text-sm text-[var(--warn)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="pm-panel border border-[var(--rule)] p-6 font-mono text-sm uppercase tracking-[0.2em] text-[var(--muted)]">
          Loading…
        </div>
      ) : (
        <HistoryList reports={reports} />
      )}
    </div>
  );
}
