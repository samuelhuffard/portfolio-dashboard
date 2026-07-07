"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AGENTS } from "@/lib/agents";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 4 * 60 * 1_000; // backend runs take ~1-2 min; give up at 4

interface LabOutcome {
  ticker: string | null;
  agentId: string | null;
  action: string;
  thesis: string;
  confidence: number | string | null;
  quantScore: number | string | null;
  ruleCheck: string;
  evaluatorVerdict: string;
  proposalId?: string;
  amountDollars?: number;
  riskSummary?: string | null;
  reason?: string;
}

interface LabStatusResponse {
  status: "running" | "done" | "error";
  ticker: string;
  agentId: string;
  startedAt: string;
  finishedAt?: string;
  outcome?: LabOutcome;
  error?: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "running"; ticker: string; agentId: string }
  | { kind: "done"; outcome: LabOutcome }
  | { kind: "failed"; message: string };

interface AgentResearchPanelProps {
  /** Ticker from the latest rendered analysis; pre-fills the input but never blocks manual entry. */
  defaultTicker?: string;
}

function agentLabel(id: string, name: string): string {
  return name ? `${name} (${id})` : id;
}

function formatDollars(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function AgentResearchPanel({ defaultTicker }: AgentResearchPanelProps) {
  const [ticker, setTicker] = useState(defaultTicker ?? "");
  const [agentId, setAgentId] = useState(AGENTS[0]?.id ?? "agent-1");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // A freshly rendered analysis pre-fills the ticker (user can still overwrite).
  useEffect(() => {
    if (defaultTicker) setTicker(defaultTicker);
  }, [defaultTicker]);

  // Stop any in-flight polling loop.
  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  useEffect(() => stopPolling, []);

  function startPolling(requestId: string, runTicker: string, runAgentId: string) {
    const startedAt = Date.now();
    stopPolling();
    pollTimer.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        stopPolling();
        setPhase({
          kind: "failed",
          message: `Timed out after 4 minutes waiting for the ${runAgentId} run on ${runTicker}. The run may still finish on the backend — check Approvals in a few minutes.`,
        });
        return;
      }
      try {
        const res = await fetch(`/api/lab-research/${requestId}`);
        if (res.status === 404) {
          stopPolling();
          setPhase({ kind: "failed", message: "Run not found or expired on the backend." });
          return;
        }
        if (!res.ok) return; // transient (backend blip) — keep polling until timeout
        const data = (await res.json()) as LabStatusResponse;
        if (data.status === "done" && data.outcome) {
          stopPolling();
          setPhase({ kind: "done", outcome: data.outcome });
        } else if (data.status === "error") {
          stopPolling();
          setPhase({ kind: "failed", message: data.error ?? "Research run failed on the backend." });
        }
        // status === "running" → keep polling
      } catch {
        // network blip — keep polling until timeout
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = ticker.trim().toUpperCase();
    if (!cleaned || submitting || phase.kind === "running") return;
    setSubmitting(true);
    setPhase({ kind: "idle" });
    try {
      const res = await fetch("/api/lab-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: cleaned, agentId }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 202 && data?.requestId) {
        setPhase({ kind: "running", ticker: cleaned, agentId });
        startPolling(data.requestId, cleaned, agentId);
      } else if (res.status === 409) {
        setPhase({ kind: "failed", message: data?.error ?? `A run for ${cleaned} on ${agentId} is already in progress — wait for it to finish.` });
      } else if (res.status === 429) {
        setPhase({ kind: "failed", message: data?.error ?? "A full research scan is currently running — retry after it finishes." });
      } else {
        setPhase({ kind: "failed", message: data?.error ?? `Failed to start research (HTTP ${res.status})` });
      }
    } catch (err) {
      setPhase({ kind: "failed", message: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setSubmitting(false);
    }
  }

  const running = phase.kind === "running";

  return (
    <div className="terminal-panel flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300/75">Send to Agent</p>
        <p className="mt-1.5 text-sm leading-6 text-slate-400">
          Hand this ticker to an agent for a full pipeline run — data gates, quant, AI analysis, risk engine,
          evaluator, auto-sizing. If it clears every gate, a properly sized proposal lands in Approvals.
        </p>
      </div>

      <form onSubmit={handleSend} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lab-ticker" className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">
            Ticker
          </label>
          <input
            id="lab-ticker"
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. NVDA"
            maxLength={10}
            disabled={running}
            className="w-32 border border-white/10 bg-black/30 px-3 py-2 font-mono text-base font-medium uppercase tracking-wide text-white placeholder:text-slate-600 focus:border-emerald-300/60 focus:outline-none disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lab-agent" className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">
            Agent
          </label>
          <select
            id="lab-agent"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            disabled={running}
            className="border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-sm text-white focus:border-emerald-300/60 focus:outline-none disabled:opacity-50"
          >
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id} className="bg-slate-900">
                {agentLabel(a.id, a.name)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting || running || !ticker.trim()}
          className="border border-emerald-300/35 bg-emerald-300/10 px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Starting…" : running ? "Running…" : "Send to Agent"}
        </button>
      </form>

      {phase.kind === "running" && (
        <div className="border border-emerald-300/25 bg-emerald-300/[0.06] px-4 py-3">
          <p className="font-mono text-sm text-emerald-200">
            <span className="mr-2 inline-block animate-pulse">▮</span>
            Agent researching {phase.ticker} — full pipeline: gates → quant → AI → risk → evaluator → sizing
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-500">
            {phase.agentId} · runs typically take 1–2 minutes · polling every 5s
          </p>
        </div>
      )}

      {phase.kind === "failed" && (
        <div className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{phase.message}</div>
      )}

      {phase.kind === "done" && <OutcomeReport outcome={phase.outcome} />}
    </div>
  );
}

function OutcomeReport({ outcome }: { outcome: LabOutcome }) {
  const actionColor =
    outcome.action === "BUY" ? "text-emerald-300" : outcome.action === "SELL" ? "text-red-300" : "text-slate-300";

  return (
    <div className="flex flex-col gap-3 border border-white/10 bg-black/30 p-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-sm">
        <span>
          <span className="text-slate-500">action </span>
          <span className={`font-semibold ${actionColor}`}>{outcome.action}</span>
        </span>
        {outcome.confidence != null && (
          <span>
            <span className="text-slate-500">confidence </span>
            <span className="text-white">{outcome.confidence}</span>
          </span>
        )}
        {outcome.quantScore != null && (
          <span>
            <span className="text-slate-500">quant </span>
            <span className="text-white">{outcome.quantScore}</span>
          </span>
        )}
        <span>
          <span className="text-slate-500">evaluator </span>
          <span className="text-white">{outcome.evaluatorVerdict}</span>
        </span>
      </div>

      {outcome.thesis && <p className="text-sm leading-6 text-slate-300">{outcome.thesis}</p>}

      {outcome.ruleCheck && outcome.ruleCheck !== "OK" && (
        <p className="font-mono text-[11px] text-amber-200/85">rule check: {outcome.ruleCheck}</p>
      )}

      {outcome.proposalId ? (
        <div className="border border-emerald-300/30 bg-emerald-300/10 px-4 py-3">
          <p className="font-mono text-sm text-emerald-200">
            Proposal queued: {outcome.action}
            {typeof outcome.amountDollars === "number" ? ` ${formatDollars(outcome.amountDollars)}` : ""} →{" "}
            <Link href="/approvals" className="underline underline-offset-2 hover:text-white">
              review in Approvals
            </Link>
          </p>
          {outcome.riskSummary && <p className="mt-1 font-mono text-[11px] text-slate-400">{outcome.riskSummary}</p>}
        </div>
      ) : (
        <div className="border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="font-mono text-sm text-slate-300">No proposal queued — {outcome.reason ?? "no reason given"}</p>
        </div>
      )}
    </div>
  );
}
