'use client';

import { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
  performance: Array<{ date: string; spyPrice: number | null; navPerUnit: number | null }>;
  history: Array<{ date: string; type: string; amount: number; navPerUnit: number | null; units: number }>;
}

interface InvestorUpdate {
  isoWeek: string;
  generatedAt: string;
  value: number | null;
  gainLoss: number | null;
  gainLossPct: number | null;
  navAsOf: string | null;
  weeklyTrades: Array<{ date: string; ticker: string; side: string; amount: number; price: number }>;
  topHoldings: Array<{ ticker: string; marketValue: number }>;
}

const gl = (v: number | null) => gainLossColor(v).replace('600', '300');

export default function InvestorsPage() {
  const [data, setData] = useState<InvestorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<InvestorUpdate | null>(null);

  const load = useCallback(() => {
    fetch('/api/investors', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    fetch('/api/investor-updates', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => setUpdate(json.update ?? null))
      .catch(() => setUpdate(null));
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
        <ClientView position={data.position} proRataHoldings={data.proRataHoldings} performance={data.performance} history={data.history} update={update} />
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

type ClientTab = 'overview' | 'performance' | 'history' | 'updates' | 'account';

function ClientView({
  position,
  proRataHoldings,
  performance,
  history,
  update,
}: {
  position: InvestorPosition | null;
  proRataHoldings: ProRataHolding[];
  performance: InvestorsResponse['performance'];
  history: InvestorsResponse['history'];
  update: InvestorUpdate | null;
}) {
  const [tab, setTab] = useState<ClientTab>('overview');

  if (!position) {
    return (
      <div className="terminal-panel space-y-3 p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/70">Account not initialized</p>
        <p className="text-sm text-slate-400">No investment recorded yet under your account.</p>
        <AccountView position={null} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-white/10 pb-1">
        {([
          ['overview', 'Overview'],
          ['performance', 'Performance'],
          ['history', 'Capital history'],
          ['updates', 'Manager updates'],
          ['account', 'Account & documents'],
        ] as Array<[ClientTab, string]>).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${tab === value ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-200' : 'border-transparent text-slate-500 hover:border-white/10 hover:text-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <ClientOverview position={position} proRataHoldings={proRataHoldings} />}
      {tab === 'performance' && <PerformanceView performance={performance} />}
      {tab === 'history' && <CapitalHistory history={history} />}
      {tab === 'updates' && <ManagerUpdates update={update} />}
      {tab === 'account' && <AccountView position={position} />}
    </div>
  );
}

function ClientOverview({ position, proRataHoldings }: { position: InvestorPosition; proRataHoldings: ProRataHolding[] }) {
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
                <span className="text-slate-300">{h.ticker} <span className="text-slate-500">{h.name}</span></span>
                <span className="font-mono text-slate-100">{fmtCurrency(h.marketValue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PerformanceView({ performance }: { performance: InvestorsResponse['performance'] }) {
  const valid = performance.filter((p) => p.navPerUnit != null && p.navPerUnit > 0);
  const baseNav = valid[0]?.navPerUnit ?? null;
  const baseSpy = valid.find((p) => p.spyPrice != null && p.spyPrice > 0)?.spyPrice ?? null;
  const chart = valid.map((p) => ({
    date: p.date,
    Portfolio: baseNav ? ((p.navPerUnit as number) / baseNav - 1) * 100 : 0,
    'S&P 500': baseSpy && p.spyPrice ? (p.spyPrice / baseSpy - 1) * 100 : null,
  }));

  return (
    <div className="terminal-panel p-5">
      <div className="mb-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">Performance record</p>
        <h2 className="mt-1 text-xl font-semibold text-white">NAV return over time</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Returns are normalized from the first available NAV so contributions do not look like investment performance.</p>
      </div>
      {chart.length === 0 ? (
        <p className="border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">No performance history yet.</p>
      ) : (
        <div className="h-[290px] sm:h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs><linearGradient id="clientPerformanceGlow" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#00ffb2" stopOpacity={0.36} /><stop offset="95%" stopColor="#00ffb2" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Number(value).toFixed(1)}%`} width={48} />
              <Tooltip formatter={(value) => value == null ? '—' : `${Number(value).toFixed(2)}%`} contentStyle={{ background: '#071019', border: '1px solid rgba(0,255,178,.22)', color: '#e5fff7' }} />
              <Area type="monotone" dataKey="Portfolio" stroke="#00ffb2" strokeWidth={3} fill="url(#clientPerformanceGlow)" dot={false} />
              {baseSpy && <Area type="monotone" dataKey="S&P 500" stroke="#7dd3fc" strokeWidth={2} fill="none" dot={false} connectNulls />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function CapitalHistory({ history }: { history: InvestorsResponse['history'] }) {
  return (
    <div className="terminal-panel overflow-hidden p-5">
      <div className="mb-4"><p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-200/70">Capital history</p><h2 className="mt-1 text-xl font-semibold text-white">Contributions and withdrawals</h2></div>
      {history.length === 0 ? <p className="text-sm text-slate-400">No capital transactions recorded yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-white/10 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500"><th className="py-2">Date</th><th className="py-2">Type</th><th className="py-2 text-right">Amount</th><th className="py-2 text-right">NAV / Unit</th><th className="py-2 text-right">Units</th></tr></thead><tbody>{history.map((entry, index) => <tr key={`${entry.date}-${entry.type}-${index}`} className="border-b border-white/5"><td className="py-3 text-slate-300">{entry.date}</td><td className={entry.type === 'Contribution' ? 'py-3 text-emerald-200' : 'py-3 text-amber-200'}>{entry.type}</td><td className="py-3 text-right font-mono text-slate-100">{fmtCurrency(entry.amount)}</td><td className="py-3 text-right font-mono text-slate-400">{fmtCurrency(entry.navPerUnit, 4)}</td><td className="py-3 text-right font-mono text-slate-400">{fmtNumber(entry.units, 4)}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}

function ManagerUpdates({ update }: { update: InvestorUpdate | null }) {
  return <div className="terminal-panel p-5"><p className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-200/70">Manager updates</p>{update ? <><div className="mt-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-xl font-semibold text-white">Portfolio update {update.isoWeek}</h2><span className="font-mono text-[10px] text-slate-500">NAV as of {update.navAsOf ?? 'latest available'}</span></div><div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3"><Stat label="Current Value" value={fmtCurrency(update.value)} /><Stat label="Gain/Loss" value={`${fmtCurrency(update.gainLoss)} (${fmtPercent(update.gainLossPct)})`} className={gl(update.gainLoss)} /><Stat label="Actions" value={String(update.weeklyTrades.length)} /></div><div className="mt-5 grid gap-5 border-t border-white/10 pt-4 md:grid-cols-2"><div><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">This week</p>{update.weeklyTrades.length ? <div className="space-y-2">{update.weeklyTrades.map((trade, i) => <p key={`${trade.date}-${trade.ticker}-${i}`} className="text-sm text-slate-300">{trade.date}: <span className="text-white">{trade.side} {trade.ticker}</span> at {fmtCurrency(trade.price)}</p>)}</div> : <p className="text-sm text-slate-500">No buys or sells were executed this week.</p>}</div><div><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Largest exposures</p>{update.topHoldings.length ? <div className="space-y-2">{update.topHoldings.map((holding) => <div key={holding.ticker} className="flex justify-between text-sm"><span className="text-slate-300">{holding.ticker}</span><span className="font-mono text-slate-100">{fmtCurrency(holding.marketValue)}</span></div>)}</div> : <p className="text-sm text-slate-500">No current exposure available yet.</p>}</div></div></> : <p className="mt-3 text-sm leading-6 text-slate-400">No manager update has been published yet. Updates appear here after the weekly portfolio review runs.</p>}</div>;
}

function AccountView({ position }: { position: InvestorPosition | null }) {
  return <div className="grid gap-4 md:grid-cols-2"><div className="terminal-panel p-5"><p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">Account details</p><div className="mt-4 space-y-3 text-sm"><AccountRow label="Account holder" value={position?.name ?? 'Not initialized'} /><AccountRow label="Email" value={position?.email ?? '—'} /><AccountRow label="Investor ID" value={position?.investorId ?? 'Assigned after first ledger entry'} /><AccountRow label="Units held" value={position ? fmtNumber(position.units, 4) : '—'} /><AccountRow label="Current NAV / unit" value={position ? fmtCurrency(position.navPerUnit, 4) : '—'} /></div></div><div className="terminal-panel p-5"><p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-200/70">Documents</p><h2 className="mt-1 text-xl font-semibold text-white">Your account records</h2><p className="mt-2 text-sm leading-6 text-slate-500">Download a current capital-account statement containing only your contributions and withdrawals.</p>{position && <a href="/api/investors/statement" className="mt-5 inline-flex border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15">Download statement CSV</a>}</div></div>;
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col gap-1 border-b border-white/5 pb-2 sm:flex-row sm:items-center sm:justify-between"><span className="text-slate-500">{label}</span><span className="font-mono text-xs text-slate-200 sm:text-right">{value}</span></div>;
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
