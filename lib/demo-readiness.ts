import { createHash } from "node:crypto";

export type ReadinessStatus = "pass" | "warn" | "fail";

export interface ReadinessCheck {
  key: string;
  label: string;
  status: ReadinessStatus;
  details: Record<string, boolean | number | string | null>;
  error?: string;
}

export interface ReadinessReport {
  schema: "demo-readiness-v1";
  generatedAt: string;
  synthetic: true;
  organicPhase0Evidence: false;
  overall: "PASS" | "WARN" | "FAIL";
  checks: ReadinessCheck[];
}

export interface CoreRoute {
  key: string;
  label: string;
  path: string;
  marker: string;
}

export const CORE_ROUTES: CoreRoute[] = [
  { key: "command", label: "Command", path: "/", marker: "Sam's Personal Investor" },
  { key: "positions", label: "Positions", path: "/holdings", marker: "Positions" },
  { key: "agents", label: "Agents", path: "/agents", marker: "Agents" },
  { key: "approvals", label: "Approvals", path: "/approvals", marker: "Proposed Allocations" },
  { key: "strategy", label: "Strategy", path: "/strategy", marker: "Strategy" },
  { key: "history", label: "History", path: "/history", marker: "Report history" },
];

export interface ReadinessPayloads {
  portfolio?: unknown;
  investors?: unknown;
  proposals?: unknown;
  companion?: unknown;
  strategy?: unknown;
  history?: unknown;
  news?: unknown;
  activity?: unknown;
}

export interface ReadinessOptions {
  now?: Date;
  maxFreshMinutes?: number;
  requireCompanionOnline?: boolean;
}

export interface SmokeBaseUrlResult {
  ok: boolean;
  value?: string;
  reason?: "BASE_URL_ORIGIN_INVALID" | "BASE_URL_CREDENTIALS_FORBIDDEN" | "BASE_URL_QUERY_OR_HASH_FORBIDDEN" | "BASE_URL_SCHEME_FORBIDDEN";
}

const PROPOSAL_STATUSES = new Set(["Pending", "ApprovedForBrokerReview", "Rejected", "Expired", "ExecutionFailed"]);
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegativeNumber(value: unknown): value is number {
  return finiteNumber(value) && value >= 0;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function ageMinutes(value: unknown, now: Date): number | null {
  const parsed = asDate(value);
  if (!parsed) return null;
  return (now.getTime() - parsed.getTime()) / 60_000;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

/** A safe fingerprint of an allowlisted projection, not proof of full response revision. */
export function projectionFingerprint(scope: string, value: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify({ scope, value: stableValue(value) })).digest("hex");
  return `projection:${digest.slice(0, 12)}`;
}

export function validateSmokeBaseUrl(raw: string): SmokeBaseUrlResult {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "BASE_URL_ORIGIN_INVALID" };
  }
  if (!parsed.hostname || parsed.pathname !== "/") return { ok: false, reason: "BASE_URL_ORIGIN_INVALID" };
  if (parsed.username || parsed.password) return { ok: false, reason: "BASE_URL_CREDENTIALS_FORBIDDEN" };
  if (parsed.search || parsed.hash) return { ok: false, reason: "BASE_URL_QUERY_OR_HASH_FORBIDDEN" };
  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(loopback && parsed.protocol === "http:")) {
    return { ok: false, reason: "BASE_URL_SCHEME_FORBIDDEN" };
  }
  return { ok: true, value: parsed.origin };
}

function check(
  key: string,
  label: string,
  status: ReadinessStatus,
  details: Record<string, boolean | number | string | null>,
  error?: string,
): ReadinessCheck {
  return { key, label, status, details, ...(error ? { error } : {}) };
}

function missingPayload(key: string, label: string): ReadinessCheck {
  return check(key, label, "fail", { payload: "missing" }, "AUTHENTICATED_PAYLOAD_MISSING");
}

