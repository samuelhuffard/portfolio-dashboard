import { getRedis } from "@/lib/redis";

const HISTORY_KEY = "pm:research-decision-audit:history";

export interface ReviewAudit {
  schemaVersion: string;
  source: 'scheduled_scan' | 'legacy_recommendation_sheet';
  runId: string;
  agentId: string;
  ticker: string;
  decidedAt: string;
  quantScore: number | null;
  generatorAction: string | null;
  finalAction: string | null;
  evaluatorState: string;
  evaluatorVerdict: string;
  evaluatorCritique: string[];
  evaluatorRevisions: number;
  proposalDisposition: string;
  proposalId: string | null;
  reason: string | null;
  ruleCheck: string[];
  generatorThesis: string | null;
  finalThesis: string | null;
  rationale: string | null;
  requestedTargetWeight: number | null;
  finalTargetWeight: number | null;
  kairosOutcome: string;
  kairosExplanation: string[];
}

function parseAudit(value: unknown): ReviewAudit | null {
  try {
    const record = typeof value === "string" ? JSON.parse(value) : value;
    if (!record || typeof record !== "object") return null;
    const audit = record as Partial<ReviewAudit>;
    if (!audit.ticker || !audit.agentId || !audit.decidedAt) return null;
    return {
      schemaVersion: audit.schemaVersion ?? "research-decision-audit-v1",
      source: audit.source === 'legacy_recommendation_sheet' ? 'legacy_recommendation_sheet' : 'scheduled_scan',
      runId: audit.runId ?? "",
      agentId: audit.agentId,
      ticker: audit.ticker,
      decidedAt: audit.decidedAt,
      quantScore: typeof audit.quantScore === "number" && Number.isFinite(audit.quantScore) ? audit.quantScore : null,
      generatorAction: audit.generatorAction ?? null,
      finalAction: audit.finalAction ?? null,
      evaluatorState: audit.evaluatorState ?? "not_run",
      evaluatorVerdict: audit.evaluatorVerdict ?? "not run",
      evaluatorCritique: Array.isArray(audit.evaluatorCritique) ? audit.evaluatorCritique.filter((item): item is string => typeof item === "string") : [],
      evaluatorRevisions: typeof audit.evaluatorRevisions === "number" && Number.isInteger(audit.evaluatorRevisions) ? audit.evaluatorRevisions : 0,
      proposalDisposition: audit.proposalDisposition ?? "not_applicable",
      proposalId: audit.proposalId ?? null,
      reason: audit.reason ?? null,
      ruleCheck: Array.isArray(audit.ruleCheck) ? audit.ruleCheck.filter((item): item is string => typeof item === "string") : [],
      generatorThesis: audit.generatorThesis ?? null,
      finalThesis: audit.finalThesis ?? null,
      rationale: audit.rationale ?? null,
      requestedTargetWeight: typeof audit.requestedTargetWeight === "number" && Number.isFinite(audit.requestedTargetWeight) ? audit.requestedTargetWeight : null,
      finalTargetWeight: typeof audit.finalTargetWeight === "number" && Number.isFinite(audit.finalTargetWeight) ? audit.finalTargetWeight : null,
      kairosOutcome: audit.kairosOutcome ?? "not_recorded",
      kairosExplanation: Array.isArray(audit.kairosExplanation) ? audit.kairosExplanation.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return null;
  }
}

/** Read-only, bounded index of every research candidate reviewed after audit v1. */
export async function listReviewAudits(limit = 500): Promise<ReviewAudit[]> {
  const redis = getRedis();
  if (!redis) return [];
  const rows = await redis.lrange(HISTORY_KEY, 0, Math.min(Math.max(limit, 1), 5_000) - 1).catch(() => []);
  return rows.map(parseAudit).filter((audit): audit is ReviewAudit => audit !== null)
    .sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt));
}
