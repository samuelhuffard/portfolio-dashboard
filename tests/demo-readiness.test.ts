import assert from "node:assert/strict";
import test from "node:test";
import { buildDataReadinessReport, CORE_ROUTES, validateSmokeBaseUrl } from "../lib/demo-readiness";

const NOW = new Date("2026-07-20T16:00:00.000Z");

function assertStableErrorCodes(report: { checks: Array<{ error?: string }> }): void {
  for (const item of report.checks) {
    if (item.error) assert.match(item.error, /^[A-Z0-9_]+$/);
  }
}

function healthyPayloads() {
  return {
    portfolio: {
      cash: 85,
      lastSynced: "2026-07-20T15:30:00.000Z",
      holdings: [{ ticker: "NVDA", name: "NVIDIA", shares: 0.5, marketValue: 100, costBasis: 90, gainLoss: 10, gainLossPct: 11.11 }],
      totals: { totalValue: 185, totalMarketValue: 100, totalCostBasis: 90, totalGainLoss: 10, totalGainLossPct: 11.11 },
    },
    investors: {
      role: "FundManager",
      navPerUnit: 1.013,
      latestNavDate: "2026-07-20",
      navIsCurrent: true,
      performance: [{ date: "2026-07-20", navPerUnit: 1.013 }],
      roster: [{ units: 100 }],
    },
    proposals: {
      proposals: [{ id: "proposal-1", status: "Pending", executionState: null, fulfilledAt: null, updatedAt: "2026-07-20T15:00:00.000Z" }],
    },
    companion: { online: true, ageSeconds: 11, lastSeen: "2026-07-20T15:59:49.000Z" },
    strategy: { agentId: "agent-1", notes: "" },
    history: { reports: [{ id: "report-1", kind: "research", generatedAt: "2026-07-20T14:00:00.000Z" }] },
    news: { news: [{ date: "2026-07-20", action: "HOLD" }] },
    activity: { activity: { ok: true, ts: "2026-07-20T15:55:00.000Z" }, scanRunning: false, syncRunning: false },
  };
}

test("core route map excludes the deferred funnel surface", () => {
  assert.deepEqual(CORE_ROUTES.map((route) => route.label), [
    "Command", "Positions", "Agents", "Approvals", "Strategy", "History",
  ]);
  assert.equal(new Set(CORE_ROUTES.map((route) => route.path)).size, CORE_ROUTES.length);
});

test("healthy synthetic payloads produce a PASS report and a sanitized fingerprint report", () => {
  const report = buildDataReadinessReport(healthyPayloads(), { now: NOW, maxFreshMinutes: 120 });
  assert.equal(report.overall, "PASS");
  assert.equal(report.synthetic, true);
  assert.equal(report.organicPhase0Evidence, false);
  assert.ok(report.checks.every((item) => item.status === "pass"));
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /NVIDIA|proposal-1|report-1|@/);
  assert.match(serialized, /projection:[a-f0-9]{12}/);
});

test("smoke target validation rejects credential-bearing and non-loopback HTTP origins before fetch", () => {
  const rejected = [
    "http://attacker.example",
    "https://user:password@portfolio.example",
    "https://portfolio.example/?PORTFOLIO_SMOKE_COOKIE=leak",
    "https://portfolio.example/#cookie-leak",
    "https://portfolio.example/dashboard",
  ];
  for (const value of rejected) {
    const result = validateSmokeBaseUrl(value);
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /password|leak|attacker/);
  }
  assert.equal(validateSmokeBaseUrl("http://localhost:3000").ok, true);
  assert.equal(validateSmokeBaseUrl("http://127.0.0.1:3000").ok, true);
  assert.equal(validateSmokeBaseUrl("https://portfolio.example").ok, true);
});

test("adversarial private strings and credential-shaped errors never enter the report", () => {
  const payloads = healthyPayloads() as any;
  payloads.investors.roster = [{ name: "Private Investor", email: "investor@example.com", units: 100, amount: 9999 }];
  payloads.proposals.proposals[0].ticker = "NVDA";
  payloads.proposals.proposals[0].rationale = "Do not print this private thesis.";
  payloads.strategy.notes = "API_KEY=super-secret-value and private operating note";
  payloads.news.news[0].ticker = "NVDA";
  payloads.news.news[0].rationale = "Private catalyst text";
  payloads.activity.activity = { ok: false, ts: "2026-07-20T15:55:00.000Z", error: "Bearer credential=super-secret-value" };
  const report = buildDataReadinessReport(payloads, { now: NOW, maxFreshMinutes: 120 });
  const serialized = JSON.stringify(report);
  for (const secret of ["super-secret-value", "Private Investor", "investor@example.com", "private thesis", "Private catalyst text", "NVDA"]) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(serialized, /Bearer|API_KEY|rationale|email|amount/);
  for (const item of report.checks) {
    if (item.error) assert.match(item.error, /^[A-Z0-9_]+$/);
  }
});

test("stale cash/holdings freshness fails closed", () => {
  const payloads = healthyPayloads();
  payloads.portfolio.lastSynced = "2026-07-18T15:30:00.000Z";
  const report = buildDataReadinessReport(payloads, { now: NOW, maxFreshMinutes: 120 });
  const check = report.checks.find((item) => item.key === "data.portfolio");
  assert.equal(check?.status, "fail");
  assert.equal(check?.error, "PORTFOLIO_INTEGRITY_OR_FRESHNESS_FAILED");
  assertStableErrorCodes(report);
  assert.equal(report.overall, "FAIL");
});

test("duplicate holdings, invalid NAV date, and proposal IDs fail integrity assertions", () => {
  const payloads = healthyPayloads();
  payloads.portfolio.holdings.push({ ...payloads.portfolio.holdings[0] });
  payloads.investors.latestNavDate = "2026-07-21";
  payloads.proposals.proposals.push({ ...payloads.proposals.proposals[0] });
  const report = buildDataReadinessReport(payloads, { now: NOW, maxFreshMinutes: 120 });
  assert.equal(report.checks.find((item) => item.key === "data.portfolio")?.status, "fail");
  assert.equal(report.checks.find((item) => item.key === "data.nav-ledger")?.status, "fail");
  assert.equal(report.checks.find((item) => item.key === "data.proposals")?.status, "fail");
  assertStableErrorCodes(report);
});

test("offline companion is explicit and can be allowed for a local UI-only run", () => {
  const payloads = healthyPayloads();
  payloads.companion = { online: false, ageSeconds: 900, lastSeen: "2026-07-20T15:45:00.000Z" };
  const strict = buildDataReadinessReport(payloads, { now: NOW, requireCompanionOnline: true });
  const relaxed = buildDataReadinessReport(payloads, { now: NOW, requireCompanionOnline: false });
  assert.equal(strict.checks.find((item) => item.key === "status.companion")?.status, "fail");
  assert.equal(relaxed.checks.find((item) => item.key === "status.companion")?.status, "pass");
});
