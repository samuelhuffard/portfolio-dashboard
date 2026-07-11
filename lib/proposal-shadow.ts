import type { AllocationProposal } from "./proposals";

interface ShadowOptions {
  backendUrl?: string;
  secret?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Best-effort notification after an authoritative Redis proposal write. The
 * Jetson mirrors the full lifecycle object into Postgres only when its shadow
 * flag is enabled. Failure is observable but never rolls back the real queue.
 */
export async function shadowProposalLifecycle(
  proposal: AllocationProposal,
  options: ShadowOptions = {},
): Promise<{ ok: boolean; skipped?: boolean }> {
  const backendUrl = (options.backendUrl ?? process.env.PORTFOLIO_BACKEND_URL)?.trim().replace(/\/$/, "");
  const secret = (options.secret ?? process.env.PORTFOLIO_WEBHOOK_SECRET)?.trim();
  if (!backendUrl || !secret) return { ok: false, skipped: true };

  try {
    const response = await (options.fetchImpl ?? fetch)(`${backendUrl}/shadow/proposal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ proposal }),
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) {
      console.warn(`[proposal shadow] backend returned ${response.status}; authoritative Redis write remains valid.`);
      return { ok: false };
    }
    return { ok: true };
  } catch (error) {
    console.warn(`[proposal shadow] unavailable; authoritative Redis write remains valid: ${error instanceof Error ? error.message : "unknown error"}`);
    return { ok: false };
  }
}
