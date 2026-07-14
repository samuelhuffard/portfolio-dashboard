export const RESEARCH_DATA_STATUS_FIELDS = [
  "state", "reason", "runId", "startedAt", "completedAt", "cataloged", "classified",
  "metricRows", "scored", "complete", "partial", "unsupported", "oldestInputDate",
  "newestInputDate", "failureStage", "selectionMode", "selectionPolicyVersion",
  "selectionPolicyUnresolved", "selectionCandidateCount", "selectionSelectedCount",
  "selectionDisplacedCount", "selectionOverlapCount", "selectionReasonCodeCounts",
] as const;

export const SHADOW_SELECTION_STATUS_FIELDS = [
  "state", "reason", "runId", "selectionRunId", "mode", "policyVersion", "policyUnresolved",
  "candidateCount", "selectedCount", "displacedCount", "overlapCount", "eligibleEventCount",
  "reasonCodeCounts", "failureStage",
] as const;

export const SHADOW_SELECTION_REASON_CODES = [
  "holding", "mandatory_reunderwrite", "displaced", "material_thesis_breaking_event",
  "validated_economic_score_change", "high_stable_score", "fixed_exploration_allocation",
  "material_filing", "score_changed", "filing_change", "market_change", "estimate_change",
  "ownership_change", "materiality_policy_accepted", "current_observation_not_actionable",
  "previous_thesis_critical_evidence_not_fresh", "research_ineligible",
] as const;

export interface ResearchDataStatus {
  state: string;
  reason?: string | null;
  runId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cataloged?: number | null;
  classified?: number | null;
  metricRows?: number | null;
  scored?: number | null;
  complete?: number | null;
  partial?: number | null;
  unsupported?: number | null;
  oldestInputDate?: string | null;
  newestInputDate?: string | null;
  failureStage?: string | null;
  selectionMode?: string | null;
  selectionPolicyVersion?: string | null;
  selectionPolicyUnresolved?: boolean | null;
  selectionCandidateCount?: number | null;
  selectionSelectedCount?: number | null;
  selectionDisplacedCount?: number | null;
  selectionOverlapCount?: number | null;
  selectionReasonCodeCounts?: Record<string, number> | null;
  updatedAt?: string | null;
}

export interface ShadowSelectionStatus {
  state?: string | null;
  reason?: string | null;
  runId?: string | null;
  selectionRunId?: string | null;
  mode?: string | null;
  policyVersion?: string | null;
  policyUnresolved?: boolean | null;
  candidateCount?: number | null;
  selectedCount?: number | null;
  displacedCount?: number | null;
  overlapCount?: number | null;
  eligibleEventCount?: number | null;
  reasonCodeCounts?: Record<string, number> | null;
  failureStage?: string | null;
  updatedAt?: string | null;
}

type AssertNever<T extends never> = T;
type ResearchDataField = (typeof RESEARCH_DATA_STATUS_FIELDS)[number];
type ShadowSelectionField = (typeof SHADOW_SELECTION_STATUS_FIELDS)[number];
type _ResearchDataInterfaceHasNoUnlistedFields = AssertNever<Exclude<Exclude<keyof ResearchDataStatus, "updatedAt">, ResearchDataField>>;
type _ResearchDataAllowListHasNoUnknownFields = AssertNever<Exclude<ResearchDataField, keyof ResearchDataStatus>>;
type _ShadowInterfaceHasNoUnlistedFields = AssertNever<Exclude<Exclude<keyof ShadowSelectionStatus, "updatedAt">, ShadowSelectionField>>;
type _ShadowAllowListHasNoUnknownFields = AssertNever<Exclude<ShadowSelectionField, keyof ShadowSelectionStatus>>;

export interface ResearchDataHealth {
  availability: "available" | "unavailable";
  unavailableReason?: "not-configured" | "request-failed" | "unexpected-status" | "invalid-payload";
  researchData: ResearchDataStatus | null;
  researchDataEnabled: boolean;
  shadowSelection: ShadowSelectionStatus | null;
}

const UNAVAILABLE = (unavailableReason: NonNullable<ResearchDataHealth["unavailableReason"]>): ResearchDataHealth => ({
  availability: "unavailable",
  unavailableReason,
  researchData: null,
  researchDataEnabled: false,
  shadowSelection: null,
});

// /health returns useful advisory status even when an unrelated required
// dependency makes the aggregate process health a 503. Treat 200 and 503 as
// valid transport responses, and reserve "unavailable" for missing/bad health.
export async function readResearchDataHealth({
  backendUrl,
  fetchImpl = fetch,
  timeoutMs = 3_000,
}: {
  backendUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): Promise<ResearchDataHealth> {
  const baseUrl = backendUrl?.trim().replace(/\/$/, "");
  if (!baseUrl) return UNAVAILABLE("not-configured");
  try {
    const response = await fetchImpl(`${baseUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200 && response.status !== 503) return UNAVAILABLE("unexpected-status");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return UNAVAILABLE("invalid-payload");
    }
    if (!payload || typeof payload !== "object") return UNAVAILABLE("invalid-payload");
    const health = payload as { researchData?: ResearchDataStatus | null; shadowSelection?: ShadowSelectionStatus | null; researchDataEnabled?: unknown };
    return {
      availability: "available",
      researchData: health.researchData ?? null,
      researchDataEnabled: health.researchDataEnabled === true,
      shadowSelection: health.shadowSelection ?? null,
    };
  } catch {
    return UNAVAILABLE("request-failed");
  }
}
