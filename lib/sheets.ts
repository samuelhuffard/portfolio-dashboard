import { google, sheets_v4 } from "googleapis";
import { getRedis } from "./redis";

export async function getServiceAccountClients(): Promise<sheets_v4.Sheets> {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];

  let auth;
  const inlineCreds = process.env.GOOGLE_SERVICE_ACCOUNT?.trim();
  if (inlineCreds) {
    const credentials = JSON.parse(Buffer.from(inlineCreds, "base64").toString("utf8"));
    auth = new google.auth.GoogleAuth({ credentials, scopes });
  } else {
    const keyFile = process.env.GOOGLE_CREDENTIALS_PATH?.trim();
    if (!keyFile) {
      throw new Error("Missing GOOGLE_SERVICE_ACCOUNT or GOOGLE_CREDENTIALS_PATH env var");
    }
    auth = new google.auth.GoogleAuth({ keyFile, scopes });
  }

  return google.sheets({ version: "v4", auth });
}

export async function getSpreadsheetId(): Promise<string> {
  const redis = getRedis();
  const id = redis ? await redis.get<string>("pm:spreadsheet-id") : null;
  if (!id) {
    throw new Error(
      "Portfolio spreadsheet not found yet — run portfolio-manager's holdings-sync or research-scan first."
    );
  }
  return id;
}

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number | null;
  currentPrice: number | null;
  marketValue: number | null;
  costBasis: number | null;
  gainLoss: number | null;
  gainLossPct: number | null;
}

export interface HoldingsResult {
  holdings: Holding[];
  cash: number | null;
  lastSynced: string | null;
}

function parseNum(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function readHoldings(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<HoldingsResult> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Holdings!A2:I100",
  });

  const rows = res.data.values ?? [];
  const holdings: Holding[] = [];
  let cash: number | null = null;
  let lastSynced: string | null = null;

  for (const row of rows) {
    const [ticker, name, shares, avgCost, currentPrice, marketValue, costBasis, gainLoss, gainLossPct] = row;
    if (!ticker) continue;

    if (ticker === "Last synced") {
      lastSynced = name ?? null;
      continue;
    }

    if (ticker === "Cash") {
      cash = parseNum(marketValue ?? shares);
      continue;
    }

    holdings.push({
      ticker,
      name: name ?? "",
      shares: parseNum(shares) ?? 0,
      avgCost: parseNum(avgCost),
      currentPrice: parseNum(currentPrice),
      marketValue: parseNum(marketValue),
      costBasis: parseNum(costBasis),
      gainLoss: parseNum(gainLoss),
      gainLossPct: parseNum(gainLossPct),
    });
  }

  return { holdings, cash, lastSynced };
}

export interface PerformanceRow {
  date: string;
  portfolioValue: number | null;
  spyPrice: number | null;
}

export async function readPerformance(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<PerformanceRow[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Performance!A2:C",
  });

  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      date: row[0],
      portfolioValue: parseNum(row[1]),
      spyPrice: parseNum(row[2]),
    }));
}

export interface Recommendation {
  date: string;
  ticker: string;
  action: string;
  quantScore: number | null;
  rationale: string;
  newsLinks: string;
  status: string;
}

export async function readRecommendations(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<Recommendation[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Recommendations!A2:G",
  });

  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      date: row[0],
      ticker: row[1] ?? "",
      action: row[2] ?? "",
      quantScore: parseNum(row[3]),
      rationale: row[4] ?? "",
      newsLinks: row[5] ?? "",
      status: row[6] ?? "",
    }));
}

export async function readStrategyNotes(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<string> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Strategy!A2",
  });
  return res.data.values?.[0]?.[0] ?? "";
}

export async function writeStrategyNotes(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  notes: string
): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Strategy!A2",
    valueInputOption: "RAW",
    requestBody: { values: [[notes]] },
  });
}
