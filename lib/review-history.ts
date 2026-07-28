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

export type ReviewAuditSortField = 'date' | 'score' | 'action' | 'company';
export type ReviewAuditSortDirection = 'asc' | 'desc';
export const REVIEW_AUDIT_PAGE_SIZE = 50;

const ACTION_ORDER: Record<string, number> = {
  BUY: 0,
  SELL: 1,
  HOLD: 2,
  NO_TRADE: 3,
  ERROR: 4,
};

/** Sort without mutating the audit index returned by the API. Missing scores/dates always remain last. */
export function sortReviewAudits(
  audits: ReviewAudit[],
  field: ReviewAuditSortField,
  direction: ReviewAuditSortDirection,
): ReviewAudit[] {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...audits].sort((left, right) => {
    let comparison = 0;
    if (field === 'score' || field === 'date') {
      const leftValue = field === 'score'
        ? left.quantScore
        : (Number.isFinite(Date.parse(left.decidedAt)) ? Date.parse(left.decidedAt) : null);
      const rightValue = field === 'score'
        ? right.quantScore
        : (Number.isFinite(Date.parse(right.decidedAt)) ? Date.parse(right.decidedAt) : null);
      if (leftValue == null && rightValue != null) return 1;
      if (rightValue == null && leftValue != null) return -1;
      if (leftValue != null && rightValue != null) comparison = leftValue - rightValue;
    }
    if (field === 'action') comparison = (ACTION_ORDER[left.finalAction ?? ''] ?? 99) - (ACTION_ORDER[right.finalAction ?? ''] ?? 99);
    if (field === 'company') comparison = left.ticker.localeCompare(right.ticker);
    if (comparison) return comparison * multiplier;
    return left.ticker.localeCompare(right.ticker) || left.decidedAt.localeCompare(right.decidedAt);
  });
}

export function getReviewAuditPage(audits: ReviewAudit[], requestedPage: number, pageSize = REVIEW_AUDIT_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(audits.length / pageSize));
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), totalPages - 1);
  const start = page * pageSize;
  return { page, totalPages, start, rows: audits.slice(start, start + pageSize) };
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
