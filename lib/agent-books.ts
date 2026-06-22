import type { Lot, TradeLedgerEntry } from "./sheets";

export interface AgentPosition {
  ticker: string;
  sharesOpen: number;
  costBasis: number;
  marketValue: number | null;
  unrealizedGain: number | null;
}

export interface AgentBook {
  agentId: string;
  positions: AgentPosition[];
  unrealizedGain: number;
  realizedGain: number;
  totalGain: number;
  closedTradeCount: number;
  winRatePct: number | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes one agent's attributed book against the shared portfolio — mirrors
 * portfolio-manager's lib/agent-books.js computeAgentBook exactly. Pure function;
 * caller supplies already-fetched `lots`/`trades` and a ticker -> price map.
 */
export function computeAgentBook(agentId: string, lots: Lot[], trades: TradeLedgerEntry[], currentPrices: Record<string, number | null>): AgentBook {
  const openLots = lots.filter((lot) => lot.agentId === agentId && lot.status === "OPEN" && lot.sharesOpen > 0);

  const byTicker = new Map<string, { ticker: string; sharesOpen: number; costBasis: number }>();
  for (const lot of openLots) {
    const existing = byTicker.get(lot.ticker) ?? { ticker: lot.ticker, sharesOpen: 0, costBasis: 0 };
    existing.sharesOpen += lot.sharesOpen;
    existing.costBasis += lot.sharesOpen * lot.costPerShare;
    byTicker.set(lot.ticker, existing);
  }

  const positions: AgentPosition[] = [...byTicker.values()].map((p) => {
    const price = currentPrices[p.ticker] ?? null;
    const marketValue = price != null ? price * p.sharesOpen : null;
    const unrealizedGain = marketValue != null ? marketValue - p.costBasis : null;
    return {
      ticker: p.ticker,
      sharesOpen: round2(p.sharesOpen),
      costBasis: round2(p.costBasis),
      marketValue: marketValue != null ? round2(marketValue) : null,
      unrealizedGain: unrealizedGain != null ? round2(unrealizedGain) : null,
    };
  });

  const closedTrades = trades.filter((t) => t.agentId === agentId && t.side === "SELL" && t.realizedGain != null);
  const realizedGain = round2(closedTrades.reduce((sum, t) => sum + (t.realizedGain ?? 0), 0));
  const wins = closedTrades.filter((t) => (t.realizedGain ?? 0) > 0).length;
  const winRatePct = closedTrades.length ? round2((wins / closedTrades.length) * 100) : null;
  const unrealizedGain = round2(positions.reduce((sum, p) => sum + (p.unrealizedGain ?? 0), 0));

  return {
    agentId,
    positions,
    unrealizedGain,
    realizedGain,
    totalGain: round2(unrealizedGain + realizedGain),
    closedTradeCount: closedTrades.length,
    winRatePct,
  };
}
