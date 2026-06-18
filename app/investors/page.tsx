'use client';

import { useEffect, useState } from 'react';
import { fmtCurrency, fmtPercent, fmtNumber, gainLossColor } from '@/lib/format';

interface InvestorPosition {
  investorId: string | null;
  email: string;
  name: string;
  contributed: number;
  withdrawn: number;
  units: number;
  navPerUnit: number | null;
  value: number | null;
  gainLoss: number | null;
  gainLossPct: number | null;
  ownershipPct: number | null;
}

interface ProRataHolding {
  ticker: string;
  name: string;
  marketValue: number;
}

interface AgentInvestorSummary {
  agentId: string;
  agentName: string;
  navPerUnit: number | null;
  position: InvestorPosition | null;
  roster: InvestorPosition[];
  proRataHoldings: ProRataHolding[];
}

function agentLabel(id: string, name: string): string {
  if (name) return name;
  return `Agent ${id.split('-')[1]}`;
}

const gl = (v: number | null) => gainLossColor(v).replace('600', '300');

export default function InvestorsPage() {
  const [role, setRole] = useState<'FundManager' | 'Client' | null>(null);
  const [agents, setAgents] = useState<AgentInvestorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/investors')
      .then((res) => res.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else {
          setRole(json.role);
          setAgents(json.agents ?? []);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading...</p>;
  if (error) return <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>;

  const isManager = role === 'FundManager';

  return (
    <div className="max-w-6xl space-y-6">
      <div className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Capital Accounts</p>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white">{isManager ? 'Investors' : 'My Investment'}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          {isManager
            ? 'Every investor’s ownership stake in each agent’s pool, by units and NAV per unit. Pools are fully independent — ownership in one agent has no claim on another.'
            : 'Your ownership stake in each agent’s pool. You own units in the pool, not specific shares — the pro-rata holdings below show your slice of what each pool actually holds.'}
        </p>
      </div>

      {isManager ? <ManagerView agents={agents} /> : <ClientView agents={agents} />}
    </div>
  );
}

function ManagerView({ agents }: { agents: AgentInvestorSummary[] }) {
  return (
    <div className="space-y-6">
      {agents.map((a) => (
        <div key={a.agentId} className="terminal-panel overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-emerald-300">{agentLabel(a.agentId, a.agentName)}</p>
              <p className="mt-1 text-xs text-slate-500">NAV per unit: {a.navPerUnit != null ? fmtCurrency(a.navPerUnit, 4) : 'no NAV yet'}</p>
            </div>
            <p className="font-mono text-sm text-slate-300">
              {fmtCurrency(a.roster.reduce((s, p) => s + (p.value ?? 0), 0))} total
            </p>
          </div>
          {a.roster.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No investors recorded yet for this agent.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    <th className="px-4 py-2">Investor</th>
                    <th className="px-4 py-2 text-right">Contributed</th>
                    <th className="px-4 py-2 text-right">Withdrawn</th>
                    <th className="px-4 py-2 text-right">Units</th>
                    <th className="px-4 py-2 text-right">Value</th>
                    <th className="px-4 py-2 text-right">Gain/Loss</th>
                    <th className="px-4 py-2 text-right">Ownership</th>
                  </tr>
                </thead>
                <tbody>
                  {a.roster.map((p) => (
                    <tr key={p.investorId ?? p.email} className="border-b border-white/5">
                      <td className="px-4 py-3">
                        <p className="text-slate-100">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.email}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">{fmtCurrency(p.contributed)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">{fmtCurrency(p.withdrawn)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">{fmtNumber(p.units, 2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-100">{fmtCurrency(p.value)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${gl(p.gainLoss)}`}>
                        {fmtCurrency(p.gainLoss)} ({fmtPercent(p.gainLossPct)})
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">{fmtPercent(p.ownershipPct, 1).replace('+', '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ClientView({ agents }: { agents: AgentInvestorSummary[] }) {
  const withPosition = agents.filter((a) => a.position);
  const totalValue = withPosition.reduce((s, a) => s + (a.position?.value ?? 0), 0);
  const totalContributed = withPosition.reduce((s, a) => s + (a.position?.contributed ?? 0) - (a.position?.withdrawn ?? 0), 0);
  const totalGainLoss = totalValue - totalContributed;
  const totalGainLossPct = totalContributed ? (totalGainLoss / totalContributed) * 100 : null;

  if (!withPosition.length) {
    return <p className="terminal-panel p-6 text-sm text-slate-400">No investment recorded yet under your account.</p>;
  }

  return (
    <div className="space-y-6">
      {withPosition.length > 1 && (
        <div className="terminal-panel grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Stat label="Total Value" value={fmtCurrency(totalValue)} />
          <Stat label="Net Contributed" value={fmtCurrency(totalContributed)} />
          <Stat label="Gain/Loss" value={fmtCurrency(totalGainLoss)} className={gl(totalGainLoss)} />
          <Stat label="Return" value={fmtPercent(totalGainLossPct)} className={gl(totalGainLoss)} />
        </div>
      )}

      {withPosition.map((a) => {
        const p = a.position!;
        return (
          <div key={a.agentId} className="terminal-panel p-5">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.16em] text-emerald-300">{agentLabel(a.agentId, a.agentName)}</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Your Value" value={fmtCurrency(p.value)} />
              <Stat label="Net Contributed" value={fmtCurrency(p.contributed - p.withdrawn)} />
              <Stat label="Gain/Loss" value={`${fmtCurrency(p.gainLoss)} (${fmtPercent(p.gainLossPct)})`} className={gl(p.gainLoss)} />
              <Stat label="Ownership" value={fmtPercent(p.ownershipPct, 2).replace('+', '')} />
            </div>

            {a.proRataHoldings.length > 0 && (
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Your pro-rata exposure (not shares you own directly)</p>
                <div className="space-y-1">
                  {a.proRataHoldings.map((h) => (
                    <div key={h.ticker} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">
                        {h.ticker} <span className="text-slate-500">{h.name}</span>
                      </span>
                      <span className="font-mono text-slate-100">{fmtCurrency(h.marketValue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, className = 'text-slate-100' }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-lg ${className}`}>{value}</p>
    </div>
  );
}
