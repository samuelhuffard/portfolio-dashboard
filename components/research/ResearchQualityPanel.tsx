"use client";

import { useEffect, useState } from "react";

type Quality = {
  attemptedReviews: number;
  investmentJudgments: number;
  dataUnavailable: number;
  operationalDegradation: number;
  decisionBlocked: number;
  proposalsCreated: number;
  unknown: number;
  conservationValid: boolean;
};

type ResearchQualityReport = {
  classificationAvailable: boolean;
  reason?: string;
  runId?: string | null;
  source?: string | null;
  status?: string | null;
  updatedAt?: string | null;
  quality?: Quality | null;
};

const OUTCOMES: Array<{ key: keyof Quality; label: string; detail: string; tone: string }> = [
  { key: "investmentJudgments", label: "Investment HOLD", detail: "A completed review found no action to advance.", tone: "text-emerald-200" },
  { key: "dataUnavailable", label: "Data unavailable", detail: "Missing or stale inputs — not an investment conclusion.", tone: "text-amber-200" },
  { key: "operationalDegradation", label: "Operational issue", detail: "A budget, queue, review, or evaluator fault needs follow-up.", tone: "text-rose-200" },
  { key: "decisionBlocked", label: "Decision blocked", detail: "Review completed but safeguards prevented advancement.", tone: "text-sky-200" },
  { key: "proposalsCreated", label: "Proposals created", detail: "Qualified ideas placed in the approval workflow.", tone: "text-violet-200" },
  { key: "unknown", label: "Unclassified", detail: "An outcome that needs taxonomy follow-up.", tone: "text-slate-300" },
];

function timestamp(value?: string | null) {
  if (!value) return "No completed classified run yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Timestamp unavailable" : date.toLocaleString();
}

export default function ResearchQualityPanel() {
  const [report, setReport] = useState<ResearchQualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/research-quality", { cache: "no-store" });
        const body = (await response.json()) as ResearchQualityReport & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not load the research quality report.");
        if (active) setReport(body);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load the research quality report.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const quality = report?.quality;
  return (
    <section className="terminal-panel overflow-hidden">
      <div className="border-b border-white/10 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-300/75">Research reality</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-white">What the last scan actually found</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              HOLD means an investment judgment. Data gaps and system issues stay separate, so they cannot look like investment decisions.
            </p>
          </div>
          <div className="border border-white/10 bg-white/[0.025] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
            Updated {timestamp(report?.updatedAt)}
          </div>
        </div>
      </div>

      {loading && <div className="px-5 py-8 font-mono text-xs uppercase tracking-[0.18em] text-slate-500">Loading outcome accounting…</div>}
      {error && <div className="m-5 border border-rose-300/30 bg-rose-300/[0.06] px-4 py-3 text-sm text-rose-100">{error}</div>}
      {!loading && !error && !report?.classificationAvailable && (
        <div className="m-5 border border-amber-300/30 bg-amber-300/[0.06] px-4 py-4 text-sm text-amber-100">
          This run cannot yet be classified ({report?.reason ?? "no current outcome record"}). A new completed scan will supply the aggregate accounting.
        </div>
      )}
      {!loading && !error && quality && (
        <>
          <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
            {OUTCOMES.map((outcome) => (
              <div key={outcome.key} className="min-h-32 px-5 py-5 sm:px-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{outcome.label}</p>
                <p className={`mt-3 text-3xl font-bold tracking-[-0.04em] ${outcome.tone}`}>{quality[outcome.key]}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{outcome.detail}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-white/10 bg-white/[0.02] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>{quality.attemptedReviews} reviews reconciled {quality.conservationValid ? "without remainder" : "with a reconciliation issue"}</span>
            <span>Run {report.runId ?? "unavailable"} · {report.source ?? "unknown source"}</span>
          </div>
        </>
      )}
    </section>
  );
}
