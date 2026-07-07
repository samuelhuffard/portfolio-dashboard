'use client';

import { useCallback, useEffect, useState } from 'react';
import { fmtCurrency, fmtPercent, fmtNumber, gainLossColor } from '@/lib/format';
import ContributionForm, { type RosterOption } from '@/components/investors/ContributionForm';
import UnattributedCard from '@/components/investors/UnattributedCard';

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

interface UnattributedCapital {
  amount: number;
  capitalIn: number;
  netContributions: number;
  detected: boolean;
}

interface InvestorsResponse {
  role: 'FundManager' | 'Client';
  navPerUnit: number | null;
  unitsOutstanding: number | null;
  totalFundValue: number | null;
  position: InvestorPosition | null;
  roster: InvestorPosition[];
  proRataHoldings: ProRataHolding[];
  unattributed: UnattributedCapital | null;
  navIsCurrent: boolean;
  latestNavDate: string | null;
}

const gl = (v: number | null) => gainLossColor(v).replace('600', '300');

export default function InvestorsPage() {
  const [data, setData] = useState<InvestorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/investors')
      .then((res) => res.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="font-mono text-sm uppercase tracking-[0.24em] text-emerald-200">Loading...</p>;
  if (error) return <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>;
  if (!data) return null;

  const isManager = data.role === 'FundManager';

  return (
    <div className="max-w-6xl space-y-6">
      <div className="terminal-panel p-5 sm:p-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Capital Accounts</p>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white">{isManager ? 'Investors' : 'My Investment'}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          {isManager
            ? 'Every investor’s ownership stake in the shared portfolio, by units and NAV per unit.'
            : 'Your ownership stake in the shared portfolio. You own units in the pool, not specific shares — the pro-rata holdings below show your slice of what the pool actually holds.'}
        </p>
      </div>

      {isManager ? (
        <>
          {data.unattributed?.detected && (
            <UnattributedCard
              amount={data.unattributed.amount}
              roster={rosterOptions(data.roster)}
              latestNavDate={data.latestNavDate}
              navIsCurrent={data.navIsCurrent}
              onRecorded={load}
            />
          )}
          <ManagerView
            navPerUnit={data.navPerUnit}
            unitsOutstanding={data.unitsOutstanding}
            totalFundValue={data.totalFundValue}
            roster={data.roster}
          />
          <ContributionForm roster={rosterOptions(data.roster)} onRecorded={load} />
          <WithdrawalPreviewPanel />
        </>
      ) : (
        <ClientView position={data.position} proRataHoldings={data.proRataHoldings} />
      )}
    </div>
  );
}

function rosterOptions(roster: InvestorPosition[]): RosterOption[] {
  return roster.map((p) => ({ email: p.email, name: p.name, investorId: p.investorId }));
}

function ManagerView({
  navPerUnit,
  unitsOutstanding,
  totalFundValue,
  roster,
}: {
  navPerUnit: number | null;
  unitsOutstanding: number | null;
  totalFundValue: number | null;
  roster: InvestorPosition[];
}) {
  const rosterValue = roster.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="terminal-panel overflow-hidden p-0">
      <div className="grid grid-cols-2 gap-4 border-b border-white/10 p-4 sm:grid-cols-4">
        <Stat label="Total Fund Value" value={totalFundValue != null ? fmtCurrency(totalFundValue) : fmtCurrency(rosterValue)} />
        <Stat label="NAV per Unit" value={navPerUnit != null ? fmtCurrency(navPerUnit, 4) : 'no NAV yet'} />
        <Stat label="Units Outstanding" value={unitsOutstanding != null ? fmtNumber(unitsOutstanding, 4) : '—'} />
        <Stat label="Investors" value={String(roster.length)} />
      </div>
      {roster.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">No investors recorded yet.</p>
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
              {roster.map((p) => (
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
  );
}

function ClientView({ position, proRataHoldings }: { position: InvestorPosition | null; proRataHoldings: ProRataHolding[] }) {
  if (!position) {
    return <p className="terminal-panel p-6 text-sm text-slate-400">No investment recorded yet under your account.</p>;
  }

  return (
    <div className="terminal-panel p-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Your Value" value={fmtCurrency(position.value)} />
        <Stat label="Net Contributed" value={fmtCurrency(position.contributed - position.withdrawn)} />
        <Stat label="Gain/Loss" value={`${fmtCurrency(position.gainLoss)} (${fmtPercent(position.gainLossPct)})`} className={gl(position.gainLoss)} />
        <Stat label="Ownership" value={fmtPercent(position.ownershipPct, 2).replace('+', '')} />
      </div>

      {proRataHoldings.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Your pro-rata exposure (not shares you own directly)</p>
          <div className="space-y-1">
            {proRataHoldings.map((h) => (
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
}

function Stat({ label, value, className = 'text-slate-100' }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-lg ${className}`}>{value}</p>
    </div>
  );
}

interface PreviewResult {
  investor: { email: string; value: number; units: number };
  holdings: { ticker: string; shares: number; currentPrice: number | null }[];
  preview: {
    requestedAmount: number;
    cashAvailable: number;
    shortfall: number;
    sells: { ticker: string; shares: number; price: number; realizedGain: number }[];
    totalRealizedGain: number;
    taxReserveRatePct: number;
    taxReserve: number;
    suggestedNetPayout: number;
  };
}

function WithdrawalPreviewPanel() {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [sellFrom, setSellFrom] = useState(''); // "TICKER:shares, TICKER:shares"
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runPreview() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const sells = sellFrom
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [ticker, shares] = s.split(':');
          return { ticker: ticker.trim(), shares: Number(shares) };
        });
      const res = await fetch('/api/withdrawals/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, amount: amount === 'full' ? 'full' : Number(amount), sellFrom: sells }),
      });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="terminal-panel space-y-4 p-5 sm:p-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Withdrawal Preview</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Informational only — shows the realized gain and suggested tax reserve a withdrawal would trigger. Nothing here moves
          money or sells anything for real; record the actual withdrawal via portfolio-manager's <code>process-withdrawal.js</code>{' '}
          after you've executed any real sells and decided the real payout.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="investor@example.com"
          className="border border-white/10 bg-black/30 p-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/40 focus:outline-none"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder='Amount (or "full")'
          className="border border-white/10 bg-black/30 p-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/40 focus:outline-none"
        />
        <input
          value={sellFrom}
          onChange={(e) => setSellFrom(e.target.value)}
          placeholder="Sell from: AAPL:5, MSFT:2 (optional)"
          className="border border-white/10 bg-black/30 p-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/40 focus:outline-none"
        />
      </div>

      <button
        onClick={runPreview}
        disabled={loading || !email || !amount}
        className="border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:opacity-40"
      >
        {loading ? 'Calculating...' : 'Preview'}
      </button>

      {error && <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      {result && (
        <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4 sm:grid-cols-4">
          <Stat label="Requested" value={fmtCurrency(result.preview.requestedAmount)} />
          <Stat label="Cash Available" value={fmtCurrency(result.preview.cashAvailable)} />
          <Stat label="Realized Gain" value={fmtCurrency(result.preview.totalRealizedGain)} className={gl(result.preview.totalRealizedGain)} />
          <Stat label={`Tax Reserve (${(result.preview.taxReserveRatePct * 100).toFixed(1)}%)`} value={fmtCurrency(result.preview.taxReserve)} />
          <Stat label="Suggested Net Payout" value={fmtCurrency(result.preview.suggestedNetPayout)} />
          {result.preview.shortfall > 0.01 && (
            <Stat label="Shortfall vs. Cash" value={fmtCurrency(result.preview.shortfall)} className="text-amber-300" />
          )}
        </div>
      )}
    </div>
  );
}
