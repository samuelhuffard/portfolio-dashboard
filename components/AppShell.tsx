"use client";

import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import PageTransition from "@/components/PageTransition";
import Sidebar from "@/components/Sidebar";
import type { PortfolioRole } from "@/lib/rbac";

interface AppShellProps {
  children: React.ReactNode;
  role: PortfolioRole | null;
}

const CLIENT_ROUTES = new Set(["/", "/holdings", "/recommendations", "/news", "/investors"]);
const MANAGER_ONLY_PREFIXES = ["/research", "/compare", "/history", "/strategy", "/agents"];

function routeAllowed(role: PortfolioRole | null, pathname: string): boolean {
  if (!role) return false;
  if (role === "FundManager") return true;
  if (CLIENT_ROUTES.has(pathname)) return true;
  return !MANAGER_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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
            ? "Client accounts are limited to portfolio transparency, positions, client signals, and catalysts."
            : "This account needs a Portfolio Manager role assignment before the dashboard can load."}
        </p>
      </section>
    </div>
  );
}

export default function AppShell({ children, role }: AppShellProps) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/sign-in");
  const hasSidebar = !isAuthRoute && role !== null;

  if (isAuthRoute) {
    return <main className="relative min-h-screen overflow-hidden">{children}</main>;
  }

  return (
    <>
      {hasSidebar && <Sidebar role={role} />}
      <main
        className={`relative min-h-screen overflow-hidden px-3 pb-28 pt-3 sm:px-5 lg:px-8 lg:py-7 lg:pb-10 ${
          hasSidebar ? "lg:ml-72" : ""
        }`}
      >
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(0,255,178,0.14),transparent_27%),radial-gradient(circle_at_90%_5%,rgba(255,184,77,0.12),transparent_26%),linear-gradient(135deg,#06080b_0%,#0d1117_42%,#111827_100%)]" />
        <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-28 bg-gradient-to-b from-cyan-300/10 to-transparent" />
        <PageTransition>
          <div className="mx-auto max-w-[1540px]">
            {routeAllowed(role, pathname) ? children : <AccessBlock role={role} />}
          </div>
        </PageTransition>
      </main>
    </>
  );
}
