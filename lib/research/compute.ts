import type { RawCompanyData } from "@/lib/research/yahoo";
import type { CompanyData } from "@/lib/research/types";
import { METRIC_REGISTRY } from "@/lib/research/registry";

/** Applies the metric registry to a company's raw Yahoo data, producing the normalized CompanyData shape. */
export function computeCompanyData(raw: RawCompanyData): CompanyData {
  if (raw.error || !raw.raw) {
    return {
      ticker: raw.ticker,
      name: raw.name,
      sector: raw.sector,
      industry: raw.industry,
      error: raw.error ?? "No data returned",
      metrics: {},
    };
  }

  const metrics: Record<string, number | null> = {};
  for (const metric of METRIC_REGISTRY) {
    const value = metric.get(raw.raw);
    metrics[metric.id] = value === undefined || value === null || Number.isNaN(value) ? null : value;
  }

  return {
    ticker: raw.ticker,
    name: raw.name,
    sector: raw.sector,
    industry: raw.industry,
    metrics,
  };
}

export function computeCompaniesData(rawList: RawCompanyData[]): CompanyData[] {
  return rawList.map(computeCompanyData);
}
