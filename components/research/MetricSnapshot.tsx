import type { CompanyData } from "@/lib/research/types";
import { METRIC_REGISTRY, METRIC_CATEGORIES } from "@/lib/research/registry";
import { formatMetricValue } from "@/lib/research/format";

interface MetricSnapshotProps {
  company: CompanyData;
}

/** Grid of category cards showing every metric in the registry for a single company. */
export default function MetricSnapshot({ company }: MetricSnapshotProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {METRIC_CATEGORIES.map((category) => (
        <div key={category} className="market-card p-4">
          <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {category}
          </h3>
          <dl className="flex flex-col gap-1.5">
            {METRIC_REGISTRY.filter((m) => m.category === category).map((metric) => (
              <div key={metric.id} className="flex items-center justify-between text-sm">
                <dt className="text-slate-400">{metric.label}</dt>
                <dd className="font-mono font-medium tabular-nums text-white">
                  {formatMetricValue(company.metrics[metric.id], metric.format)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
