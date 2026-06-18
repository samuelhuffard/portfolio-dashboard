import type { PortfolioRole } from "./rbac";

export interface RedLineContext {
  role: PortfolioRole;
  method: string;
  route: string;
  bodyText?: string;
}

export interface RedLineViolation {
  id: string;
  message: string;
}

const AI_COST_ROUTES = [/^\/api\/research$/, /^\/api\/compare$/, /^\/api\/agents\/[^/]+\/chat$/];
const TRADE_ROUTE_PATTERN = /\/api\/(trade|trades|order|orders|execute|execution|transfer|funds)(\/|$)/i;
const TRADE_WORDING_PATTERN =
  /\b(place|submit|execute|send|route|fill|cancel)\s+(an?\s+)?(trade|order)\b|\b(buy|sell)\s+\d+(\.\d+)?\s+(shares?|contracts?)\b|\b(move|transfer)\s+(cash|money|funds)\b/i;

export function checkRedLines({ role, method, route, bodyText = "" }: RedLineContext): RedLineViolation | null {
  const normalizedMethod = method.toUpperCase();

  if (role === "Client" && normalizedMethod !== "GET") {
    return {
      id: "no_client_writes",
      message: "Client accounts are read-only.",
    };
  }

  if (TRADE_ROUTE_PATTERN.test(route) || TRADE_WORDING_PATTERN.test(bodyText)) {
    return {
      id: "no_trade_execution",
      message: "Portfolio Manager is research-only and cannot execute trades or move money.",
    };
  }

  if (route === "/api/strategy" && normalizedMethod !== "GET" && role !== "FundManager") {
    return {
      id: "no_strategy_mutation_below_manager",
      message: "Strategy changes require FundManager access.",
    };
  }

  if (role !== "FundManager" && normalizedMethod !== "GET" && AI_COST_ROUTES.some((pattern) => pattern.test(route))) {
    return {
      id: "no_unbounded_ai_calls_below_manager",
      message: "AI generation requires FundManager access.",
    };
  }

  return null;
}