function validatePortfolio(payload: unknown, now: Date, maxFreshMinutes: number): ReadinessCheck[] {
  const key = "data.portfolio";
  const label = "Cash and holdings";
  if (!isRecord(payload)) return [missingPayload(key, label)];

  const holdings = payload.holdings;
  const cash = payload.cash;
  const lastSyncedAge = ageMinutes(payload.lastSynced, now);
  const totals = isRecord(payload.totals) ? payload.totals : null;
  const uniqueTickers = new Set<string>();
  let holdingsValid = Array.isArray(holdings);
  if (Array.isArray(holdings)) {
    for (const holding of holdings) {
      const ticker = isRecord(holding) && typeof holding.ticker === "string" ? holding.ticker.trim().toUpperCase() : "";
      if (!ticker || !TICKER_RE.test(ticker) || uniqueTickers.has(ticker)) holdingsValid = false;
      uniqueTickers.add(ticker);
      if (!isRecord(holding) || !nonNegativeNumber(holding.shares)) holdingsValid = false;
      for (const field of ["marketValue", "costBasis", "gainLoss", "gainLossPct"]) {
        if (holding?.[field] !== null && holding?.[field] !== undefined && !finiteNumber(holding[field])) holdingsValid = false;
      }
    }
  }

  const totalsValid = Boolean(totals
    && finiteNumber(totals.totalValue)
    && finiteNumber(totals.totalMarketValue)
    && finiteNumber(totals.totalCostBasis)
    && finiteNumber(totals.totalGainLoss)
    && Math.abs(totals.totalValue - ((finiteNumber(cash) ? cash : 0) + totals.totalMarketValue)) <= 0.05
    && Math.abs(totals.totalGainLoss - (totals.totalMarketValue - totals.totalCostBasis)) <= 0.05);
  const fresh = lastSyncedAge !== null && lastSyncedAge >= -5 && lastSyncedAge <= maxFreshMinutes;
  const cashValid = nonNegativeNumber(cash);
  const status: ReadinessStatus = cashValid && holdingsValid && totalsValid && fresh ? "pass" : "fail";

  return [check(key, label, status, {
    cash: cashValid ? "finite" : "invalid",
    holdings: Array.isArray(holdings) ? holdings.length : -1,
    uniqueHoldings: uniqueTickers.size,
    holdingsIntegrity: holdingsValid,
    totalsIntegrity: Boolean(totalsValid),
    lastSyncedAgeMinutes: lastSyncedAge === null ? null : Math.round(lastSyncedAge * 10) / 10,
    freshnessLimitMinutes: maxFreshMinutes,
    fingerprint: projectionFingerprint("portfolio", {
      cashPresent: cashValid,
      lastSynced: payload.lastSynced,
      holdingShape: Array.isArray(holdings) ? holdings.map((holding) => isRecord(holding) ? {
        shares: finiteNumber(holding.shares),
        marketValue: holding.marketValue == null ? null : finiteNumber(holding.marketValue),
        costBasis: holding.costBasis == null ? null : finiteNumber(holding.costBasis),
      } : null) : null,
      totalsShape: totals ? {
        totalValue: finiteNumber(totals.totalValue),
        totalMarketValue: finiteNumber(totals.totalMarketValue),
        totalCostBasis: finiteNumber(totals.totalCostBasis),
        totalGainLoss: finiteNumber(totals.totalGainLoss),
      } : null,
    }),
  }, status === "pass" ? undefined : "PORTFOLIO_INTEGRITY_OR_FRESHNESS_FAILED")];
}

function newYorkDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function validateInvestors(payload: unknown, now: Date): ReadinessCheck[] {
  const key = "data.nav-ledger";
  const label = "NAV and ledger read";
  if (!isRecord(payload)) return [missingPayload(key, label)];

  const performance = payload.performance;
  const roster = payload.roster;
  const nav = payload.navPerUnit;
  const latestNavDate = payload.latestNavDate;
  const performanceValid = Array.isArray(performance)
    && performance.every((row) => isRecord(row) && typeof row.date === "string" && (row.navPerUnit === null || finiteNumber(row.navPerUnit)));
  const latestNavValid = finiteNumber(nav) && nav > 0 && typeof latestNavDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(latestNavDate);
  const latestDateNotFuture = latestNavValid && latestNavDate <= newYorkDate(now);
  const currentFlagConsistent = payload.navIsCurrent === false || latestNavDate === newYorkDate(now);
  const rosterValid = Array.isArray(roster) && roster.every((row) => isRecord(row) && (row.units === null || finiteNumber(row.units)));
  const status: ReadinessStatus = payload.role === "FundManager" && performanceValid && latestNavValid && latestDateNotFuture && currentFlagConsistent && rosterValid ? "pass" : "fail";

  return [check(key, label, status, {
    role: payload.role === "FundManager" ? "FundManager" : "unexpected",
    performanceRows: Array.isArray(performance) ? performance.length : -1,
    investorRows: Array.isArray(roster) ? roster.length : -1,
    nav: latestNavValid ? "finite-positive" : "invalid",
    latestNavDate: typeof latestNavDate === "string" ? latestNavDate : null,
    navFreshToday: payload.navIsCurrent === true,
    ledgerIntegrity: rosterValid && performanceValid,
    fingerprint: projectionFingerprint("nav-ledger", {
      performanceRows: Array.isArray(performance) ? performance.length : null,
      performanceShape: Array.isArray(performance) ? performance.map((row) => isRecord(row) ? {
        date: typeof row.date === "string" ? row.date : null,
        navPerUnit: row.navPerUnit == null ? null : finiteNumber(row.navPerUnit),
      } : null) : null,
      rosterRows: Array.isArray(roster) ? roster.length : null,
      navPresent: finiteNumber(nav),
      latestNavDate: typeof latestNavDate === "string" ? latestNavDate : null,
    }),
  }, status === "pass" ? undefined : "NAV_LEDGER_INTEGRITY_OR_FRESHNESS_FAILED")];
}

