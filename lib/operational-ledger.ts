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

/**
 * Signing uses the primary operational key. Verification also accepts the
 * explicitly configured migration-only legacy keys so historical Sheets rows
 * remain readable during a deliberate HMAC cutover. Once a dedicated key is
 * present, investor/audit keys are not implicitly trusted for operational
 * rows; they must be listed in OPERATIONAL_LEDGER_LEGACY_HMAC_SECRETS.
 */
export function getOperationalLedgerVerificationSecrets(env = process.env): string[] {
  const dedicated = env.OPERATIONAL_LEDGER_HMAC_SECRET?.trim();
  const explicitLegacy = String(env.OPERATIONAL_LEDGER_LEGACY_HMAC_SECRETS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const compatibilityFallbacks = dedicated
    ? []
    : [env.INVESTOR_LEDGER_HMAC_SECRET, env.AUDIT_HMAC_SECRET];
  const secrets = [dedicated, ...explicitLegacy, ...compatibilityFallbacks]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(secrets)];
}

function hmacsEqual(expectedHex: string, providedHex: string): boolean {
  const expected = Buffer.from(String(expectedHex), "hex");
  const provided = Buffer.from(String(providedHex), "hex");
  return provided.length === expected.length
    && provided.length > 0
    && timingSafeEqual(provided, expected);
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
  secret: string | null = null,
): T[] {
  const candidates = [...new Set([
    ...(secret ? [secret.trim()] : []),
    ...getOperationalLedgerVerificationSecrets(),
  ])];
  if (!candidates.length) {
    throw new Error("Operational ledger verification is not configured. Refusing to read unverified money state.");
  }
  let unsigned = 0;
  let mismatched = 0;
  for (const entry of entries) {
    const providedHex = typeof entry.rowHmac === "string" ? entry.rowHmac : "";
    if (!providedHex) {
      unsigned += 1;
      continue;
    }
    if (!candidates.some((candidate) => hmacsEqual(computeOperationalLedgerHmac(kind, entry, candidate), providedHex))) {
      mismatched += 1;
    }
  }
  if (unsigned || mismatched) {
    throw new Error(`${kind} ledger integrity check failed: ${unsigned} unsigned, ${mismatched} mismatched row(s).`);
  }
  return entries;
}
