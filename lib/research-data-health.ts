export interface ResearchDataStatus {
  state: string;
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
  failureStage?: string | null;
  selectionMode?: string | null;
  selectionPolicyVersion?: string | null;
  selectionPolicyUnresolved?: boolean | null;
  selectionCandidateCount?: number | null;
  selectionSelectedCount?: number | null;
  selectionDisplacedCount?: number | null;
  selectionOverlapCount?: number | null;
  selectionReasonCodeCounts?: Record<string, number> | null;
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
}

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
