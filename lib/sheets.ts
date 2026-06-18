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

/** Defaults to agent-1 (the real, holdings-synced account) so existing call sites are unaffected. Pass an agentId for agent-2/agent-3. */
export async function getSpreadsheetId(agentId: string = "agent-1"): Promise<string> {
  const redis = getRedis();
  const id = redis ? await redis.get<string>(`pm:${agentId}:spreadsheet-id`) : null;
  if (!id) {
    throw new Error(
      `${agentId}'s spreadsheet isn't configured yet — set its SPREADSHEET_ID env var on the Jetson and run portfolio-manager's research-scan once.`
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
  unitsOutstanding: number | null;
  navPerUnit: number | null;
}

export async function readPerformance(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<PerformanceRow[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Performance!A2:E",
  });

  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      date: row[0],
      portfolioValue: parseNum(row[1]),
      spyPrice: parseNum(row[2]),
      unitsOutstanding: parseNum(row[3]),
      navPerUnit: parseNum(row[4]),
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

export interface InvestorLedgerEntry {
  date: string;
  email: string;
  name: string;
  type: string; // "Contribution" | "Withdrawal"
  amount: number;
  navPerUnit: number | null;
  units: number;
}

/** Full capital ledger for one agent — every contribution/withdrawal ever recorded via record-contribution.js. */
export async function readInvestorLedger(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<InvestorLedgerEntry[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Investors!A2:G",
  });
  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      date: row[0],
      email: row[1] ?? "",
      name: row[2] ?? "",
      type: row[3] ?? "",
      amount: parseNum(row[4]) ?? 0,
      navPerUnit: parseNum(row[5]),
      units: parseNum(row[6]) ?? 0,
    }));
}

export interface TrackRecordRow {
  horizon: string;
  evaluated: number | null;
  hitRatePct: number | null;
  avgReturnPct: number | null;
  avgAlphaPct: number | null;
}

/** Aggregate hit-rate stats per horizon, written by portfolio-manager's performance-review job. Rows 5-7 are the 30/90/180-day data rows (rows 1-4 are title/subtitle/blank/header). */
export async function readTrackRecord(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<TrackRecordRow[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Track Record!A5:E7",
  });
  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      horizon: row[0],
      evaluated: parseNum(row[1]),
      hitRatePct: parseNum(row[2]),
      avgReturnPct: parseNum(row[3]),
      avgAlphaPct: parseNum(row[4]),
    }));
}
