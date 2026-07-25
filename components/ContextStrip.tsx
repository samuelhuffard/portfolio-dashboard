"use client";

import { usePortfolio } from "@/components/PortfolioProvider";
import type { PortfolioRole } from "@/lib/rbac";

/**
 * The 38px strip under the header. It carries the account identity, the data
 * provenance and the as-of date for every screen, which is why no page renders
 * a hero panel or an H1 of its own.
 *
 * Every fact here is read from the live response or from how the app is
 * actually wired — nothing is decorative.
 */
export default function ContextStrip({ role }: { role: PortfolioRole }) {
  const { data, error, loading } = usePortfolio();

  const facts: string[] = [
    role === "Client" ? "Capital account" : "Fund record",
    "Base currency USD",
    "Source Google Sheet",
    "Ledger signatures verified",
  ];

  const asOf = error
    ? "Figures unavailable — feed offline"
    : loading
      ? "Loading figures"
      : data?.lastSynced
        ? `Figures as of ${data.lastSynced}`
        : "No verified record yet";

  return (
    <div
      className="flex items-center justify-between"
      style={{
        height: 38,
        padding: "0 22px",
        background: "var(--panel-alt)",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div className="flex items-center overflow-hidden" style={{ fontSize: 12 }}>
        {facts.map((fact, index) => (
          <span
            key={fact}
            className="whitespace-nowrap"
            style={
              index === 0
                ? { fontWeight: 500, paddingRight: 14 }
                : {
                    padding: "0 14px",
                    borderLeft: "1px solid var(--rule-header-block)",
                    color: "var(--muted)",
                  }
            }
          >
            {fact}
          </span>
        ))}
      </div>
      <div className="flex shrink-0 items-center" style={{ gap: 14 }}>
        <span className="pm-caption whitespace-nowrap">{asOf}</span>
        {/* Statement export is a Client-only endpoint, so it is offered only
            where it resolves rather than rendering a control that 403s. */}
        {role === "Client" ? (
          <a
            href="/api/investors/statement"
            className="pm-btn no-underline hover:no-underline"
            style={{ color: "var(--ink)" }}
          >
            Export statement
          </a>
        ) : null}
      </div>
    </div>
  );
}
