// Pure types and display logic for the Phase 0 observation window. This module
// must stay importable from client components: no Node APIs, no Redis, no env.

export const MAX_UPDATE_LENGTH = 2000;
export const SAFETY_WINDOW_TARGET = 5;
export const PROPOSAL_TARGET = 3;
export const APPROVAL_TARGET = 1;

export interface Phase0SkillProgress {
  validResearchSamples?: number;
  actionableProposals?: number;
  confirmedEvaluatorApprovals?: number;
}

export interface Phase0DayRecord {
  dateET: string;
  verdict: string;
  trustVerdict?: string;
  skillVerdict?: string;
  countsTowardSafetyWindow?: boolean;
  countsTowardResearchCohort?: boolean;
  trustReasons?: string[];
  skillReasons?: string[];
  reasons?: string[];
  skillProgress?: Phase0SkillProgress;
  observedAt?: string | null;
  deployment?: { commit?: string | null; branch?: string | null } | null;
}

export interface ObservationUpdate {
  id: string;
  text: string;
  author: string;
  userId: string;
  createdAt: string;
}

export const OBSERVATION_HUMAN_CHECKLIST = [
  { id: "pure-quality-harness", label: "Build a truly disconnected proposal-quality harness", detail: "No model, network, scheduler, Redis, proposal, or approval dependency." },
  { id: "bench30-corpus", label: "Freeze a real local point-in-time evidence corpus", detail: "Preserved T0 source packets, hashes, chronology, expected outcomes, and gap list." },
  { id: "lineage-audit", label: "Complete the cross-runtime proposal-lineage audit", detail: "Backend, dashboard, companion, all five sources, readers/writers, v1 disposition, and no-go list." },
  { id: "agent4-paired-shadow", label: "Run the Agent 4 paired-shadow laboratory", detail: "Versioned draft policy plus deterministic specialist, portfolio, and Sam-label scenarios." },
  { id: "trust-blueprints", label: "Finish separate trust-release blueprints", detail: "Exact code/record maps, test matrices, rollback drills, reviewers, and clock effects." },
] as const;

export type ObservationChecklistItemId = (typeof OBSERVATION_HUMAN_CHECKLIST)[number]["id"];

export interface ObservationChecklistState {
  id: ObservationChecklistItemId;
  completed: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export function isObservationChecklistItemId(value: unknown): value is ObservationChecklistItemId {
  return OBSERVATION_HUMAN_CHECKLIST.some((item) => item.id === value);
}

export function defaultObservationChecklist(): ObservationChecklistState[] {
  return OBSERVATION_HUMAN_CHECKLIST.map((item) => ({
    id: item.id,
    completed: false,
    updatedAt: null,
    updatedBy: null,
  }));
}

export interface ObservationWindowSummary {
  consecutiveCleanDays: number;
  target: number;
  recordedTradingDays: number;
  actionableProposals: number;
  proposalTarget: number;
  evaluatorApprovals: number;
  approvalTarget: number;
  latestDate: string | null;
  latestLabel: string | null;
  headline: string;
}

export function verdictLabel(record: Pick<Phase0DayRecord, "verdict">): string {
  switch (record.verdict) {
    case "SKIP":
      return "Not a trading day";
    case "PASS_BOTH":
      return "Clean day — safety and research both passed";
    case "TRUST_PASS_SKILL_FAIL":
      return "Safety clean (day counts) — research goals not yet met";
    case "TRUST_FAIL_SKILL_PASS":
      return "Safety failed — day does not count";
    case "FAIL_BOTH":
      return "Failed — day does not count";
    default:
      return "Unrecognized verdict — treat as not counting";
  }
}

export function verdictTone(record: Pick<Phase0DayRecord, "verdict">): "good" | "warn" | "bad" | "muted" {
  if (record.verdict === "PASS_BOTH") return "good";
  if (record.verdict === "TRUST_PASS_SKILL_FAIL") return "warn";
  if (record.verdict === "SKIP") return "muted";
  return "bad";
}

/**
 * Summarizes recorded days (sorted newest first). The consecutive count walks
 * back from the most recent trading-day record and stops at the first day that
 * did not count toward the safety window; SKIP (weekend/holiday) records never
 * break or extend the streak. Missing evidence is never counted as clean —
 * only an explicit countsTowardSafetyWindow=true adds a day.
 */
export function summarizeObservationWindow(days: Phase0DayRecord[]): ObservationWindowSummary {
  const tradingDays = days.filter((day) => day.verdict !== "SKIP");
  let consecutive = 0;
  for (const day of tradingDays) {
    if (day.countsTowardSafetyWindow === true) consecutive += 1;
    else break;
  }
  let proposals = 0;
  let approvals = 0;
  for (const day of tradingDays) {
    proposals += day.skillProgress?.actionableProposals ?? 0;
    approvals += day.skillProgress?.confirmedEvaluatorApprovals ?? 0;
  }
  const latest = days[0] ?? null;
  const headline = tradingDays.length === 0
    ? "No trading-day observations recorded yet. The automated observer reports each trading day at 8:15 PM ET."
    : consecutive === 0
      ? `The window is at 0 of ${SAFETY_WINDOW_TARGET}. The most recent trading day did not count — see its reasons below.`
      : `${consecutive} of ${SAFETY_WINDOW_TARGET} consecutive clean safety days.`;
  return {
    consecutiveCleanDays: consecutive,
    target: SAFETY_WINDOW_TARGET,
    recordedTradingDays: tradingDays.length,
    actionableProposals: proposals,
    proposalTarget: PROPOSAL_TARGET,
    evaluatorApprovals: approvals,
    approvalTarget: APPROVAL_TARGET,
    latestDate: latest?.dateET ?? null,
    latestLabel: latest ? verdictLabel(latest) : null,
    headline,
  };
}

/** Trims, normalizes newlines, strips other control characters, enforces length. */
export function validateUpdateText(input: unknown): string {
  const text = String(input ?? "")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
    .trim();
  if (!text) throw new Error("Update text is required.");
  if (text.length > MAX_UPDATE_LENGTH) throw new Error(`Update text must be at most ${MAX_UPDATE_LENGTH} characters.`);
  return text;
}