function validateProposals(payload: unknown): ReadinessCheck[] {
  const key = "data.proposals";
  const label = "Proposal state";
  if (!isRecord(payload)) return [missingPayload(key, label)];
  const proposals = payload.proposals;
  const ids = new Set<string>();
  const counts: Record<string, number> = {};
  let valid = Array.isArray(proposals);
  if (Array.isArray(proposals)) {
    for (const proposal of proposals) {
      const id = isRecord(proposal) && typeof proposal.id === "string" ? proposal.id : "";
      const status = isRecord(proposal) ? proposal.status : null;
      if (!id || ids.has(id) || typeof status !== "string" || !PROPOSAL_STATUSES.has(status)) valid = false;
      ids.add(id);
      if (typeof status === "string") counts[status] = (counts[status] ?? 0) + 1;
    }
  }
  const status: ReadinessStatus = valid ? "pass" : "fail";
  return [check(key, label, status, {
    proposals: Array.isArray(proposals) ? proposals.length : -1,
    uniqueProposalIds: ids.size,
    pending: counts.Pending ?? 0,
    accepted: counts.ApprovedForBrokerReview ?? 0,
    rejected: counts.Rejected ?? 0,
    expired: counts.Expired ?? 0,
    fingerprint: projectionFingerprint("proposals", Array.isArray(proposals) ? proposals.map((proposal) => isRecord(proposal) ? {
      status: proposal.status,
      executionState: typeof proposal.executionState === "string" ? proposal.executionState : null,
      fulfilled: Boolean(proposal.fulfilledAt),
      updatedAtPresent: typeof proposal.updatedAt === "string",
    } : null) : null),
  }, status === "pass" ? undefined : "PROPOSAL_STATE_INTEGRITY_FAILED")];
}

function validateCompanion(payload: unknown, requireOnline: boolean): ReadinessCheck[] {
  const key = "status.companion";
  const label = "Companion status";
  if (!isRecord(payload)) return [missingPayload(key, label)];
  const age = payload.ageSeconds;
  const online = payload.online;
  const lastSeen = asDate(payload.lastSeen);
  const shapeValid = typeof online === "boolean" && (age === null || nonNegativeNumber(age)) && (payload.lastSeen === null || lastSeen !== null);
  const freshnessConsistent = typeof online === "boolean" && nonNegativeNumber(age) ? online === age < 120 : false;
  const status: ReadinessStatus = shapeValid && freshnessConsistent && (!requireOnline || online === true) ? "pass" : requireOnline && shapeValid ? "fail" : "warn";
  return [check(key, label, status, {
    online: typeof online === "boolean" ? online : null,
    ageSeconds: nonNegativeNumber(age) ? age : null,
    freshnessConsistent,
    fingerprint: projectionFingerprint("companion", {
      online: typeof online === "boolean" ? online : null,
      ageSeconds: nonNegativeNumber(age) ? age : null,
      lastSeenPresent: payload.lastSeen !== null,
    }),
  }, status === "pass" ? undefined : "COMPANION_HEARTBEAT_NOT_READY")];
}

function validateStrategy(payload: unknown): ReadinessCheck[] {
  const key = "data.strategy";
  const label = "Strategy read";
  if (!isRecord(payload)) return [missingPayload(key, label)];
  const valid = typeof payload.agentId === "string" && typeof payload.notes === "string";
  return [check(key, label, valid ? "pass" : "fail", {
    agentId: typeof payload.agentId === "string" ? payload.agentId : null,
    notes: valid ? "readable" : "invalid",
    fingerprint: projectionFingerprint("strategy", {
      agentId: typeof payload.agentId === "string" ? payload.agentId : null,
      notesPresent: typeof payload.notes === "string" && payload.notes.length > 0,
      notesLength: typeof payload.notes === "string" ? payload.notes.length : null,
    }),
  }, valid ? undefined : "STRATEGY_RESPONSE_INVALID")];
}

