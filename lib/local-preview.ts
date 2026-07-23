import type { PortfolioRole } from "./rbac";

type Environment = Record<string, string | undefined>;

/**
 * Local development preview for inspecting the dashboard before Clerk roles are set up.
 * It is deliberately unavailable in production and only enables read-only routes.
 */
export function getLocalPreviewRole(env: Environment = process.env): PortfolioRole | null {
  if (env.NODE_ENV !== "development") return null;
  return "FundManager";
}
