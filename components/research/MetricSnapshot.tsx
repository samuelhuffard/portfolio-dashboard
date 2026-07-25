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
        <div key={category} className="pm-panel border border-[var(--rule)] p-4">
          <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
            {category}
          </h3>
          <dl className="flex flex-col gap-1.5">
            {METRIC_REGISTRY.filter((m) => m.category === category).map((metric) => (
              <div key={metric.id} className="flex items-center justify-between text-sm">
                <dt className="text-[var(--muted)]">{metric.label}</dt>
                <dd className="font-mono font-medium tabular-nums text-[var(--ink)]">
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
