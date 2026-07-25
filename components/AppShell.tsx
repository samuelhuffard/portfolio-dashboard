"use client";

import { UserButton } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import PageTransition from "@/components/PageTransition";
import Sidebar from "@/components/Sidebar";
import { CLIENT_DEFAULT_ROUTE, routeAllowed } from "@/lib/client-access";
import type { PortfolioRole } from "@/lib/rbac";

interface AppShellProps {
  children: React.ReactNode;
  role: PortfolioRole | null;
}

function AccessBlock({ role }: { role: PortfolioRole | null }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center">
      <section className="terminal-panel w-full p-6 sm:p-8">
        <div className="mb-5 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">
            Access Control
          </p>
          <UserButton />
        </div>
        <h1 className="text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
          This desk is not available for this account.
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          {role
            ? "Client accounts are limited to their own capital account plus curated signals and catalysts."
            : "This account needs a Portfolio Manager role assignment before the dashboard can load."}
        </p>
      </section>
    </div>
  );
}

export default function AppShell({ children, role }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthRoute = pathname.startsWith("/sign-in");
  const hasNavigation = !isAuthRoute && role !== null;
  const shouldRedirectClientHome = role === "Client" && pathname === "/";

  useEffect(() => {
    if (shouldRedirectClientHome) {
      router.replace(CLIENT_DEFAULT_ROUTE);
    }
  }, [router, shouldRedirectClientHome]);

  if (isAuthRoute) {
    return <main className="relative min-h-screen overflow-hidden">{children}</main>;
  }

  return (
    <>
      {hasNavigation && <Sidebar role={role} />}
      <main
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-7 sm:px-6 lg:px-8 lg:py-10"
      >
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_86%_0%,rgba(102,128,116,.11),transparent_28%),linear-gradient(180deg,#fcfcf9_0%,#f5f6f1_100%)]" />
        <PageTransition>
          <div className="mx-auto max-w-[1540px]">
            {shouldRedirectClientHome ? (
              <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading capital account...</p>
            ) : routeAllowed(role, pathname) ? (
              children
            ) : (
              <AccessBlock role={role} />
            )}
          </div>
        </PageTransition>
      </main>
    </>
  );
}
