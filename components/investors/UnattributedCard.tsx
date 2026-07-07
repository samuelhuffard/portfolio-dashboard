'use client';

import { useState } from 'react';
import { fmtCurrency } from '@/lib/format';
import {
  InvestorPicker,
  ResultLine,
  SeedOwnerConfirm,
  postContribution,
  type RosterOption,
} from './ContributionForm';

const inputClass =
  'border border-white/10 bg-black/30 p-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/40 focus:outline-none';

/**
 * Shown to the FundManager when money is sitting in the account that the
 * capital ledger doesn't account for: (cash + cost basis) exceeds net
 * recorded contributions. Attributing it writes a real signed ledger entry.
 */
export default function UnattributedCard({
  amount,
  roster,
  latestNavDate,
  navIsCurrent,
  onRecorded,
}: {
  amount: number;
  roster: RosterOption[];
  latestNavDate: string | null;
  navIsCurrent: boolean;
  onRecorded: () => void;
}) {
  const [email, setEmail] = useState(roster[0]?.email ?? '');
  const [name, setName] = useState(roster[0]?.name ?? '');
  const [entryAmount, setEntryAmount] = useState(amount.toFixed(2));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedPrompt, setSeedPrompt] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof postContribution>> | null>(null);

  async function submit(seedOwner = false) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const json = await postContribution({ email, name, amount: Number(entryAmount), type: 'Contribution', date, seedOwner, attributeExistingCapital: true });
      if (json.error) {
        if (json.needsSeedOwner) setSeedPrompt(json.error);
        else setError(json.error);
      } else {
        setSeedPrompt(null);
        setResult(json);
        onRecorded();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-amber-300/40 bg-amber-300/[0.06] p-5 sm:p-6">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200">Unattributed capital detected</span>
        <span className="font-mono text-lg font-bold text-amber-100">{fmtCurrency(amount)}</span>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
        The account holds {fmtCurrency(amount)} more than the investor ledger accounts for — who deposited this? Attributing it issues
        units at the current NAV per unit and writes a signed ledger row.
      </p>
      {!navIsCurrent && (
        <p className="mt-2 font-mono text-xs text-amber-200/80">
          Latest NAV is dated {latestNavDate ?? 'unknown'} — run a holdings sync first or the write will be refused.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InvestorPicker roster={roster} email={email} name={name} onEmail={setEmail} onName={setName} />
        <input
          value={entryAmount}
          onChange={(e) => setEntryAmount(e.target.value)}
          inputMode="decimal"
          className={inputClass}
          aria-label="Deposit amount"
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} aria-label="Deposit date" />
      </div>

      <div className="mt-4">
        {seedPrompt ? (
          <SeedOwnerConfirm message={seedPrompt} onConfirm={() => submit(true)} onCancel={() => setSeedPrompt(null)} busy={busy} />
        ) : (
          <button
            onClick={() => submit(false)}
            disabled={busy || !email || !name || !entryAmount}
            className="border border-amber-300/40 bg-amber-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-amber-200 transition-colors hover:bg-amber-300/20 disabled:opacity-40"
          >
            {busy ? 'Recording...' : 'Attribute deposit'}
          </button>
        )}
      </div>

      {error && <p className="mt-3 border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
      {result && (
        <div className="mt-3">
          <ResultLine result={result} />
        </div>
      )}
    </div>
  );
}
