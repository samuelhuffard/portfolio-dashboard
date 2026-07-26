import { getRedis } from "./redis";

export type ResearchScanStatus = "running" | "completed" | "failed";
export type ResearchScanSource = "manual" | "scheduled" | string;

export interface AgentResearchScanSummary {
  agentId: string;
  status: ResearchScanStatus;
  recommendationsWritten: number;
  attemptedReviews: number;
  actionCounts: {
    BUY: number;
    SELL: number;
    HOLD: number;
    NO_TRADE?: number;
    ERROR?: number;
  };
  proposalsCreated: number;
  proposalCounts: {
    BUY: number;
    SELL: number;
  };
  scanErrors: number;
  evaluatorRejects: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface ResearchScanSummary {
  runId: string;
  source: ResearchScanSource;
  status: ResearchScanStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs?: number;
  updatedAt: string;
  agents: AgentResearchScanSummary[];
  totals?: {
    recommendationsWritten: number;
    attemptedReviews: number;
    proposalsCreated: number;
    scanErrors: number;
    evaluatorRejects: number;
  };
  error: string | null;
}

const RESEARCH_SCAN_STATUS_KEY = "pm:research-scan:latest";

export async function getLatestResearchScanSummary(): Promise<ResearchScanSummary | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(RESEARCH_SCAN_STATUS_KEY);
  if (!raw) return null;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as ResearchScanSummary;
}