function validateHistory(payload: unknown): ReadinessCheck[] {
  const key = "data.history";
  const label = "Research history read";
  if (!isRecord(payload)) return [missingPayload(key, label)];
  const reports = payload.reports;
  const ids = new Set<string>();
  let valid = Array.isArray(reports);
  if (Array.isArray(reports)) {
    for (const report of reports) {
      if (!isRecord(report) || typeof report.id !== "string" || ids.has(report.id) || !asDate(report.generatedAt)) valid = false;
      if (isRecord(report)) ids.add(report.id);
    }
  }
  const status: ReadinessStatus = valid ? (reports.length ? "pass" : "warn") : "fail";
  return [check(key, label, status, {
    reports: Array.isArray(reports) ? reports.length : -1,
    uniqueReports: ids.size,
    fingerprint: projectionFingerprint("history", Array.isArray(reports) ? reports.map((report) => isRecord(report) ? {
      kind: report.kind ?? null,
      generatedAt: typeof report.generatedAt === "string" ? report.generatedAt : null,
      tickerCount: Array.isArray(report.tickers) ? report.tickers.length : null,
    } : null) : null),
  }, status === "pass" || status === "warn" ? undefined : "HISTORY_RESPONSE_INVALID")];
}

function validateNews(payload: unknown): ReadinessCheck[] {
  const key = "data.recommendations";
  const label = "Recommendations read";
  if (!isRecord(payload)) return [missingPayload(key, label)];
  const news = payload.news;
  const valid = Array.isArray(news) && news.every((item) => isRecord(item) && typeof item.date === "string" && typeof item.action === "string");
  const status: ReadinessStatus = valid ? (news.length ? "pass" : "warn") : "fail";
  return [check(key, label, status, {
    items: Array.isArray(news) ? news.length : -1,
    integrity: valid,
    fingerprint: projectionFingerprint("recommendations", Array.isArray(news) ? news.map((item) => isRecord(item) ? {
      date: typeof item.date === "string" ? item.date : null,
      action: typeof item.action === "string" ? item.action : null,
      linkCount: Array.isArray(item.links) ? item.links.length : null,
    } : null) : null),
  }, status === "pass" || status === "warn" ? undefined : "RECOMMENDATIONS_RESPONSE_INVALID")];
}

function validateActivity(payload: unknown): ReadinessCheck[] {
  const key = "status.activity";
  const label = "System activity read";
  if (!isRecord(payload)) return [missingPayload(key, label)];
  const activity = payload.activity;
  const valid = activity === null || (isRecord(activity) && typeof activity.ok === "boolean" && typeof activity.ts === "string" && asDate(activity.ts) !== null);
  return [check(key, label, valid ? "pass" : "fail", {
    available: activity !== null,
    integrity: valid,
    fingerprint: projectionFingerprint("activity", {
      activityPresent: activity !== null,
      activityOk: isRecord(activity) && typeof activity.ok === "boolean" ? activity.ok : null,
      activityTimestampPresent: isRecord(activity) && typeof activity.ts === "string",
      scanRunning: payload.scanRunning === true,
      syncRunning: payload.syncRunning === true,
    }),
  }, valid ? undefined : "ACTIVITY_RESPONSE_INVALID")];
}

export function buildDataReadinessReport(payloads: ReadinessPayloads, options: ReadinessOptions = {}): ReadinessReport {
  const now = options.now ?? new Date();
  const maxFreshMinutes = options.maxFreshMinutes ?? 24 * 60;
  const checks = [
    ...validatePortfolio(payloads.portfolio, now, maxFreshMinutes),
    ...validateInvestors(payloads.investors, now),
    ...validateProposals(payloads.proposals),
    ...validateCompanion(payloads.companion, options.requireCompanionOnline ?? true),
    ...validateStrategy(payloads.strategy),
    ...validateHistory(payloads.history),
    ...validateNews(payloads.news),
    ...validateActivity(payloads.activity),
  ];
  return {
    schema: "demo-readiness-v1",
    generatedAt: now.toISOString(),
    synthetic: true,
    organicPhase0Evidence: false,
    overall: checks.some((item) => item.status === "fail") ? "FAIL" : checks.some((item) => item.status === "warn") ? "WARN" : "PASS",
    checks,
  };
}

export function addRouteChecks(report: ReadinessReport, routeChecks: ReadinessCheck[]): ReadinessReport {
  const checks = [...routeChecks, ...report.checks];
  return {
    ...report,
    checks,
    overall: checks.some((item) => item.status === "fail") ? "FAIL" : checks.some((item) => item.status === "warn") ? "WARN" : "PASS",
  };
}
