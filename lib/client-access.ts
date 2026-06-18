import type { PortfolioRole } from "./rbac";

export const CLIENT_DEFAULT_ROUTE = "/investors";

const CLIENT_ROUTES = new Set(["/investors", "/recommendations", "/news"]);

export function routeAllowed(role: PortfolioRole | null, pathname: string): boolean {
  if (!role) return false;
  if (role === "FundManager") return true;
  return CLIENT_ROUTES.has(pathname);
}
