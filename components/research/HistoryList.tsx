import type { ReportSummary } from "@/lib/research/types";

interface HistoryListProps {
  reports: ReportSummary[];
}

export default function HistoryList({ reports }: HistoryListProps) {
  if (reports.length === 0) {
    return (
      <div className="pm-panel border border-[var(--rule)] p-6 text-sm text-[var(--muted)]">
        No reports yet. Run a research or comparison to see it here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reports.map((report) => (
        <div
          key={report.id}
          className="pm-panel border border-[var(--rule)] flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 text-xs font-medium ${
                  report.kind === "research"
                    ? "border border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--pos)]"
                    : "border border-[var(--rule)] bg-[var(--panel-alt)] text-[var(--accent)]"
                }`}
              >
                {report.kind === "research" ? "Research" : "Comparison"}
              </span>
              <span className="font-mono font-medium text-[var(--ink)]">{report.tickers.join(", ")}</span>
            </div>
            {report.focus && <p className="text-sm text-[var(--muted)]">{report.focus}</p>}
            <p className="font-mono text-xs text-[var(--muted)]">{new Date(report.generatedAt).toLocaleString()}</p>
          </div>
          <a
            href={`/api/history/export?id=${report.id}`}
            className="self-start border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--pos)] transition-colors hover:bg-[var(--panel-alt)] sm:self-center"
          >
            Download Excel
          </a>
        </div>
      ))}
    </div>
  );
}
