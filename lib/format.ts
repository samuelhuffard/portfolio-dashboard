export function fmtCurrency(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

export function fmtNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * The colour a signed result is drawn in — the single place that decides what a
 * gain and a loss look like.
 *
 * Call sites previously hand-rolled `value >= 0 ? 'var(--pos)' : 'var(--ink)'`,
 * which drew every loss in plain body ink and made losses invisible as losses.
 * A figure with no value is muted rather than neutral, so "no data" never reads
 * as "flat".
 */
export function gainLossColor(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "var(--muted)";
  return value >= 0 ? "var(--pos)" : "var(--neg)";
}

/** The de-emphasised companion colour, for the secondary figure beside a result. */
export function gainLossSoftColor(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "var(--muted-2)";
  return value >= 0 ? "var(--pos-soft)" : "var(--neg-soft)";
}

/** `Metric`/`Status` tone for a signed result. */
export function gainLossTone(value: number | null | undefined): "pos" | "neg" | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  return value >= 0 ? "pos" : "neg";
}
