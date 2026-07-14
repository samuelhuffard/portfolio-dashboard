import { TICKER_RE } from "./contracts/proposal";

function rowLabel(rowOrLabel: unknown): string {
  const raw = Array.isArray(rowOrLabel) ? rowOrLabel[0] : rowOrLabel;
  return String(raw ?? "").trim();
}

export function holdingRowLabel(rowOrLabel: unknown): string {
  return rowLabel(rowOrLabel);
}

export function isHoldingMarkerRow(rowOrLabel: unknown): boolean {
  const label = rowLabel(rowOrLabel);
  return (
    !label ||
    /^cash$/i.test(label) ||
    /^last synced\b/i.test(label) ||
    /^synced via robinhood agentic mcp\b/i.test(label) ||
    label.startsWith("⚠️")
  );
}

export function isSecurityHoldingRow(rowOrLabel: unknown): boolean {
  const label = rowLabel(rowOrLabel);
  return Boolean(label) && !isHoldingMarkerRow(label) && TICKER_RE.test(label);
}
