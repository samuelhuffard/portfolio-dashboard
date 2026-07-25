'use client';

import { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  DefRow,
  Footnote,
  Hatch,
  Metric,
  MetricStrip,
  Nil,
  Panel,
  PanelHead,
  RailBlock,
  ScreenGrid,
} from '@/components/chrome';
import ContributionForm, { type RosterOption } from '@/components/investors/ContributionForm';
import UnattributedCard from '@/components/investors/UnattributedCard';
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/format';

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
  performance: Array<{ date: string; spyPrice: number | null; navPerUnit: number | null; portfolioValue?: number | null }>;
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

const AXIS_TICK = { fontSize: 10.5, fill: '#9a9c96', fontFamily: '"IBM Plex Mono", ui-monospace, monospace' };
const TOOLTIP_STYLE = {
  background: '#fff',
  border: '1px solid #dcddd9',
  borderRadius: 0,
  color: '#191b1f',
  fontSize: 12,
};

/** Ownership and NAV percentages read as plain magnitudes, never signed. */
const unsignedPct = (value: number | null, decimals = 1) =>
  value === null ? '—' : fmtPercent(value, decimals).replace('+', '');

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

  if (error) {
    return (
      <ScreenGrid
        main={
          <Panel>
            <PanelHead title="Capital accounts" />
            <Hatch title="Investor ledger is unavailable" note={error} />
          </Panel>
        }
        rail={
          <Footnote label="Unit accounting">
            Units are struck at the NAV in force on the contribution date. Withdrawals redeem units at
            the next struck NAV.
          </Footnote>
        }
      />
    );
  }

  const isManager = data?.role === 'FundManager';
  return isManager ? (
    <ManagerScreen data={data as InvestorsResponse} update={update} onRecorded={load} />
  ) : (
    <ClientScreen data={data} update={update} loading={loading} />
  );
}

function rosterOptions(roster: InvestorPosition[]): RosterOption[] {
  return roster.map((p) => ({ email: p.email, name: p.name, investorId: p.investorId }));
}

