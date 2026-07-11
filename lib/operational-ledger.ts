import { createHmac, timingSafeEqual } from "node:crypto";

export type OperationalLedgerKind = "performance" | "trade" | "lot";

const FIELDS: Record<OperationalLedgerKind, string[]> = {
  performance: ["date", "portfolioValue", "spyPrice", "unitsOutstanding", "navPerUnit"],
  trade: ["date", "ticker", "side", "shares", "price", "amount", "orderId", "agentId", "proposalId", "realizedGain"],
  lot: ["lotId", "ticker", "openDate", "agentId", "costPerShare", "sharesOriginal", "sharesOpen", "status"],
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

export function getOperationalLedgerSecret(): string {
  const secret = process.env.OPERATIONAL_LEDGER_HMAC_SECRET?.trim()
    || process.env.INVESTOR_LEDGER_HMAC_SECRET?.trim()
    || process.env.AUDIT_HMAC_SECRET?.trim();
  if (!secret) throw new Error("Operational ledger signing is not configured. Refusing to read unverified money state.");
  return secret;
}

export function computeOperationalLedgerHmac(
  kind: OperationalLedgerKind,
  entry: Record<string, unknown>,
  secret: string,
): string {
  const canonical = Object.fromEntries(FIELDS[kind].map((field) => [field, entry[field] ?? null]));
  return createHmac("sha256", secret).update(stableJson({ kind, ...canonical })).digest("hex");
}

export function assertOperationalLedgerEntries<T extends Record<string, unknown>>(
  kind: OperationalLedgerKind,
  entries: T[],
  secret = getOperationalLedgerSecret(),
): T[] {
  let unsigned = 0;
  let mismatched = 0;
  for (const entry of entries) {
    const providedHex = typeof entry.rowHmac === "string" ? entry.rowHmac : "";
    if (!providedHex) {
      unsigned += 1;
      continue;
    }
    const expected = Buffer.from(computeOperationalLedgerHmac(kind, entry, secret), "hex");
    const provided = Buffer.from(providedHex, "hex");
    if (provided.length !== expected.length || provided.length === 0 || !timingSafeEqual(provided, expected)) mismatched += 1;
  }
  if (unsigned || mismatched) {
    throw new Error(`${kind} ledger integrity check failed: ${unsigned} unsigned, ${mismatched} mismatched row(s).`);
  }
  return entries;
}
