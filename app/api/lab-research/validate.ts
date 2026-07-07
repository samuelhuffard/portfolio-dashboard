// Pure request validation for POST /api/lab-research. Mirrors the backend's
// validateResearchTickerRequest (portfolio-manager/lib/lab-research.js) so bad
// input is rejected here with a clear message instead of a backend round-trip.
// Kept pure (no imports with side effects) so it is unit-testable.
import { AGENTS } from "@/lib/agents";

// 1-5 uppercase letters, optional "."/"-" class suffix of 1-2 letters (BRK.B, BF-B).
export const LAB_TICKER_RE = /^[A-Z]{1,5}([.-][A-Z]{1,2})?$/;

export const DEFAULT_LAB_AGENT_ID = "agent-1";

export type LabResearchRequest =
  | { ok: true; ticker: string; agentId: string }
  | { ok: false; error: string };

export function validateLabResearchRequest(body: unknown): LabResearchRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "JSON object body required" };
  }
  const { ticker: rawTicker, agentId: rawAgentId } = body as { ticker?: unknown; agentId?: unknown };

  if (typeof rawTicker !== "string") {
    return { ok: false, error: "ticker is required and must be a string" };
  }
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) return { ok: false, error: "ticker is required" };
  if (!LAB_TICKER_RE.test(ticker)) {
    return { ok: false, error: `Invalid ticker format: ${ticker} (expected 1-5 letters, optional .X/-X class suffix)` };
  }

  let agentId = DEFAULT_LAB_AGENT_ID;
  if (rawAgentId != null && rawAgentId !== "") {
    if (typeof rawAgentId !== "string") return { ok: false, error: "agentId must be a string" };
    agentId = rawAgentId.trim();
  }
  if (!AGENTS.some((a) => a.id === agentId)) {
    return { ok: false, error: `Unknown agentId: ${agentId}` };
  }

  return { ok: true, ticker, agentId };
}
