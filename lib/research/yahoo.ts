import YahooFinance from "yahoo-finance2";
import type { QuoteSummaryModules } from "yahoo-finance2/modules/quoteSummary";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";

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
