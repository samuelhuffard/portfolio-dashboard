import ReactMarkdown from "react-markdown";
import type { ResearchResponse } from "@/lib/research/types";
import MetricSnapshot from "@/components/research/MetricSnapshot";

interface AnalysisReportProps {
  result: ResearchResponse;
  onExport: () => void;
  exporting: boolean;
}

export default function AnalysisReport({ result, onExport, exporting }: AnalysisReportProps) {
  const { company } = result;

  return (
    <div className="flex flex-col gap-6">
      <div className="pm-panel border border-[var(--rule)] flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">{company.name}</h2>
            <span className="border border-[var(--rule)] bg-[var(--panel-alt)] px-2 py-0.5 font-mono text-xs font-medium text-[var(--pos)]">
              {company.ticker}
            </span>
          </div>
          {(company.sector || company.industry) && (
            <p className="text-sm text-[var(--muted)]">
              {[company.sector, company.industry].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="font-mono text-xs text-[var(--muted)]">
            Generated {new Date(result.generatedAt).toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="shrink-0 border border-[var(--rule)] bg-[var(--panel-alt)] px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-[var(--pos)] transition-colors hover:bg-[var(--panel-alt)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? "Generating…" : "Download Excel"}
        </button>
      </div>

      {result.focus && (
        <div className="border border-[var(--rule)] bg-[var(--panel-alt)] px-5 py-3 text-sm">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--warn)]">Focus: </span>
          <span className="text-[var(--ink-2)]">{result.focus}</span>
        </div>
      )}

      <div className="pm-panel border border-[var(--rule)] p-5 sm:p-6">
        <article className="prose prose-invert prose-sm max-w-none prose-headings:font-semibold prose-h2:mb-2 prose-h2:mt-6 prose-h2:text-lg prose-h2:text-[var(--ink)] prose-h3:text-base">
          <ReactMarkdown>{result.analysis}</ReactMarkdown>
        </article>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Data Snapshot</h3>
        <MetricSnapshot company={company} />
      </div>
    </div>
  );
}
