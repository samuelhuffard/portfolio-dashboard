import { Redis } from "@upstash/redis";
import type { StoredReport, ReportSummary } from "@/lib/research/types";

let _redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

const HISTORY_KEY = "research:history";
const MAX_HISTORY = 100;

export async function saveReport(report: StoredReport): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(`research:report:${report.reportId}`, JSON.stringify(report));
    const summary: ReportSummary =
      report.kind === "research"
        ? {
            id: report.reportId,
            kind: "research",
            tickers: [report.ticker],
            focus: report.focus,
            generatedAt: report.generatedAt,
          }
        : {
            id: report.reportId,
            kind: "comparison",
            tickers: report.companies.map((c) => c.ticker),
            generatedAt: report.generatedAt,
          };
    await redis.lpush(HISTORY_KEY, JSON.stringify(summary));
    await redis.ltrim(HISTORY_KEY, 0, MAX_HISTORY - 1);
  } catch (e) {
    console.warn("[Redis] saveReport failed:", e instanceof Error ? e.message : e);
  }
}

export async function getReport(id: string): Promise<StoredReport | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(`research:report:${id}`);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : (raw as StoredReport);
  } catch (e) {
    console.warn("[Redis] getReport failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function getHistory(limit = 25): Promise<ReportSummary[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const items = await redis.lrange(HISTORY_KEY, 0, limit - 1);
    return items.map((item) => {
      const parsed = (typeof item === "string" ? JSON.parse(item) : item) as ReportSummary;
      return { ...parsed, kind: parsed.kind ?? "comparison" };
    });
  } catch (e) {
    console.warn("[Redis] getHistory failed:", e instanceof Error ? e.message : e);
    return [];
  }
}
