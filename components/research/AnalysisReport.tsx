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
      <div className="terminal-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-white">{company.name}</h2>
            <span className="border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 font-mono text-xs font-medium text-emerald-200">
              {company.ticker}
            </span>
          </div>
          {(company.sector || company.industry) && (
            <p className="text-sm text-slate-400">
              {[company.sector, company.industry].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="font-mono text-xs text-slate-500">
            Generated {new Date(result.generatedAt).toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="shrink-0 border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? "Generating…" : "Download Excel"}
        </button>
      </div>

      {result.focus && (
        <div className="border border-amber-200/20 bg-amber-200/[0.04] px-5 py-3 text-sm">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">Focus: </span>
          <span className="text-slate-300">{result.focus}</span>
        </div>
      )}

      <div className="terminal-panel p-5 sm:p-6">
        <article className="prose prose-invert prose-sm max-w-none prose-headings:font-semibold prose-h2:mb-2 prose-h2:mt-6 prose-h2:text-lg prose-h2:text-white prose-h3:text-base">
          <ReactMarkdown>{result.analysis}</ReactMarkdown>
        </article>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Data Snapshot</h3>
        <MetricSnapshot company={company} />
      </div>
    </div>
  );
}
