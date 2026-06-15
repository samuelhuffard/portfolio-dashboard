import { Fragment } from "react";
import type { CompanyData } from "@/lib/research/types";
import { METRIC_REGISTRY, METRIC_CATEGORIES } from "@/lib/research/registry";
import { formatMetricValue } from "@/lib/research/format";

interface ComparisonTableProps {
  companies: CompanyData[];
}

export default function ComparisonTable({ companies }: ComparisonTableProps) {
  const validCompanies = companies.filter((c) => !c.error);
  const erroredCompanies = companies.filter((c) => c.error);

  return (
    <div className="flex flex-col gap-4">
      {erroredCompanies.length > 0 && (
        <div className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {erroredCompanies.map((c) => (
            <div key={c.ticker}>
              {c.ticker}: {c.error}
            </div>
          ))}
        </div>
      )}

      {validCompanies.length > 0 && (
        <div className="terminal-panel overflow-x-auto">
          <table className="data-table w-full min-w-max text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 px-4 py-3 text-left">
                  Metric
                </th>
                {validCompanies.map((c) => (
                  <th key={c.ticker} className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="text-white">{c.ticker}</div>
                    <div className="text-xs font-normal normal-case tracking-normal text-slate-500">{c.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIC_CATEGORIES.map((category) => (
                <Fragment key={category}>
                  <tr className="bg-cyan-200/[0.04]">
                    <td
                      colSpan={validCompanies.length + 1}
                      className="px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70"
                    >
                      {category}
                    </td>
                  </tr>
                  {METRIC_REGISTRY.filter((m) => m.category === category).map((metric) => (
                    <tr key={metric.id}>
                      <td className="sticky left-0 z-10 bg-[#071019] px-4 py-2 text-slate-400">
                        {metric.label}
                      </td>
                      {validCompanies.map((c) => (
                        <td key={c.ticker} className="px-4 py-2 text-right font-mono font-medium tabular-nums text-white">
                          {formatMetricValue(c.metrics[metric.id], metric.format)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
