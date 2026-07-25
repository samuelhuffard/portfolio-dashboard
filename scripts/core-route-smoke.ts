import { addRouteChecks, buildDataReadinessReport, CORE_ROUTES, validateSmokeBaseUrl, type ReadinessCheck, type ReadinessPayloads } from "@/lib/demo-readiness";

const BASE_URL_RAW = (process.env.PORTFOLIO_SMOKE_BASE_URL ?? "http://localhost:3000").trim();
const COOKIE = process.env.PORTFOLIO_SMOKE_COOKIE?.trim() ?? "";
const TIMEOUT_MS = Number(process.env.PORTFOLIO_SMOKE_TIMEOUT_MS ?? 20_000);

type FetchResult = { status: number; ok: boolean; body: unknown };

const API_REQUESTS = [
  ["portfolio", "/api/portfolio"],
  ["investors", "/api/investors"],
  ["proposals", "/api/proposals"],
  ["companion", "/api/companion/trigger"],
  ["strategy", "/api/strategy?agentId=agent-1"],
  ["history", "/api/history"],
  ["news", "/api/news"],
  ["activity", "/api/activity"],
] as const;

function requestHeaders(): HeadersInit {
  return {
    Accept: "application/json, text/html",
    "Cache-Control": "no-store",
    ...(COOKIE ? { Cookie: COOKIE } : {}),
  };
}

async function fetchResult(baseUrl: string, path: string): Promise<FetchResult> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: requestHeaders(),
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("json") ? await response.json().catch(() => null) : await response.text().catch(() => "");
    return { status: response.status, ok: response.ok, body };
  } catch {
    return { status: 0, ok: false, body: null };
  }
}

function routeCheck(key: string, label: string, result: FetchResult, marker?: string): ReadinessCheck {
  const bodyText = typeof result.body === "string" ? result.body : "";
  const markerFound = marker ? bodyText.includes(marker) : null;
  const passed = result.ok && (marker ? markerFound : true);
  return {
    key: `route.${key}`,
    label,
    status: passed ? "pass" : "fail",
    details: {
      path: key === "command" ? "/" : CORE_ROUTES.find((route) => route.key === key)?.path ?? key,
      status: result.status,
      marker: marker ?? null,
      markerFound,
    },
    ...(passed ? {} : { error: "AUTHENTICATED_ROUTE_STATUS_OR_MARKER_MISMATCH" }),
  };
}

function apiCheck(key: string, path: string, result: FetchResult): ReadinessCheck {
  const passed = result.ok && result.body !== null && typeof result.body === "object";
  return {
    key: `api.${key}`,
    label: `Authenticated read ${path.split("?")[0]}`,
    status: passed ? "pass" : "fail",
    details: { path: path.split("?")[0], status: result.status, json: result.body !== null && typeof result.body === "object" },
    ...(passed ? {} : { error: "AUTHENTICATED_JSON_PAYLOAD_UNAVAILABLE" }),
  };
}

function parseArgs(): { maxFreshMinutes: number; requireCompanionOnline: boolean } {
  const args = new Set(process.argv.slice(2));
  const rawAge = process.env.PORTFOLIO_SMOKE_MAX_AGE_MINUTES ?? "1440";
  const maxFreshMinutes = Number(rawAge);
  if (!Number.isFinite(maxFreshMinutes) || maxFreshMinutes <= 0) throw new Error("PORTFOLIO_SMOKE_MAX_AGE_MINUTES must be a positive number.");
  return {
    maxFreshMinutes,
    requireCompanionOnline: !args.has("--allow-offline-companion"),
  };
}

async function main(): Promise<void> {
  const options = parseArgs();
  const baseUrl = validateSmokeBaseUrl(BASE_URL_RAW);
  if (!baseUrl.ok || !baseUrl.value) {
    console.log(JSON.stringify({
      schema: "demo-readiness-v1",
      generatedAt: new Date().toISOString(),
      synthetic: true,
      organicPhase0Evidence: false,
      overall: "FAIL",
      checks: [{
        key: "config.base-url",
        label: "Smoke target origin",
        status: "fail",
        details: { configured: true },
        error: baseUrl.reason ?? "BASE_URL_ORIGIN_INVALID",
      }],
    }));
    process.exitCode = 2;
    return;
  }
  if (!COOKIE) {
    console.log(JSON.stringify({
      schema: "demo-readiness-v1",
      generatedAt: new Date().toISOString(),
      synthetic: true,
      organicPhase0Evidence: false,
      overall: "FAIL",
      checks: [{
        key: "config.auth",
        label: "Authenticated smoke configuration",
        status: "fail",
        details: { cookie: "missing" },
        error: "AUTH_COOKIE_NOT_CONFIGURED",
      }],
    }));
    process.exitCode = 2;
    return;
  }

  const [pages, apis] = await Promise.all([
    Promise.all(CORE_ROUTES.map(async (route) => ({ route, result: await fetchResult(baseUrl.value!, route.path) }))),
    Promise.all(API_REQUESTS.map(async ([key, path]) => ({ key, path, result: await fetchResult(baseUrl.value!, path) }))),
  ]);

  const payloads: ReadinessPayloads = {};
  const apiChecks = apis.map(({ key, path, result }) => {
    payloads[key as keyof ReadinessPayloads] = result.body;
    return apiCheck(key, path, result);
  });
  const report = buildDataReadinessReport(payloads, {
    maxFreshMinutes: options.maxFreshMinutes,
    requireCompanionOnline: options.requireCompanionOnline,
  });
  const routeChecks = pages.map(({ route, result }) => routeCheck(route.key, route.label, result, route.marker));
  const finalReport = addRouteChecks(report, [...routeChecks, ...apiChecks]);
  console.log(JSON.stringify(finalReport, null, 2));
  if (finalReport.overall === "FAIL") process.exitCode = 1;
}

main().catch(() => {
  console.log(JSON.stringify({
    schema: "demo-readiness-v1",
    generatedAt: new Date().toISOString(),
    synthetic: true,
    organicPhase0Evidence: false,
    overall: "FAIL",
    checks: [{
      key: "config.runtime",
      label: "Smoke runner configuration",
      status: "fail",
      details: { configured: false },
      error: "SMOKE_RUNNER_CONFIGURATION_INVALID",
    }],
  }));
  process.exitCode = 1;
});
