import type { Lot } from "./sheets";

// Read-only TS mirror of portfolio-manager's lib/tax-lots.js consumeLotsFIFO.
// Used ONLY to preview the tax-reserve math in the dashboard — never writes
// anything. The actual commit (selling, recording the withdrawal) only ever
// happens via portfolio-manager's scripts/process-withdrawal.js --commit, run
// by Sam after he's executed any real sells. See lib/agentChat-style boundary:
// this dashboard never places trades or moves money.

function sortKey(lot: Lot): string {
  return lot.openDate === "legacy" ? "0000-00-00" : lot.openDate;
}

export interface SellSelection {
  ticker: string;
  shares: number;
  price: number;
}

export interface RealizedGainResult {
  ticker: string;
  shares: number;
  price: number;
  realizedGain: number;
}

/** Pure preview of FIFO realized gain for one sell — throws if there isn't enough open quantity. */
export function previewRealizedGain(lots: Lot[], ticker: string, sharesToSell: number, sellPrice: number): number {
  const candidates = lots
    .filter((lot) => lot.ticker === ticker && lot.status === "OPEN" && lot.sharesOpen > 0)
    .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));

  const available = candidates.reduce((sum, lot) => sum + lot.sharesOpen, 0);
  if (available + 1e-6 < sharesToSell) {
    throw new Error(`Only ${available.toFixed(4)} open shares of ${ticker} — cannot preview selling ${sharesToSell}.`);
  }

  let remaining = sharesToSell;
  let realizedGain = 0;
  for (const lot of candidates) {
    if (remaining <= 1e-9) break;
    const sharesFromLot = Math.min(lot.sharesOpen, remaining);
    realizedGain += sharesFromLot * (sellPrice - lot.costPerShare);
    remaining -= sharesFromLot;
  }
  return Math.round(realizedGain * 100) / 100;
}

export interface WithdrawalPreview {
  requestedAmount: number;
  cashAvailable: number;
  shortfall: number;
  sells: RealizedGainResult[];
  totalRealizedGain: number;
  taxReserveRatePct: number;
  taxReserve: number;
  suggestedNetPayout: number;
}

export function computeWithdrawalPreview(
  lots: Lot[],
  requestedAmount: number,
  cashAvailable: number,
  sellSelections: SellSelection[],
  taxReserveRatePct: number
): WithdrawalPreview {
  const shortfall = Math.max(0, requestedAmount - cashAvailable);
  const sells: RealizedGainResult[] = sellSelections.map((s) => ({
    ticker: s.ticker,
    shares: s.shares,
    price: s.price,
    realizedGain: previewRealizedGain(lots, s.ticker, s.shares, s.price),
  }));
  const totalRealizedGain = Math.round(sells.reduce((sum, s) => sum + s.realizedGain, 0) * 100) / 100;
  const taxReserve = Math.round(Math.max(0, totalRealizedGain) * taxReserveRatePct * 100) / 100;
  return {
    requestedAmount,
    cashAvailable,
    shortfall,
    sells,
    totalRealizedGain,
    taxReserveRatePct,
    taxReserve,
    suggestedNetPayout: Math.round((requestedAmount - taxReserve) * 100) / 100,
  };
}