function ManagerScreen({
  data,
  update,
  onRecorded,
}: {
  data: InvestorsResponse;
  update: InvestorUpdate | null;
  onRecorded: () => void;
}) {
  const [showContribution, setShowContribution] = useState(false);
  const rosterValue = data.roster.reduce((s, p) => s + (p.value ?? 0), 0);
  const fundValue = data.totalFundValue ?? rosterValue;
  const unattributedAmount = data.unattributed?.detected ? data.unattributed.amount : 0;

  return (
    <ScreenGrid
      main={
        <>
          <MetricStrip columns={4}>
            <Metric
              label="Fund value"
              value={fmtCurrency(fundValue)}
              sub={`Across ${data.roster.length} capital ${data.roster.length === 1 ? 'account' : 'accounts'}`}
            />
            <Metric
              label="NAV per unit"
              value={data.navPerUnit != null ? fmtCurrency(data.navPerUnit, 4) : '—'}
              muted={data.navPerUnit == null}
              sub={data.latestNavDate ? `Struck ${data.latestNavDate}` : 'No NAV struck yet'}
            />
            <Metric
              label="Units issued"
              value={data.unitsOutstanding != null ? fmtNumber(data.unitsOutstanding, 4) : '—'}
              muted={data.unitsOutstanding == null}
              sub={data.navIsCurrent ? 'NAV current' : 'NAV not current'}
            />
            <Metric
              label="Unattributed cash"
              value={fmtCurrency(unattributedAmount)}
              tone={unattributedAmount > 0.01 ? 'warn' : undefined}
              sub={unattributedAmount > 0.01 ? 'Needs attribution' : 'Ledger reconciles'}
            />
          </MetricStrip>

          {data.unattributed?.detected && (
            <Panel>
              <UnattributedCard
                amount={data.unattributed.amount}
                roster={rosterOptions(data.roster)}
                latestNavDate={data.latestNavDate}
                navIsCurrent={data.navIsCurrent}
                onRecorded={onRecorded}
              />
            </Panel>
          )}

          <Panel>
            <PanelHead
              title="Capital accounts"
              right={
                <button
                  type="button"
                  className="pm-btn"
                  onClick={() => setShowContribution((open) => !open)}
                >
                  {showContribution ? 'Close' : 'Record contribution'}
                </button>
              }
            />
            {showContribution && (
              <div style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                <ContributionForm roster={rosterOptions(data.roster)} onRecorded={onRecorded} />
              </div>
            )}
            <table className="pm-table">
              <thead>
                <tr>
                  <th>Investor</th>
                  <th className="pm-num-cell">Contributed</th>
                  <th className="pm-num-cell">Withdrawn</th>
                  <th className="pm-num-cell">Units</th>
                  <th className="pm-num-cell">Value</th>
                  <th className="pm-num-cell">Gain / loss</th>
                  <th className="pm-num-cell">Ownership</th>
                </tr>
              </thead>
              <tbody>
                {data.roster.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="pm-prose-cell"
                      style={{ padding: '26px 18px', textAlign: 'center', fontSize: 12, color: 'var(--muted-2)' }}
                    >
                      No investors recorded yet. Accounts appear after the first signed ledger entry.
                    </td>
                  </tr>
                ) : (
                  <>
                    {data.roster.map((p) => (
                      <tr key={p.investorId ?? p.email}>
                        <td className="pm-prose-cell">
                          <span style={{ fontWeight: 600 }}>{p.name}</span>
                          <span style={{ color: 'var(--muted-2)', paddingLeft: 8 }}>
                            {p.investorId ?? p.email}
                          </span>
                        </td>
                        <td className="pm-num-cell">{fmtCurrency(p.contributed)}</td>
                        <td className="pm-num-cell">{fmtCurrency(p.withdrawn)}</td>
                        <td className="pm-num-cell">{fmtNumber(p.units, 4)}</td>
                        <td className="pm-num-cell">{fmtCurrency(p.value)}</td>
                        <td
                          className="pm-num-cell"
                          style={{ color: p.gainLoss !== null && p.gainLoss >= 0 ? 'var(--pos)' : 'var(--ink)' }}
                        >
                          {p.gainLoss === null ? (
                            <Nil />
                          ) : (
                            <>
                              {fmtCurrency(p.gainLoss)}{' '}
                              {p.gainLossPct !== null && (
                                <span style={{ color: p.gainLoss >= 0 ? 'var(--pos-soft)' : 'var(--muted-2)' }}>
                                  ({fmtPercent(p.gainLossPct)})
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="pm-num-cell">{unsignedPct(p.ownershipPct)}</td>
                      </tr>
                    ))}
                    <tr className="pm-total-row">
                      <td className="pm-prose-cell" style={{ fontWeight: 600 }}>Total</td>
                      <td className="pm-num-cell">
                        {fmtCurrency(data.roster.reduce((s, p) => s + p.contributed, 0))}
                      </td>
                      <td className="pm-num-cell">
                        {fmtCurrency(data.roster.reduce((s, p) => s + p.withdrawn, 0))}
                      </td>
                      <td className="pm-num-cell">
                        {fmtNumber(data.roster.reduce((s, p) => s + p.units, 0), 4)}
                      </td>
                      <td className="pm-num-cell">{fmtCurrency(rosterValue)}</td>
                      <td className="pm-num-cell">
                        {fmtCurrency(data.roster.reduce((s, p) => s + (p.gainLoss ?? 0), 0))}
                      </td>
                      <td className="pm-num-cell">
                        {unsignedPct(data.roster.reduce((s, p) => s + (p.ownershipPct ?? 0), 0))}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </Panel>

          <CapitalHistoryPanel history={data.history} />
          <WithdrawalPreviewPanel />
        </>
      }
      rail={
        <>
          <ManagerUpdateBlock update={update} />
          <RailBlock title="Fund accounting" grow>
            <div className="flex flex-col">
              <DefRow label="Investors">{fmtNumber(data.roster.length, 0)}</DefRow>
              <DefRow label="NAV as of">{data.latestNavDate ?? <Nil />}</DefRow>
              <DefRow label="NAV current">{data.navIsCurrent ? 'Yes' : 'No'}</DefRow>
              <DefRow label="Capital entries">{fmtNumber(data.history.length, 0)}</DefRow>
            </div>
          </RailBlock>
          <Footnote label="Unit accounting">
            Units are struck at the NAV in force on the contribution date. Withdrawals redeem units at
            the next struck NAV.
          </Footnote>
        </>
      }
    />
  );
}

function ClientScreen({
  data,
  update,
  loading,
}: {
  data: InvestorsResponse | null;
  update: InvestorUpdate | null;
  loading: boolean;
}) {
  const position = data?.position ?? null;
  const performance = data?.performance ?? [];

  const valid = performance.filter((p) => p.navPerUnit != null && p.navPerUnit > 0);
  const baseNav = valid[0]?.navPerUnit ?? null;
  const baseSpy = valid.find((p) => p.spyPrice != null && p.spyPrice > 0)?.spyPrice ?? null;
  const chart = valid.map((p) => ({
    date: p.date,
    Portfolio: baseNav ? ((p.navPerUnit as number) / baseNav - 1) * 100 : 0,
    'S&P 500': baseSpy && p.spyPrice ? (p.spyPrice / baseSpy - 1) * 100 : null,
  }));

  return (
    <ScreenGrid
      main={
        <>
          <MetricStrip columns={4}>
            <Metric
              label="Your value"
              value={loading || !position ? '—' : fmtCurrency(position.value)}
              muted={loading || !position}
              sub={position ? 'At the latest struck NAV' : 'No investment recorded yet'}
            />
            <Metric
              label="Net contributed"
              value={loading || !position ? '—' : fmtCurrency(position.contributed - position.withdrawn)}
              muted={loading || !position}
              sub={position ? 'Contributions less withdrawals' : 'Awaiting first contribution'}
            />
            <Metric
              label="Gain / loss"
              value={loading || !position ? '—' : fmtCurrency(position.gainLoss)}
              muted={loading || !position}
              tone={position?.gainLoss != null && position.gainLoss >= 0 ? 'pos' : undefined}
              sub={position?.gainLossPct != null ? fmtPercent(position.gainLossPct) : 'Needs two records'}
            />
            <Metric
              label="Ownership"
              value={loading || !position ? '—' : unsignedPct(position.ownershipPct, 2)}
              muted={loading || !position}
              sub={position ? `${fmtNumber(position.units, 4)} units held` : 'No units issued'}
            />
          </MetricStrip>

          <Panel>
            <PanelHead
              title="NAV return"
              caption="Normalised from the first struck NAV so contributions do not read as performance"
            />
            {chart.length === 0 ? (
              <Hatch
                title="No performance history yet"
                note="The return series begins once two NAV records exist. Nothing is estimated in the meantime."
              />
            ) : (
              <div style={{ padding: '16px 18px 10px', height: 252 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#ebece9" vertical={false} />
                    <XAxis dataKey="date" tick={AXIS_TICK} axisLine={{ stroke: '#dcddd9' }} tickLine={false} minTickGap={40} />
                    <YAxis
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v) => (v == null ? '—' : `${Number(v).toFixed(2)}%`)}
                    />
                    <Area
                      type="monotone"
                      dataKey="Portfolio"
                      stroke="#1f4b76"
                      strokeWidth={1.75}
                      fill="none"
                      dot={false}
                      activeDot={{ r: 2.75, fill: '#1f4b76', strokeWidth: 0 }}
                    />
                    {baseSpy && (
                      <Line
                        type="monotone"
                        dataKey="S&P 500"
                        stroke="#a9abb0"
                        strokeWidth={1.25}
                        strokeDasharray="3 3"
                        dot={false}
                        connectNulls
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHead
              title="Pro-rata exposure"
              caption="Your slice of what the pool holds — not shares you own directly"
            />
            <table className="pm-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th className="pm-num-cell">Your share of market value</th>
                </tr>
              </thead>
              <tbody>
                {(data?.proRataHoldings ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      className="pm-prose-cell"
                      style={{ padding: '26px 18px', textAlign: 'center', fontSize: 12, color: 'var(--muted-2)' }}
                    >
                      No exposure to report. Positions appear once the pool holds settled instruments.
                    </td>
                  </tr>
                ) : (
                  (data?.proRataHoldings ?? []).map((h) => (
                    <tr key={h.ticker}>
                      <td className="pm-prose-cell">
                        <span style={{ fontWeight: 600 }}>{h.ticker}</span>
                        <span style={{ color: 'var(--muted-2)', paddingLeft: 8 }}>{h.name}</span>
                      </td>
                      <td className="pm-num-cell">{fmtCurrency(h.marketValue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Panel>

          <CapitalHistoryPanel history={data?.history ?? []} />
        </>
      }
      rail={
        <>
          <ManagerUpdateBlock update={update} />
          <RailBlock title="Account details" grow>
            <div className="flex flex-col">
              <DefRow label="Account holder">{position?.name ?? 'Not initialised'}</DefRow>
              <DefRow label="Investor ID">
                {position?.investorId ?? <span className="pm-nil">Assigned after first entry</span>}
              </DefRow>
              <DefRow label="Units held">{position ? fmtNumber(position.units, 4) : <Nil />}</DefRow>
              <DefRow label="NAV / unit">
                {position?.navPerUnit != null ? fmtCurrency(position.navPerUnit, 4) : <Nil />}
              </DefRow>
            </div>
            {position && (
              <a
                href="/api/investors/statement"
                className="pm-btn mt-3 block text-center no-underline hover:no-underline"
                style={{ color: 'var(--ink)' }}
              >
                Download statement (CSV)
              </a>
            )}
          </RailBlock>
          <Footnote label="Unit accounting">
            Units are struck at the NAV in force on the contribution date. Withdrawals redeem units at
            the next struck NAV.
          </Footnote>
        </>
      }
    />
  );
}

function CapitalHistoryPanel({ history }: { history: InvestorsResponse['history'] }) {
  return (
    <Panel>
      <PanelHead title="Capital history" caption="Contributions and withdrawals" />
      <table className="pm-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th className="pm-num-cell">Amount</th>
            <th className="pm-num-cell">NAV / unit</th>
            <th className="pm-num-cell">Units</th>
          </tr>
        </thead>
        <tbody>
          {history.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="pm-prose-cell"
                style={{ padding: '26px 18px', textAlign: 'center', fontSize: 12, color: 'var(--muted-2)' }}
              >
                No capital transactions recorded yet.
              </td>
            </tr>
          ) : (
            history.map((entry, index) => (
              <tr key={`${entry.date}-${entry.type}-${index}`}>
                <td>{entry.date}</td>
                {/* Plain text, not a coloured pill. */}
                <td className="pm-prose-cell">{entry.type}</td>
                <td className="pm-num-cell">{fmtCurrency(entry.amount)}</td>
                <td className="pm-num-cell">
                  {entry.navPerUnit === null ? <Nil /> : fmtCurrency(entry.navPerUnit, 4)}
                </td>
                <td className="pm-num-cell">{fmtNumber(entry.units, 4)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Panel>
  );
}

function ManagerUpdateBlock({ update }: { update: InvestorUpdate | null }) {
  return (
    <RailBlock
      title="Manager update"
      right={
        update ? (
          <span className="pm-num" style={{ fontSize: 11, color: 'var(--muted-2)' }}>
            {update.isoWeek}
          </span>
        ) : undefined
      }
    >
      {!update ? (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-2)' }}>
          No manager update has been published yet. Updates appear here after the weekly portfolio
          review runs.
        </p>
      ) : (
        <>
          <div className="flex flex-col">
            <DefRow label="Actions this week">
              {update.weeklyTrades.length === 0 ? 'None' : `${update.weeklyTrades.length}`}
            </DefRow>
            <DefRow label="Largest exposure">
              {update.topHoldings[0]
                ? `${update.topHoldings[0].ticker} ${fmtCurrency(update.topHoldings[0].marketValue)}`
                : <Nil />}
            </DefRow>
            <DefRow label="NAV as of">{update.navAsOf ?? <Nil />}</DefRow>
          </div>
          {update.weeklyTrades.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {update.weeklyTrades.map((trade, i) => (
                <div
                  key={`${trade.date}-${trade.ticker}-${i}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '58px 1fr auto',
                    gap: 10,
                    padding: '7px 0',
                    borderBottom: '1px solid var(--rule-row)',
                    fontSize: 12,
                  }}
                >
                  <span className="pm-num" style={{ fontSize: 11, color: 'var(--faint)' }}>
                    {trade.date}
                  </span>
                  <span>
                    {trade.side} {trade.ticker}
                  </span>
                  <span className="pm-num" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {fmtCurrency(trade.price)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </RailBlock>
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
    <Panel>
      <PanelHead title="Withdrawal preview" caption="Informational — nothing here moves money or sells anything" />
      <div style={{ padding: '14px 18px' }}>
        <p style={{ margin: '0 0 12px', maxWidth: 760, fontSize: 12, color: 'var(--ink-2)' }}>
          Shows the realised gain and suggested tax reserve a withdrawal would trigger. Record the
          actual withdrawal with the backend&apos;s <code>process-withdrawal.js</code> after the real
          sells are executed and the payout is decided.
        </p>
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="investor@example.com"
            aria-label="Investor email"
            className="pm-input"
            style={{ width: 230 }}
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder='Amount (or "full")'
            aria-label="Withdrawal amount"
            className="pm-input"
            style={{ width: 160 }}
          />
          <input
            value={sellFrom}
            onChange={(e) => setSellFrom(e.target.value)}
            placeholder="Sell from: AAPL:5, MSFT:2 (optional)"
            aria-label="Sell from"
            className="pm-input"
            style={{ width: 260 }}
          />
          <button
            type="button"
            onClick={runPreview}
            disabled={loading || !email || !amount}
            className="pm-btn-primary"
          >
            {loading ? 'Calculating…' : 'Preview'}
          </button>
        </div>
        {error && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--warn)' }}>{error}</p>
        )}
      </div>
      {result && (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(5,1fr)', borderTop: '1px solid var(--rule-soft)' }}
        >
          <Metric label="Requested" value={fmtCurrency(result.preview.requestedAmount)} />
          <Metric label="Cash available" value={fmtCurrency(result.preview.cashAvailable)} />
          <Metric
            label="Realised gain"
            value={fmtCurrency(result.preview.totalRealizedGain)}
            tone={result.preview.totalRealizedGain >= 0 ? 'pos' : undefined}
          />
          <Metric
            label={`Tax reserve (${(result.preview.taxReserveRatePct * 100).toFixed(1)}%)`}
            value={fmtCurrency(result.preview.taxReserve)}
          />
          <Metric
            label="Suggested net payout"
            value={fmtCurrency(result.preview.suggestedNetPayout)}
            sub={
              result.preview.shortfall > 0.01
                ? `Shortfall vs cash ${fmtCurrency(result.preview.shortfall)}`
                : undefined
            }
            tone={result.preview.shortfall > 0.01 ? 'warn' : undefined}
          />
        </div>
      )}
    </Panel>
  );
}
