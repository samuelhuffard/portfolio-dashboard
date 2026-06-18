import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { appendAudit, getAuditConfigError, type AuditAction } from "./audit";
import { enforceRateLimit } from "./rate-limit";
import { canAccess, resolvePortfolioRole, type Permission, type PortfolioRole } from "./rbac";
import { checkRedLines } from "./red-lines";

export interface PortfolioAuthContext {
  userId: string;
  role: PortfolioRole;
  email: string | null;
}

export interface RequirePermissionOptions {
  permission: Permission;
  action: AuditAction;
  request: Request;
  metadata?: Record<string, unknown>;
}

function routeFromRequest(request: Request): string {
  return new URL(request.url).pathname;
}

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  if (!user) return null;
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

async function bodyTextForRedLines(request: Request): Promise<string> {
  if (request.method.toUpperCase() === "GET") return "";

  try {
    return await request.clone().text();
  } catch {
    return "";
  }
}

export async function getPortfolioAuthContext(): Promise<PortfolioAuthContext | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const email = primaryEmail(user);
  const role = resolvePortfolioRole({
    metadataRole: user?.publicMetadata?.role,
    email,
  });

  if (!role) return null;
  return { userId, role, email };
}

export async function requireApiPermission({
  permission,
  action,
  request,
  metadata = {},
}: RequirePermissionOptions): Promise<{ ok: true; context: PortfolioAuthContext } | { ok: false; response: NextResponse }> {
  const route = routeFromRequest(request);
  const auditConfigError = getAuditConfigError();
  if (auditConfigError) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Audit logging is not configured." }, { status: 503 }),
    };
  }

  const { userId } = await auth();

  if (!userId) {
    await appendAudit({
      action: "AUTH_FAILURE",
      route,
      metadata: { ...metadata, permission },
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await currentUser();
  const email = primaryEmail(user);
  const role = resolvePortfolioRole({
    metadataRole: user?.publicMetadata?.role,
    email,
  });

  if (!role) {
    await appendAudit({
      userId,
      role: null,
      action: "RBAC_REJECT",
      route,
      metadata: { ...metadata, permission, reason: "missing_or_invalid_role" },
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const violation = checkRedLines({
    role,
    method: request.method,
    route,
    bodyText: await bodyTextForRedLines(request),
  });

  if (violation) {
    await appendAudit({
      userId,
      role,
      action: "RED_LINE_BLOCK",
      route,
      metadata: { ...metadata, permission, ruleId: violation.id },
    });
    return {
      ok: false,
      response: NextResponse.json({ error: violation.message }, { status: 403 }),
    };
  }

  if (!canAccess(role, permission)) {
    await appendAudit({
      userId,
      role,
      action: "RBAC_REJECT",
      route,
      metadata: { ...metadata, permission },
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const rateLimit = await enforceRateLimit({ userId, action });
  if (!rateLimit.ok) {
    await appendAudit({
      userId,
      role,
      action: "RATE_LIMIT_REJECT",
      route,
      metadata: { ...metadata, permission, limitedAction: action },
    });
    const response = NextResponse.json({ error: rateLimit.message }, { status: rateLimit.status });
    if (rateLimit.retryAfterSeconds) response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return { ok: false, response };
  }

  await appendAudit({
    userId,
    role,
    action,
    route,
    metadata,
  });

  return {
    ok: true,
    context: { userId, role, email },
  };
}
