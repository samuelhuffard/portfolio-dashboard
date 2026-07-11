"use client";

import { useEffect, useState } from "react";

interface StrategyBudget {
  agentId: string;
  budgetDollars: number;
  allocatedDollars: number;
  previousBudgetDollars: number;
  evaluatedProposalCount: number;
  filledTradeCount: number;
}

interface AllocationPolicy {
  version: string;
  mode: "SHADOW";
  effectiveAt: string;
  maxSingleProposalDollars: number;
  maxStrategyAllocationPct: number;
  maxTickerExposurePct: number;
  minCashReservePct: number;
  maxGrossExposurePct: number;
  maxBudgetChangePct: number;
  evidenceWindowDays: number;
  maxAllocationSnapshotAgeMinutes: number;
  maxPortfolioSnapshotAgeMinutes: number;
  minEvaluatedProposals: number;
  minFilledTrades: number;
}

interface AllocationSnapshot {
  id: string;
  capturedAt: string;
  portfolioEquityDollars: number;
  budgets: StrategyBudget[];
}

interface PortfolioRiskSnapshot {
  id: string;
  capturedAt: string;
  portfolioEquityDollars: number;
  cashAvailableDollars: number;
  grossExposureDollars: number;
  tickerExposures: Array<{ ticker: string; marketValueDollars: number }>;
}

interface PortfolioDecision {
  id: string;
  proposalId: string;
  mode: "SHADOW";
  outcome: "ACCEPT" | "REJECT";
  reasonCodes: string[];
  explanation: string[];
  proposalSnapshot: {
    agentId: string;
    ticker: string;
    side: "BUY" | "SELL";
    amountDollars: number;
  };
  policyVersion: string;
  decidedAt: string;
  liveApprovalHmac: null;
  orderIntent: null;
}

interface ShadowState {
  mode: "SHADOW";
  policy: AllocationPolicy | null;
  allocationSnapshot: AllocationSnapshot | null;
  portfolioSnapshot: PortfolioRiskSnapshot | null;
  decisions: PortfolioDecision[];
}

