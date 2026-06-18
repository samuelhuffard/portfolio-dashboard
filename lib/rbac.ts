export type PortfolioRole = "FundManager" | "Client";

export type Permission =
  | "portfolio:read"
  | "portfolio:full"
  | "signals:read"
  | "strategy:write"
  | "research:run"
  | "reports:export"
  | "audit:read"
  | "approvals:manage";

const ROLES = new Set<PortfolioRole>(["FundManager", "Client"]);

export const ROLE_PERMISSIONS: Record<PortfolioRole, Permission[]> = {
  FundManager: [
    "portfolio:read",
    "portfolio:full",
    "signals:read",
    "strategy:write",
    "research:run",
    "reports:export",
    "audit:read",
    "approvals:manage",
  ],
  Client: ["portfolio:read", "signals:read"],
};

export interface ResolveRoleInput {
  metadataRole: unknown;
  email?: string | null;
  fundManagerEmails?: string[];
}

export function parseFundManagerEmails(raw = process.env.FUND_MANAGER_EMAILS ?? ""): string[] {
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeRole(role: unknown): PortfolioRole | null {
  return typeof role === "string" && ROLES.has(role as PortfolioRole) ? (role as PortfolioRole) : null;
}

export function isFundManagerEmail(email: string | null | undefined, fundManagerEmails = parseFundManagerEmails()): boolean {
  if (!email) return false;
  return fundManagerEmails.includes(email.trim().toLowerCase());
}

export function resolvePortfolioRole({
  metadataRole,
  email,
  fundManagerEmails = parseFundManagerEmails(),
}: ResolveRoleInput): PortfolioRole | null {
  const role = normalizeRole(metadataRole);
  if (!role) return null;

  if (role === "FundManager" && !isFundManagerEmail(email, fundManagerEmails)) {
    return null;
  }

  return role;
}

export function canAccess(role: PortfolioRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
