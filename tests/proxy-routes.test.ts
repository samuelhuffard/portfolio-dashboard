import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

function routeSource(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("backend proxy routes use dashboard RBAC before forwarding", () => {
  const alerts = routeSource("app/api/alerts/route.ts");
  assert.match(alerts, /requireApiPermission/);
  assert.match(alerts, /permission:\s*'alerts:manage'/);
  assert.match(alerts, /action:\s*'ALERTS_READ'/);
  assert.match(alerts, /action:\s*'ALERT_CREATE'/);

  const alertDelete = routeSource("app/api/alerts/[id]/route.ts");
  assert.match(alertDelete, /requireApiPermission/);
  assert.match(alertDelete, /permission:\s*'alerts:manage'/);
  assert.match(alertDelete, /action:\s*'ALERT_DELETE'/);

  const scan = routeSource("app/api/scan/route.ts");
  assert.match(scan, /requireApiPermission/);
  assert.match(scan, /permission:\s*'research:run'/);
  assert.match(scan, /action:\s*'RESEARCH_GENERATE'/);

  const labResearch = routeSource("app/api/lab-research/route.ts");
  assert.match(labResearch, /requireApiPermission/);
  assert.match(labResearch, /permission:\s*'research:run'/);
  assert.match(labResearch, /action:\s*'LAB_RESEARCH_RUN'/);

  const labResearchPoll = routeSource("app/api/lab-research/[requestId]/route.ts");
  assert.match(labResearchPoll, /requireApiPermission/);
  assert.match(labResearchPoll, /permission:\s*'research:run'/);
  assert.match(labResearchPoll, /action:\s*'LAB_RESEARCH_POLL'/);

  const funnel = routeSource("app/api/funnel/route.ts");
  assert.match(funnel, /requireApiPermission/);
  assert.match(funnel, /permission:\s*"portfolio:full"/);
  assert.match(funnel, /action:\s*"SIGNALS_READ"/);
  assert.match(funnel, /readResearchDataHealth/);

  const news = routeSource("app/api/news/route.ts");
  assert.match(news, /permission:\s*"portfolio:full"/);

  const agentBook = routeSource("app/api/agents/[agentId]/book/route.ts");
  assert.match(agentBook, /permission:\s*"portfolio:full"/);

  const activity = routeSource("app/api/activity/route.ts");
  assert.match(activity, /requireApiPermission/);
  assert.match(activity, /permission:\s*'portfolio:read'/);
  assert.match(activity, /action:\s*'ACTIVITY_READ'/);

  const portfolioManager = routeSource("app/api/portfolio-manager/route.ts");
  assert.match(portfolioManager, /requireApiPermission/);
  assert.match(portfolioManager, /permission:\s*['"]approvals:manage['"]/);
  assert.match(portfolioManager, /action:\s*['"]PORTFOLIO_MANAGER_SHADOW_READ['"]/);

  const researchQuality = routeSource("app/api/research-quality/route.ts");
  assert.match(researchQuality, /requireApiPermission/);
  assert.match(researchQuality, /permission:\s*["']portfolio:read["']/);
  assert.match(researchQuality, /action:\s*["']RESEARCH_QUALITY_READ["']/);
  assert.match(researchQuality, /research-quality/);
});
