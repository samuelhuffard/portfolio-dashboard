import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";

export type MetricFormat = "currency" | "percent" | "ratio" | "largeNumber" | "number";

export interface MetricDefinition {
  id: string;
  label: string;
  category: string;
  format: MetricFormat;
  /** Short plain-English explanation of what this metric means, for non-finance readers. */
  description: string;
  get: (raw: QuoteSummaryResult) => number | null | undefined;
}

export interface CompanyData {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  error?: string;
  metrics: Record<string, number | null>;
}

/** Deep-dive AI analysis of a single company. */
export interface ResearchRequest {
  ticker: string;
  focus?: string;
}

export interface ResearchResponse {
  kind: "research";
  reportId: string;
  generatedAt: string;
  ticker: string;
  focus?: string;
  company: CompanyData;
  analysis: string;
}

/** Secondary flow: side-by-side metric comparison across multiple tickers. */
export interface AnalyzeRequest {
  tickers: string[];
}

export interface AnalyzeResponse {
  kind: "comparison";
  reportId: string;
  generatedAt: string;
  companies: CompanyData[];
}

export type StoredReport = ResearchResponse | AnalyzeResponse;

export interface ReportSummary {
  id: string;
  kind: "research" | "comparison";
  tickers: string[];
  focus?: string;
  generatedAt: string;
}
