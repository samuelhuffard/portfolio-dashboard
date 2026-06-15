import type { MetricFormat } from "@/lib/research/types";

/** Abbreviates large dollar figures for in-browser display (e.g. 3.45T, 152.3B). */
export function formatLargeNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

/** Renders a metric value for the in-browser metric grid. */
export function formatMetricValue(value: number | null | undefined, format: MetricFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";

  switch (format) {
    case "currency":
      return `$${value.toFixed(2)}`;
    case "percent":
      return `${(value * 100).toFixed(2)}%`;
    case "ratio":
      return value.toFixed(2);
    case "largeNumber":
      return formatLargeNumber(value);
    case "number":
      return value.toFixed(2);
    default:
      return String(value);
  }
}

/** Excel cell number formats per metric format, for exceljs `numFmt`. */
export const EXCEL_NUMBER_FORMATS: Record<MetricFormat, string> = {
  currency: '"$"#,##0.00',
  percent: "0.00%",
  ratio: "0.00",
  largeNumber: '"$"#,##0',
  number: "0.00",
};
