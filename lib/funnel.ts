import { getRedis } from "./redis";

export interface FunnelSnapshot {
  date: string;
  agentId: string;
  source: string;
  updatedAt: string;
  universe: {
    cataloged: number | null;
    sectorEnriched: number | null;
    screened: number | null;
  };
  slate: {
    counts: {
      holdings: number;
      movers: number;
      ranked: number;
      exploration: number;
    };
    total: number;
    tickers: Array<{ ticker: string; bucket: string }>;
  };
  aiReview: {
    budget: number | null;
    count: number;
    tickers: string[];
    holdingsExempt: number;
  };
  researchLedger: {
    totalTickers: number;
    reviewedLast7d: number;
    reviewedLast14d: number;
    screenedTickers: number;
    researchedScreened: number;
    neverResearchedScreened: number;
    screenedCoveragePct: number | null;
    researchedThisRun: number;
    tickersThisRun: string[];
  };
  evaluator: {
    total: number;
    approved: number;
    rejected: number;
    revised: number;
    failedClosed: number;
    skipped: number;
    notRun: number;
    rejectionRatePct: number | null;
  };
}

const AGENT_IDS = ["agent-1", "agent-2", "agent-3"];

function parseSnapshot(raw: unknown): FunnelSnapshot | null {
  if (!raw) return null;
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as FunnelSnapshot;
  } catch {
    return null;
  }
}

export async function readFunnelSnapshots(agentIds = AGENT_IDS): Promise<FunnelSnapshot[]> {
  const redis = getRedis();
  if (!redis) return [];
  const snapshots = await Promise.all(
    agentIds.map((agentId) => redis.get(`pm:funnel:latest:${agentId}`).then(parseSnapshot).catch(() => null))
  );
  return snapshots.filter((snapshot): snapshot is FunnelSnapshot => snapshot !== null);
}

export async function readFunnelHistory(agentId = "agent-1", limit = 14): Promise<FunnelSnapshot[]> {
  const redis = getRedis();
  if (!redis) return [];
  const rows = await redis.lrange(`pm:funnel:history:${agentId}`, 0, limit - 1).catch(() => []);
  return rows.map(parseSnapshot).filter((snapshot): snapshot is FunnelSnapshot => snapshot !== null);
}
