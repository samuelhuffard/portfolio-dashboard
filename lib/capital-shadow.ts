type ShadowCapitalEntry = {
  date: string;
  email: string;
  name: string;
  type: string;
  amount: number;
  navPerUnit?: number | null;
  units: number;
  investorId?: string | null;
  entryId?: string | null;
  rowHmac?: string | null;
};

interface ShadowOptions {
  backendUrl?: string;
  secret?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Mirror an already-signed, authoritative Sheets capital entry to the backend
 * projection. This is deliberately idempotent: a client retry of the same
 * entry ID repairs a missed projection without creating another ledger row.
 */
export async function shadowCapitalEntry(
  entry: ShadowCapitalEntry,
  options: ShadowOptions = {},
): Promise<{ ok: boolean; skipped?: boolean }> {
  const backendUrl = (options.backendUrl ?? process.env.PORTFOLIO_BACKEND_URL)?.trim().replace(/\/$/, "");
  const secret = (options.secret ?? process.env.PORTFOLIO_WEBHOOK_SECRET)?.trim();
  if (!backendUrl || !secret) return { ok: false, skipped: true };

  try {
    const response = await (options.fetchImpl ?? fetch)(`${backendUrl}/shadow/capital-entry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ entry }),
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) {
      console.warn(`[capital shadow] backend returned ${response.status}; retry the same idempotency key to reconcile.`);
      return { ok: false };
    }
    const result = await response.json().catch(() => null) as { ok?: boolean } | null;
    return result?.ok === true ? { ok: true } : { ok: false };
  } catch (error) {
    console.warn(`[capital shadow] unavailable; retry the same idempotency key to reconcile: ${error instanceof Error ? error.message : "unknown error"}`);
    return { ok: false };
  }
}
