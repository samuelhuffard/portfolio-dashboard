'use client';

import { useState } from 'react';
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/format';

export interface RosterOption {
  email: string;
  name: string;
  investorId: string | null;
}

export interface RecordedEntry {
  date: string;
  email: string;
  name: string;
  type: string;
  amount: number;
  navPerUnit: number;
  units: number;
}

interface RecordResponse {
  recorded?: boolean;
  seeded?: boolean;
  entry?: RecordedEntry;
  ownershipPct?: number;
  error?: string;
  needsSeedOwner?: boolean;
}

export async function postContribution(body: Record<string, unknown>): Promise<RecordResponse> {
  const res = await fetch('/api/investors/contributions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as RecordResponse;
}

const inputClass =
  'border border-white/10 bg-black/30 p-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/40 focus:outline-none';

export function newYorkDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function InvestorPicker({
  roster,
  email,
  name,
  onEmail,
  onName,
}: {
  roster: RosterOption[];
  email: string;
  name: string;
  onEmail: (v: string) => void;
  onName: (v: string) => void;
}) {
  const NEW = '__new__';
  const selected = roster.find((r) => r.email === email) ? email : NEW;

  return (
    <>
      <select
        value={selected}
        onChange={(e) => {
          const value = e.target.value;
          if (value === NEW) {
            onEmail('');
            onName('');
          } else {
            const match = roster.find((r) => r.email === value);
            onEmail(value);
            onName(match?.name ?? '');
          }
        }}
        className={inputClass}
        aria-label="Investor"
      >
        {roster.map((r) => (
          <option key={r.investorId ?? r.email} value={r.email}>
            {r.name} — {r.email}
          </option>
        ))}
        <option value={NEW}>New investor…</option>
      </select>
      {selected === NEW && (
        <>
          <input value={email} onChange={(e) => onEmail(e.target.value)} placeholder="investor@example.com" className={inputClass} aria-label="Investor email" />
          <input value={name} onChange={(e) => onName(e.target.value)} placeholder="Investor name" className={inputClass} aria-label="Investor name" />
        </>
      )}
    </>
  );
}

export function ResultLine({ result }: { result: RecordResponse }) {
  if (!result.entry) return null;
  return (
    <p className="border border-emerald-300/30 bg-emerald-300/5 px-4 py-3 font-mono text-xs text-emerald-200">
      {result.seeded ? 'SEEDED @ $1.0000/unit — ' : ''}
      CONTRIBUTION recorded: {fmtCurrency(result.entry.amount)} for{' '}
      {result.entry.name} → {fmtNumber(result.entry.units, 4)} units @ {fmtCurrency(result.entry.navPerUnit, 4)}/unit
      {result.ownershipPct != null ? ` · ownership ${fmtPercent(result.ownershipPct, 2).replace('+', '')}` : ''}
    </p>
  );
}

export function SeedOwnerConfirm({ message, onConfirm, onCancel, busy }: { message: string; onConfirm: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div className="space-y-3 border border-amber-300/30 bg-amber-300/5 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-200/90">Initial owner seed required</p>
      <p className="text-sm leading-6 text-slate-300">{message}</p>
      <p className="text-sm leading-6 text-slate-400">
        The ledger is empty but the portfolio already holds value. Recording this entry as the <span className="text-amber-200">initial owner seed</span>{' '}
        credits this investor with the fund&apos;s existing value at $1.0000/unit. Only do this for the true owner of the pre-existing capital.
      </p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="border border-amber-300/40 bg-amber-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-amber-200 transition-colors hover:bg-amber-300/20 disabled:opacity-40"
        >
          {busy ? 'Recording...' : 'Confirm seed owner'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="border border-white/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-slate-400 transition-colors hover:bg-white/5 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ContributionForm({ roster, onRecorded }: { roster: RosterOption[]; onRecorded: () => void }) {
  const [email, setEmail] = useState(roster[0]?.email ?? '');
  const [name, setName] = useState(roster[0]?.name ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => newYorkDate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedPrompt, setSeedPrompt] = useState<string | null>(null);
  const [result, setResult] = useState<RecordResponse | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  async function submit(seedOwner = false) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const json = await postContribution({ email, name, amount: Number(amount), type: 'Contribution', date, seedOwner, pricingMode: 'prior_nav', idempotencyKey });
      if (json.error) {
        if (json.needsSeedOwner) setSeedPrompt(json.error);
        else setError(json.error);
      } else {
        setSeedPrompt(null);
        setResult(json);
        if (json.recorded) setIdempotencyKey(crypto.randomUUID());
        setAmount('');
        onRecorded();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="terminal-panel space-y-4 p-5 sm:p-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Record Capital Entry</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Writes a signed, append-only row to the Investors ledger. Record only money that has actually arrived or left — this never moves money itself.
          New cash is issued at the last NAV recorded before its deposit date; the account must already reflect the cash so the write can be reconciled.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InvestorPicker roster={roster} email={email} name={name} onEmail={setEmail} onName={setName} />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount ($)"
          inputMode="decimal"
          className={inputClass}
          aria-label="Amount"
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} aria-label="Date" />
      </div>

      {seedPrompt ? (
        <SeedOwnerConfirm message={seedPrompt} onConfirm={() => submit(true)} onCancel={() => setSeedPrompt(null)} busy={busy} />
      ) : (
        <button
          onClick={() => submit(false)}
          disabled={busy || !email || !name || !amount}
          className="border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-300/15 disabled:opacity-40"
        >
          {busy ? 'Recording...' : 'Record contribution'}
        </button>
      )}

      {error && <p className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
      {result && <ResultLine result={result} />}
    </div>
  );
}
