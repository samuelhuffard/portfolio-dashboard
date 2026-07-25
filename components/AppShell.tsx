"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import ContextStrip from "@/components/ContextStrip";
import { PortfolioProvider, usePortfolio } from "@/components/PortfolioProvider";
import Sidebar from "@/components/Sidebar";
import { CLIENT_DEFAULT_ROUTE, routeAllowed } from "@/lib/client-access";
import type { PortfolioRole } from "@/lib/rbac";

interface AppShellProps {
  children: React.ReactNode;
  role: PortfolioRole | null;
}

/**
 * Routes outside the six-screen handoff. They now speak the chrome tokens
 * directly, but they are still laid out as bordered blocks rather than as the
 * edge-to-edge panel grid, so they keep the shell's gutter.
 */
const GUTTERED_ROUTES = new Set([
  "/alerts",
  "/approvals",
  "/compare",
  "/funnel",
  "/history",
  "/observation",
  "/portfolio-manager", // renders the approvals desk
  "/strategy",
]);

function AccessBlock({ role }: { role: PortfolioRole | null }) {
  return (
    <div className="pm-panel" style={{ padding: "26px 22px" }}>
      <h2 className="pm-h2">This desk is not available for this account.</h2>
      <p style={{ margin: "8px 0 0", maxWidth: 520, fontSize: 12.5, color: "var(--ink-2)" }}>
        {role
          ? "Client accounts are limited to their own capital account plus curated signals and catalysts."
          : "This account needs a Portfolio Manager role assignment before the dashboard can load."}
      </p>
    </div>
  );
}

function ChromeFooter() {
  const { data } = usePortfolio();
  return (
    <footer
      className="flex items-center justify-between"
      style={{ padding: "10px 22px", fontSize: 11, color: "var(--faint)", background: "var(--page)" }}
    >
      <span>Portfolio Manager · Private Wealth Office</span>
      <span className="pm-num">
        {data?.lastSynced ? `Record synced ${data.lastSynced}` : "No verified record"}
      </span>
    </footer>
  );
}

export default function AppShell({ children, role }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthRoute = pathname.startsWith("/sign-in");
  const hasNavigation = !isAuthRoute && role !== null;
  const shouldRedirectClientHome = role === "Client" && pathname === "/";
  const isGuttered = GUTTERED_ROUTES.has(pathname);
  const allowed = routeAllowed(role, pathname);

  useEffect(() => {
    if (shouldRedirectClientHome) {
      router.replace(CLIENT_DEFAULT_ROUTE);
    }
  }, [router, shouldRedirectClientHome]);

  if (isAuthRoute) {
    return <main className="relative min-h-screen">{children}</main>;
  }

  return (
    // Panels run edge to edge: no max-width centring, no shell padding, no
    // background gradient layer. The target layout is the 1180px+ grid.
    <PortfolioProvider enabled={hasNavigation && allowed}>
      <div className="flex min-h-screen flex-col" style={{ minWidth: 1180 }}>
        {hasNavigation && (
          <>
            <Sidebar role={role} />
            <ContextStrip role={role} />
          </>
        )}
        <main className="flex-1">
          {shouldRedirectClientHome ? (
            <div
              className="pm-panel"
              style={{ padding: "26px 22px", fontSize: 12.5, color: "var(--muted)" }}
            >
              Opening capital account…
            </div>
          ) : allowed ? (
            isGuttered ? (
              <div style={{ padding: "18px 22px" }}>{children}</div>
            ) : (
              children
            )
          ) : (
            <AccessBlock role={role} />
          )}
        </main>
        {hasNavigation && <ChromeFooter />}
      </div>
    </PortfolioProvider>
  );
}
