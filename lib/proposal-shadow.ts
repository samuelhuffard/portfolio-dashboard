import type { AllocationProposal } from "./proposals";

interface ShadowOptions {
  backendUrl?: string;
  secret?: string;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
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

  let lastError = "unknown error";
  // A shadow write never affects the authoritative Redis decision, but one
  // brief cold-start or connection wobble must not leave the parity mirror
  // stale for an entire observation day. Keep the retry bounded so dashboard
  // latency remains predictable and callers never gain a new failure mode.
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
      if (response.ok) return { ok: true };
      lastError = `backend returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
    }
    if (attempt === 0) {
      const delay = Math.max(0, options.retryDelayMs ?? 250);
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  console.warn(`[proposal shadow] unavailable after retry; authoritative Redis write remains valid: ${lastError}`);
  return { ok: false };
}
