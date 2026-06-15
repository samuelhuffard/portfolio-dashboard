import type { MetricDefinition } from "@/lib/research/types";

/** Metric registry — add new entries here as the metric set is refined. */
export const METRIC_REGISTRY: MetricDefinition[] = [
  // Market
  {
    id: "currentPrice",
    label: "Current Price",
    category: "Market",
    format: "currency",
    description: "The price one share costs right now.",
    get: (raw) => raw.financialData?.currentPrice ?? raw.price?.regularMarketPrice,
  },
  {
    id: "marketCap",
    label: "Market Cap",
    category: "Market",
    format: "largeNumber",
    description: "Total value of all the company's shares combined — a measure of its overall size.",
    get: (raw) => raw.summaryDetail?.marketCap,
  },
  {
    id: "fiftyTwoWeekLow",
    label: "52-Week Low",
    category: "Market",
    format: "currency",
    description: "The lowest price the stock has traded at over the past year.",
    get: (raw) => raw.summaryDetail?.fiftyTwoWeekLow,
  },
  {
    id: "fiftyTwoWeekHigh",
    label: "52-Week High",
    category: "Market",
    format: "currency",
    description: "The highest price the stock has traded at over the past year.",
    get: (raw) => raw.summaryDetail?.fiftyTwoWeekHigh,
  },
  {
    id: "beta",
    label: "Beta",
    category: "Market",
    format: "ratio",
    description:
      "How much the stock tends to move compared to the overall market. Above 1 means more swings than the market; below 1 means steadier.",
    get: (raw) => raw.summaryDetail?.beta,
  },

  // Valuation
  {
    id: "trailingPE",
    label: "P/E (TTM)",
    category: "Valuation",
    format: "ratio",
    description:
      "How many dollars investors are paying for every $1 of the company's profit from the past year. Lower can mean cheaper, but compare against similar companies.",
    get: (raw) => raw.summaryDetail?.trailingPE,
  },
  {
    id: "forwardPE",
    label: "Forward P/E",
    category: "Valuation",
    format: "ratio",
    description: "Like P/E, but based on next year's expected profit instead of last year's actual profit.",
    get: (raw) => raw.summaryDetail?.forwardPE,
  },
  {
    id: "priceToBook",
    label: "Price/Book",
    category: "Valuation",
    format: "ratio",
    description:
      "Compares the stock price to the company's net worth on paper (assets minus debts). Below 1 can suggest the stock is cheap relative to what the company owns.",
    get: (raw) => raw.defaultKeyStatistics?.priceToBook,
  },
  {
    id: "priceToSales",
    label: "Price/Sales (TTM)",
    category: "Valuation",
    format: "ratio",
    description: "How many dollars investors pay for every $1 of the company's sales over the past year.",
    get: (raw) => raw.summaryDetail?.priceToSalesTrailing12Months,
  },
  {
    id: "enterpriseToEbitda",
    label: "EV/EBITDA",
    category: "Valuation",
    format: "ratio",
    description:
      "Compares the company's total value (including its debt) to its core operating profit — a common way to compare companies even if they're financed differently.",
    get: (raw) => raw.defaultKeyStatistics?.enterpriseToEbitda,
  },
  {
    id: "pegRatio",
    label: "PEG Ratio",
    category: "Valuation",
    format: "ratio",
    description:
      "The P/E ratio adjusted for expected growth. Around 1 is often seen as fairly priced; well above 1 can mean the stock is expensive relative to its growth.",
    get: (raw) => raw.defaultKeyStatistics?.pegRatio,
  },

  // Profitability
  {
    id: "grossMargins",
    label: "Gross Margin",
    category: "Profitability",
    format: "percent",
    description:
      "The share of each sales dollar left after covering the direct cost of making the product. Higher means more cushion.",
    get: (raw) => raw.financialData?.grossMargins,
  },
  {
    id: "operatingMargins",
    label: "Operating Margin",
    category: "Profitability",
    format: "percent",
    description: "The share of each sales dollar left after covering normal day-to-day operating costs.",
    get: (raw) => raw.financialData?.operatingMargins,
  },
  {
    id: "profitMargins",
    label: "Profit Margin",
    category: "Profitability",
    format: "percent",
    description: "The share of each sales dollar that ends up as profit after all expenses.",
    get: (raw) => raw.financialData?.profitMargins,
  },
  {
    id: "returnOnEquity",
    label: "Return on Equity",
    category: "Profitability",
    format: "percent",
    description:
      "How much profit the company generates for every dollar shareholders have invested. Higher generally means it's using investors' money efficiently.",
    get: (raw) => raw.financialData?.returnOnEquity,
  },
  {
    id: "returnOnAssets",
    label: "Return on Assets",
    category: "Profitability",
    format: "percent",
    description:
      "How much profit the company generates for every dollar of assets (equipment, cash, etc.) it owns. Higher means it's using its resources efficiently.",
    get: (raw) => raw.financialData?.returnOnAssets,
  },

  // Growth
  {
    id: "revenueGrowth",
    label: "Revenue Growth (YoY)",
    category: "Growth",
    format: "percent",
    description: "How much the company's total sales have grown compared to a year ago.",
    get: (raw) => raw.financialData?.revenueGrowth,
  },
  {
    id: "earningsGrowth",
    label: "Earnings Growth (YoY)",
    category: "Growth",
    format: "percent",
    description: "How much the company's profit has grown compared to a year ago.",
    get: (raw) => raw.financialData?.earningsGrowth,
  },

  // Financial Health
  {
    id: "debtToEquity",
    label: "Debt/Equity (%)",
    category: "Financial Health",
    format: "number",
    description:
      "How much debt the company has relative to what shareholders own. Higher numbers mean the company relies more on borrowed money.",
    get: (raw) => raw.financialData?.debtToEquity,
  },
  {
    id: "currentRatio",
    label: "Current Ratio",
    category: "Financial Health",
    format: "ratio",
    description:
      "Whether the company has enough cash and short-term assets to cover its bills due within a year. Above 1 generally means yes.",
    get: (raw) => raw.financialData?.currentRatio,
  },
  {
    id: "totalCash",
    label: "Total Cash",
    category: "Financial Health",
    format: "largeNumber",
    description: "How much cash and easily-sold investments the company has on hand.",
    get: (raw) => raw.financialData?.totalCash,
  },
  {
    id: "totalDebt",
    label: "Total Debt",
    category: "Financial Health",
    format: "largeNumber",
    description: "The total amount of money the company owes.",
    get: (raw) => raw.financialData?.totalDebt,
  },

  // Per Share & Income
  {
    id: "trailingEps",
    label: "EPS (TTM)",
    category: "Per Share & Income",
    format: "currency",
    description: "The company's profit per share over the past year — a building block of the P/E ratio.",
    get: (raw) => raw.defaultKeyStatistics?.trailingEps,
  },
  {
    id: "forwardEps",
    label: "Forward EPS",
    category: "Per Share & Income",
    format: "currency",
    description: "The company's expected profit per share over the next year.",
    get: (raw) => raw.defaultKeyStatistics?.forwardEps,
  },
  {
    id: "dividendYield",
    label: "Dividend Yield",
    category: "Per Share & Income",
    format: "percent",
    description:
      "The yearly cash payment to shareholders, shown as a percentage of the stock price. Zero means the company doesn't pay a dividend.",
    get: (raw) => raw.summaryDetail?.dividendYield,
  },
  {
    id: "freeCashflow",
    label: "Free Cash Flow",
    category: "Per Share & Income",
    format: "largeNumber",
    description:
      "The cash left over after the company pays for its operations and equipment — money it could use for dividends, buybacks, or paying down debt.",
    get: (raw) => raw.financialData?.freeCashflow,
  },
];

/** Ordered list of category names, derived from the registry's declaration order. */
export const METRIC_CATEGORIES: string[] = Array.from(
  new Set(METRIC_REGISTRY.map((m) => m.category))
);
