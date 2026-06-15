import type { ReportSummary } from "@/lib/research/types";

interface HistoryListProps {
  reports: ReportSummary[];
}

export default function HistoryList({ reports }: HistoryListProps) {
  if (reports.length === 0) {
    return (
      <div className="terminal-panel p-6 text-sm text-slate-400">
        No reports yet. Run a research or comparison to see it here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reports.map((report) => (
        <div
          key={report.id}
          className="market-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                  report.kind === "research"
                    ? "border border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                    : "border border-cyan-200/25 bg-cyan-200/10 text-cyan-200"
                }`}
              >
                {report.kind === "research" ? "Research" : "Comparison"}
              </span>
              <span className="font-mono font-medium text-white">{report.tickers.join(", ")}</span>
            </div>
            {report.focus && <p className="text-sm text-slate-400">{report.focus}</p>}
            <p className="font-mono text-xs text-slate-500">{new Date(report.generatedAt).toLocaleString()}</p>
          </div>
          <a
            href={`/api/history/export?id=${report.id}`}
            className="self-start border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 sm:self-center"
          >
            Download Excel
          </a>
        </div>
      ))}
    </div>
  );
}