function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function when(value: string | null | undefined): string {
  if (!value) return "Awaiting first snapshot";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function agentName(id: string): string {
  return id === "agent-1" ? "Specialist 01" : id === "agent-2" ? "Specialist 02" : "Specialist 03";
}

export default function PortfolioManagerPage() {
  const [state, setState] = useState<ShadowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/portfolio-manager", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok || body.error) throw new Error(body.error || "Failed to load Agent 4 state.");
        if (!cancelled) {
          setState(body);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const acceptedCount = state?.decisions.filter((decision) => decision.outcome === "ACCEPT").length ?? 0;
  const rejectedCount = state?.decisions.filter((decision) => decision.outcome === "REJECT").length ?? 0;

  if (loading) {
    return <p className="font-mono text-sm uppercase tracking-[0.24em] text-cyan-200">Loading shadow allocation desk...</p>;
  }

  return (
    <div className="space-y-5">
      <section className="terminal-panel overflow-hidden p-5 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-end">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="border border-cyan-300/35 bg-cyan-300/[0.08] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-100">
                Agent 4 · Shadow only
              </span>
              <span className="border border-amber-300/25 bg-amber-300/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-100">
                No approval key · No order authority
              </span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-slate-500">Portfolio allocation room</p>
            <h1 className="mt-2 max-w-4xl text-4xl font-black tracking-[-0.045em] text-white sm:text-6xl">
              Coordinate the book without touching the broker.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
              Agent 4 evaluates exact specialist proposals against versioned budgets and portfolio limits. Sam remains the only live approver; every decision below is evidence, not authorization.
            </p>
          </div>
          <div className="border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Active policy</span>
              <span className={`h-2 w-2 rounded-full ${state?.policy ? "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,.8)]" : "bg-amber-300"}`} />
            </div>
            <p className="mt-3 text-2xl font-black text-white">{state?.policy?.version ?? "Mandate pending"}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {state?.policy
                ? `Effective ${when(state.policy.effectiveAt)}. Every review is locked to this version.`
                : "The safety engine and decision ledger are ready. Activation waits for the reviewed Agent 4 mandate from Sam and his collaborator."}
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div className="border border-red-300/30 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Shadow decisions" value={String(state?.decisions.length ?? 0)} detail="Immutable, non-executable records" />
        <Metric label="Within policy" value={String(acceptedCount)} detail="Would accept in shadow mode" tone="text-emerald-200" />
        <Metric label="Blocked" value={String(rejectedCount)} detail="Rejected by portfolio constraints" tone="text-red-200" />
        <Metric label="Portfolio equity" value={money(state?.portfolioSnapshot?.portfolioEquityDollars)} detail={when(state?.portfolioSnapshot?.capturedAt)} tone="text-cyan-100" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
        <section className="terminal-panel p-5">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-200/70">Virtual strategy budgets</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-white">Capital without custody</h2>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600">{when(state?.allocationSnapshot?.capturedAt)}</p>
          </div>

          {state?.allocationSnapshot?.budgets.length ? (
            <div className="space-y-5">
              {state.allocationSnapshot.budgets.map((budget) => {
                const used = budget.budgetDollars > 0 ? Math.min(100, (budget.allocatedDollars / budget.budgetDollars) * 100) : 0;
                return (
                  <div key={budget.agentId}>
                    <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{agentName(budget.agentId)}</p>
                        <p className="mt-1 text-lg font-bold text-white">{money(budget.allocatedDollars)} <span className="text-sm font-normal text-slate-500">of {money(budget.budgetDollars)}</span></p>
                      </div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        {budget.evaluatedProposalCount} reviewed · {budget.filledTradeCount} filled
                      </p>
                    </div>
                    <div
                      className="h-2 overflow-hidden bg-white/[0.06]"
                      role="progressbar"
                      aria-label={`${agentName(budget.agentId)} virtual budget used`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(used)}
                    >
                      <div className="h-full bg-gradient-to-r from-emerald-300 to-cyan-300" style={{ width: `${used}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No allocation snapshot yet" copy="Budgets will appear after the reviewed mandate is activated and the first shadow review captures portfolio state." />
          )}
        </section>

        <section className="market-card p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-200/70">Hard portfolio perimeter</p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-white">What Agent 4 cannot cross</h2>
          {state?.policy ? (
            <dl className="mt-5 divide-y divide-white/[0.08] border-y border-white/[0.08]">
              <Limit label="Single proposal" value={money(state.policy.maxSingleProposalDollars)} />
              <Limit label="Strategy allocation" value={`${state.policy.maxStrategyAllocationPct}% max`} />
              <Limit label="Ticker exposure" value={`${state.policy.maxTickerExposurePct}% max`} />
              <Limit label="Cash reserve" value={`${state.policy.minCashReservePct}% min`} />
              <Limit label="Gross exposure" value={`${state.policy.maxGrossExposurePct}% max`} />
              <Limit label="Risk snapshot age" value={`${state.policy.maxPortfolioSnapshotAgeMinutes} min max`} />
              <Limit label="Evidence" value={`${state.policy.minEvaluatedProposals} proposals · ${state.policy.minFilledTrades} fills`} />
            </dl>
          ) : (
            <div className="mt-5">
              <EmptyState title="Bounds intentionally unset" copy="The application will not manufacture allocation limits before the mandate is reviewed. Contract validation rejects live mode and all decisions carry null approval and order fields." />
            </div>
          )}
        </section>
      </div>

      <section className="terminal-panel p-5">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">Decision tape</p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-white">Exact proposals, preserved</h2>
          </div>
          <p className="text-xs text-slate-500">Agent 4 can reject a specialist idea. It cannot rewrite one.</p>
        </div>

        {state?.decisions.length ? (
          <div className="overflow-x-auto border border-white/[0.08]">
            <table className="data-table w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3">Decision</th>
                  <th className="px-4 py-3">Specialist proposal</th>
                  <th className="px-4 py-3">Policy reason</th>
                  <th className="px-4 py-3">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {state.decisions.map((decision) => (
                  <tr key={decision.id}>
                    <td className="px-4 py-4">
                      <span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${decision.outcome === "ACCEPT" ? "border-emerald-300/30 bg-emerald-300/[0.06] text-emerald-100" : "border-red-300/30 bg-red-300/[0.06] text-red-100"}`}>
                        {decision.outcome}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-white">
                      <span className="font-mono font-bold">{decision.proposalSnapshot.side} {decision.proposalSnapshot.ticker}</span>
                      <span className="ml-2 text-slate-500">{money(decision.proposalSnapshot.amountDollars)} · {agentName(decision.proposalSnapshot.agentId)}</span>
                    </td>
                    <td className="max-w-xl px-4 py-4">
                      <p className="text-slate-300">{decision.explanation.join(" ")}</p>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600">{decision.reasonCodes.join(" · ")}</p>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-500">{when(decision.decidedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Decision tape is empty" copy="This is the correct pre-mandate state. Once policy is activated, shadow decisions append here without altering approvals or sending orders." />
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, detail, tone = "text-white" }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="market-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-black tracking-[-0.04em] ${tone}`}>{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-xs text-slate-200">{value}</dd>
    </div>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="border border-dashed border-white/15 bg-black/20 p-5">
      <p className="font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{copy}</p>
    </div>
  );
}
