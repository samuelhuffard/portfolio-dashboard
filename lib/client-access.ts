import type { PortfolioRole } from "./rbac";

export const CLIENT_DEFAULT_ROUTE = "/investors";

// Fail-closed allowlist: Clients see only their own capital account.
// (/recommendations and /news were removed from the app on 2026-07-06.)
const CLIENT_ROUTES = new Set(["/investors"]);

export function routeAllowed(role: PortfolioRole | null, pathname: string): boolean {
  if (!role) return false;
  if (role === "FundManager") return true;
  return CLIENT_ROUTES.has(pathname);
}
