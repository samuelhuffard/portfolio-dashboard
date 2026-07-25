"use client";

import ApprovalsPage from "@/app/approvals/page";

/**
 * Kairos (Agent 4) is intentionally surfaced as the approval-first portfolio desk. Its
 * shadow decision is shown beside each proposal inside the shared queue rather
 * than as a separate operating surface.
 */
export default function PortfolioManagerPage() {
  return <ApprovalsPage />;
}
