'use client';

import { useMemo, useState } from 'react';
import {
  AllocationBar,
  DefRow,
  Footnote,
  Hatch,
  Nil,
  Panel,
  PanelHead,
  RailBlock,
  ScreenGrid,
  Segmented,
} from '@/components/chrome';
import { REFRESH_INTERVAL_MS, usePortfolio } from '@/components/PortfolioProvider';
import { fmtCurrency, fmtNumber, fmtPercent, gainLossColor } from '@/lib/format';

const CLASS_FILTERS = ['All', 'Equities', 'Cash'] as const;
type ClassFilter = (typeof CLASS_FILTERS)[number];

export default function PositionsPage() {
  const { data, error, loading } = usePortfolio();
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState<ClassFilter>('All');

  const holdings = useMemo(() => data?.holdings ?? [], [data]);
  const cash = data?.cash ?? null;

  const holdingsValue = holdings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);
  const totalPortfolio = holdingsValue + (cash ?? 0);
  const pctOfPortfolio = (value: number | null) =>
    value === null || totalPortfolio <= 0 ? null : (value / totalPortfolio) * 100;

  const needle = query.trim().toUpperCase();
  const visibleHoldings = useMemo(
    () =>
      classFilter === 'Cash'
        ? []
        : holdings.filter(
            (h) =>
              needle === '' ||
              h.ticker.toUpperCase().includes(needle) ||
              h.name.toUpperCase().includes(needle),
          ),
    [holdings, needle, classFilter],
  );
  const showCash =
    cash !== null && classFilter !== 'Equities' && (needle === '' || 'CASH'.includes(needle));

  const lineCount = visibleHoldings.length + (showCash ? 1 : 0);
  const largest = [...holdings]
    .filter((h) => h.marketValue !== null)
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))[0];
  const largestWeight = largest ? pctOfPortfolio(largest.marketValue) : null;

  return (
    <ScreenGrid
      main={
        <>
          <Panel>
            <div className="flex items-center justify-between" style={{ padding: '9px 18px' }}>
              <div className="flex items-center" style={{ gap: 10 }}>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter instrument"
                  aria-label="Filter instrument"
                  className="pm-input"
                  style={{ width: 180 }}
                />
                <Segmented
                  label="Asset class"
                  options={CLASS_FILTERS}
                  value={classFilter}
                  onChange={setClassFilter}
                />
              </div>
              <span className="pm-caption">
                {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                {data?.lastSynced ? ` · priced at ${data.lastSynced}` : ''}
              </span>
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Position blotter" caption="Sheet-backed holdings record" />
            {error ? (
              <Hatch
                title="Holdings feed is offline"
                note="The blotter shows only settled, verified lines. Nothing is estimated while the feed is down."
              />
            ) : (
              <table className="pm-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Name</th>
                    <th className="pm-num-cell">Shares</th>
                    <th className="pm-num-cell">Initial price</th>
                    <th className="pm-num-cell">Price</th>
                    <th className="pm-num-cell">Market value</th>
                    <th className="pm-num-cell">% of portfolio</th>
                    <th className="pm-num-cell">Gain / loss</th>
                    <th className="pm-num-cell">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '26px 18px', textAlign: 'center' }}>
                        <Nil />
                      </td>
                    </tr>
                  ) : lineCount === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="pm-prose-cell"
                        style={{
                          padding: '26px 18px',
                          textAlign: 'center',
                          fontSize: 12,
                          color: 'var(--muted-2)',
                        }}
                      >
                        {holdings.length === 0 && cash === null
                          ? 'No positions on the verified record. Holdings appear once a trade settles.'
                          : 'No lines match this filter.'}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {visibleHoldings.map((h) => {
                        const weight = pctOfPortfolio(h.marketValue);
                        return (
                          <tr key={h.ticker}>
                            <td style={{ fontWeight: 500 }}>{h.ticker}</td>
                            <td className="pm-prose-cell" style={{ color: 'var(--muted)' }}>
                              {h.name}
                            </td>
                            <td className="pm-num-cell">{fmtNumber(h.shares, 4)}</td>
                            <td className="pm-num-cell">
                              {h.avgCost === null ? <Nil /> : fmtCurrency(h.avgCost)}
                            </td>
                            <td className="pm-num-cell">
                              {h.currentPrice === null ? <Nil /> : fmtCurrency(h.currentPrice)}
                            </td>
                            <td className="pm-num-cell">
                              {h.marketValue === null ? <Nil /> : fmtCurrency(h.marketValue)}
                            </td>
                            <td className="pm-num-cell">
                              {weight === null ? <Nil /> : `${weight.toFixed(1)}%`}
                            </td>
                            <td
                              className="pm-num-cell"
                              style={{
                                color: gainLossColor(h.gainLoss),
                              }}
                            >
                              {h.gainLoss === null ? <Nil /> : fmtCurrency(h.gainLoss)}
                            </td>
                            <td
                              className="pm-num-cell"
                              style={{
                                color: gainLossColor(h.gainLossPct),
                              }}
                            >
                              {h.gainLossPct === null ? <Nil /> : fmtPercent(h.gainLossPct)}
                            </td>
                          </tr>
                        );
                      })}
                      {showCash && (
                        <tr>
                          <td style={{ fontWeight: 500 }}>CASH</td>
                          <td className="pm-prose-cell" style={{ color: 'var(--muted)' }}>
                            Settled cash
                          </td>
                          <td className="pm-num-cell"><Nil /></td>
                          <td className="pm-num-cell"><Nil /></td>
                          <td className="pm-num-cell"><Nil /></td>
                          <td className="pm-num-cell">{fmtCurrency(cash)}</td>
                          <td className="pm-num-cell">
                            {pctOfPortfolio(cash) === null
                              ? <Nil />
                              : `${(pctOfPortfolio(cash) as number).toFixed(1)}%`}
                          </td>
                          <td className="pm-num-cell"><Nil /></td>
                          <td className="pm-num-cell"><Nil /></td>
                        </tr>
                      )}
                      {/* The total always reconciles to the whole portfolio, not
                          to the filtered view, so it matches the Command page. */}
                      {classFilter === 'All' && needle === '' && data && (
                        <tr className="pm-total-row">
                          <td className="pm-prose-cell" style={{ fontWeight: 600 }}>Total</td>
                          <td />
                          <td />
                          <td />
                          <td />
                          <td className="pm-num-cell">{fmtCurrency(totalPortfolio)}</td>
                          <td className="pm-num-cell">100.0%</td>
                          <td
                            className="pm-num-cell"
                            style={{
                              color: gainLossColor(data.totals.totalGainLoss),
                            }}
                          >
                            {fmtCurrency(data.totals.totalGainLoss)}
                          </td>
                          <td
                            className="pm-num-cell"
                            style={{
                              color: gainLossColor(data.totals.totalGainLossPct),
                            }}
                          >
                            {fmtPercent(data.totals.totalGainLossPct)}
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel>
            <PanelHead title="Tax lots" caption="Acquisition-level detail" />
            <p
              style={{
                margin: 0,
                padding: '18px',
                fontSize: 11.5,
                color: 'var(--muted-2)',
              }}
            >
              The sheet-backed record stores one aggregated line per instrument, so individual lots,
              acquisition dates and holding periods are not available to report here.
            </p>
          </Panel>
        </>
      }
      rail={
        <>
          <RailBlock title="Pricing and source">
            <div className="flex flex-col">
              <DefRow label="Quote source">Yahoo · delayed</DefRow>
              <DefRow label="Holdings source">Google Sheet</DefRow>
              <DefRow label="Last sync">{data?.lastSynced ?? <Nil />}</DefRow>
              <DefRow label="Refresh interval">{`${Math.round(REFRESH_INTERVAL_MS / 60000)} min`}</DefRow>
            </div>
          </RailBlock>

          <RailBlock title="Concentration">
            <AllocationBar
              investedPct={totalPortfolio > 0 ? (holdingsValue / totalPortfolio) * 100 : null}
            />
            <div className="flex flex-col">
              <DefRow label="Largest position">
                {largest && largestWeight !== null ? (
                  `${largest.ticker} ${largestWeight.toFixed(1)}%`
                ) : (
                  <Nil />
                )}
              </DefRow>
              <DefRow label="Positions held">{fmtNumber(holdings.length, 0)}</DefRow>
              {/* Position limits live in the research backend's mandate files. */}
              <DefRow label="Limit"><Nil /></DefRow>
            </div>
          </RailBlock>

          <RailBlock title="Working orders" grow>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-2)' }}>
              No orders are working. The dashboard never places an order itself; approved tickets are
              executed by the broker companion and appear here once they settle.
            </p>
          </RailBlock>

          <Footnote label="Note">
            Percentages are of total portfolio value including cash, so weights on this page
            reconcile with the Command page.
          </Footnote>
        </>
      }
    />
  );
}
