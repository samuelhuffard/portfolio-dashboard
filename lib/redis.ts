import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
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

const CAPITAL_LOCK_KEY = "pm:workflow-lock:capital-ledger";
const RELEASE_IF_OWNER = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

/** Serializes every dashboard capital mutation against the backend's shared lock. */
export async function withCapitalLedgerLock<T>(fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis is required for capital-ledger writes.");
  const token = randomUUID();
  const acquired = await redis.set(CAPITAL_LOCK_KEY, token, { nx: true, ex: 120 });
  if (acquired !== "OK") throw new Error("A capital-ledger write is already in progress. Retry shortly.");
  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE_IF_OWNER, [CAPITAL_LOCK_KEY], [token]);
  }
}

const DEFAULT_TAX_RESERVE_RATE_PCT = 0.2; // fallback if portfolio-manager hasn't cached config/tax.json yet

/** Mirrors portfolio-manager's config/tax.json reserveRatePct (cached there on each holdings-sync). */
export async function getTaxReserveRatePct(): Promise<number> {
  const redis = getRedis();
  if (!redis) return DEFAULT_TAX_RESERVE_RATE_PCT;
  try {
    const raw = await redis.get<number | string>("pm:tax:reserve-rate-pct");
    const parsed = typeof raw === "string" ? Number(raw) : raw;
    return Number.isFinite(parsed) && parsed != null ? (parsed as number) : DEFAULT_TAX_RESERVE_RATE_PCT;
  } catch (e) {
    console.warn("[Redis] getTaxReserveRatePct failed:", e instanceof Error ? e.message : e);
    return DEFAULT_TAX_RESERVE_RATE_PCT;
  }
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

export interface InvestorUpdate {
  isoWeek: string;
  generatedAt: string;
  investorId: string;
  email: string;
  name: string;
  value: number | null;
  netContributed: number | null;
  gainLoss: number | null;
  gainLossPct: number | null;
  units: number;
  navPerUnit: number | null;
  navAsOf: string | null;
  weeklyTrades: Array<{ date: string; ticker: string; side: string; amount: number; price: number }>;
  topHoldings: Array<{ ticker: string; marketValue: number }>;
}

export async function getInvestorUpdate(investorId: string | null, email: string | null): Promise<InvestorUpdate | null> {
  const redis = getRedis();
  if (!redis) return null;
  const keys = [
    investorId ? `pm:investor-update:latest:${investorId}` : null,
    email ? `pm:investor-update:latest:email:${email.toLowerCase()}` : null,
  ].filter((key): key is string => Boolean(key));
  try {
    for (const key of keys) {
      const raw = await redis.get<InvestorUpdate | string>(key);
      if (raw) return typeof raw === "string" ? JSON.parse(raw) as InvestorUpdate : raw;
    }
  } catch (e) {
    console.warn("[Redis] getInvestorUpdate failed:", e instanceof Error ? e.message : e);
  }
  return null;
}
