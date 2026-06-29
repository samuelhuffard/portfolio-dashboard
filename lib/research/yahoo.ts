import YahooFinance from "yahoo-finance2";
import type { QuoteSummaryModules } from "yahoo-finance2/modules/quoteSummary";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";

const INDICES = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^DJI", label: "Dow" },
  { symbol: "^VIX", label: "VIX" },
];

export interface MarketSnapshot {
  asOf: string;
  indices: { label: string; price: number; changePct: number }[];
  quotes: { ticker: string; price: number; changePct: number }[];
}

export async function fetchMarketSnapshot(tickers: string[]): Promise<MarketSnapshot> {
  const yf = new YahooFinance();
  const allSymbols = [...INDICES.map((i) => i.symbol), ...tickers.map((t) => t.toUpperCase())];

  const results = await Promise.allSettled(
    allSymbols.map((sym) => yf.quote(sym))
  );

  const get = (sym: string) => {
    const idx = allSymbols.indexOf(sym);
    const r = results[idx];
    if (r?.status !== "fulfilled" || !r.value) return null;
    const q = r.value;
    const price = q.regularMarketPrice ?? null;
    const changePct = q.regularMarketChangePercent ?? null;
    if (price == null || changePct == null) return null;
    return { price, changePct };
  };

  const indices = INDICES.flatMap(({ symbol, label }) => {
    const d = get(symbol);
    return d ? [{ label, price: d.price, changePct: d.changePct }] : [];
  });

  const quotes = tickers.flatMap((t) => {
    const sym = t.toUpperCase();
    const d = get(sym);
    return d ? [{ ticker: sym, price: d.price, changePct: d.changePct }] : [];
  });

  return { asOf: new Date().toISOString(), indices, quotes };
}

const yahooFinance = new YahooFinance();

const QUOTE_SUMMARY_MODULES: QuoteSummaryModules[] = [
  "price",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "assetProfile",
];

export interface RawCompanyData {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  raw?: QuoteSummaryResult;
  error?: string;
}

export async function fetchCompaniesData(tickers: string[]): Promise<RawCompanyData[]> {
  return Promise.all(tickers.map((ticker) => fetchCompanyData(ticker)));
}

export async function fetchCompanyData(ticker: string): Promise<RawCompanyData> {
  const symbol = ticker.trim().toUpperCase();
  try {
    const raw = await yahooFinance.quoteSummary(symbol, {
      modules: QUOTE_SUMMARY_MODULES,
    });
    const name = raw.price?.longName || raw.price?.shortName || symbol;
    return {
      ticker: symbol,
      name,
      sector: raw.assetProfile?.sector,
      industry: raw.assetProfile?.industry,
      raw,
    };
  } catch (err) {
    return {
      ticker: symbol,
      name: symbol,
      error: err instanceof Error ? err.message : "Failed to fetch data",
    };
  }
}
