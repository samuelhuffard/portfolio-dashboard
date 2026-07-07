import { google, sheets_v4 } from "googleapis";
import { investorLedgerRow, type SignedLedgerEntry } from "./investor-ledger";
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

/** "agent-1" -> "Agent-1" — the single internal tab each agent reads/writes for its own history. Mirrors portfolio-manager's lib/sheets.js agentTabName. */
export function agentTabName(agentId: string): string {
  return agentId.replace(/^agent-/, "Agent-");
}

/** One shared spreadsheet for the whole portfolio — same Redis key portfolio-manager's getCachedSharedSpreadsheetId writes. */
export async function getSharedSpreadsheetId(): Promise<string> {
  const redis = getRedis();
  const id = redis ? await redis.get<string>("pm:shared:spreadsheet-id") : null;
  if (!id) {
    throw new Error("The shared portfolio spreadsheet isn't configured yet — run portfolio-manager's holdings-sync once.");
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

    const label = String(ticker).trim();

    // The backend appends a metadata row after holdings — either ["Last synced", ts]
    // or a single "Last synced: <ts>" cell. Never let it render as a holding.
    if (label.toLowerCase().startsWith("last synced")) {
      const inline = label.replace(/^last synced:?\s*/i, "").trim();
      lastSynced = inline || (name ? String(name) : null);
      continue;
    }

    // Sample/preview placeholder rows (see portfolio-manager lib/sheets.js).
    if (label.startsWith("⚠️")) continue;

    if (label === "Cash") {
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

export interface HoldingDetail {
  ticker: string;
  shares: number;
  currentPrice: number | null;
  marketValue: number | null;
}

/** Ticker, shares held, and current price for current holdings — for withdrawal preview sell-down lookups. */
export async function readHoldingsDetail(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<HoldingDetail[]> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Holdings!A2:F" });
  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0] && row[0] !== "Cash" && !String(row[0]).startsWith("Last synced") && !String(row[0]).startsWith("⚠️"))
    .map((row) => ({
      ticker: row[0],
      shares: parseNum(row[2]) ?? 0,
      currentPrice: parseNum(row[4]),
      marketValue: parseNum(row[5]),
    }));
}

/** Current idle cash balance from the Holdings tab's Cash row — for withdrawal funding previews. */
export async function readCashBalance(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<number> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Holdings!A2:F" });
  const rows = res.data.values ?? [];
  const cashRow = rows.find((row) => row[0] === "Cash");
  return cashRow ? parseNum(cashRow[5]) ?? 0 : 0;
}

export interface MarketScanRow {
  syncedAt: string;
  scanName: string;
  ticker: string;
  name: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  avgVolume: number | null;
  marketCap: number | null;
  signal: string;
  score: number | null;
  agentHint: string;
  notes: string;
}

export async function readMarketScans(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  limit = 250,
): Promise<MarketScanRow[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Market Scans!A2:M${limit + 1}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[2])
    .map((row) => ({
      syncedAt: row[0] ?? "",
      scanName: row[1] ?? "",
      ticker: row[2] ?? "",
      name: row[3] ?? "",
      price: parseNum(row[4]),
      changePct: parseNum(row[5]),
      volume: parseNum(row[6]),
      avgVolume: parseNum(row[7]),
      marketCap: parseNum(row[8]),
      signal: row[9] ?? "",
      score: parseNum(row[10]),
      agentHint: row[11] ?? "",
      notes: row[12] ?? "",
    }));
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
  agentId: string;
  date: string;
  ticker: string;
  action: string;
  quantScore: number | null;
  rationale: string;
  newsLinks: string;
  status: string;
}

const AGENT_REC_DATA_START_ROW = 13; // matches portfolio-manager's lib/sheets.js REC_DATA_START_ROW

export async function readRecommendations(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  agentId: string
): Promise<Recommendation[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${agentTabName(agentId)}!A${AGENT_REC_DATA_START_ROW}:G`,
  });

  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      agentId,
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
  spreadsheetId: string,
  agentId: string
): Promise<string> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${agentTabName(agentId)}!A3`,
  });
  return res.data.values?.[0]?.[0] ?? "";
}

export async function writeStrategyNotes(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  agentId: string,
  notes: string
): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${agentTabName(agentId)}!A3`,
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
  investorId: string | null;
  entryId: string | null;
  rowHmac: string | null;
}

/** Full capital ledger for one agent — every contribution/withdrawal ever recorded via record-contribution.js. */
export async function readInvestorLedger(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<InvestorLedgerEntry[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Investors!A2:J",
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
      investorId: row[7] ?? null,
      entryId: row[8] ?? null,
      rowHmac: row[9] ?? null,
    }));
}

/**
 * Append one signed row to the append-only Investors capital ledger.
 * Column layout (A:J) mirrors portfolio-manager/lib/sheets.js
 * appendInvestorLedgerEntry / INVESTOR_HEADERS exactly:
 * Date, Investor Email, Investor Name, Type, Amount ($), NAV per Unit,
 * Units, Investor ID, Entry ID, Row HMAC.
 * The backend created the tab + headers; the dashboard only ever appends.
 */
export async function appendInvestorLedgerEntry(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  entry: SignedLedgerEntry
): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Investors!A1",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [investorLedgerRow(entry)] },
  });
}

export interface TradeLedgerEntry {
  date: string;
  ticker: string;
  side: string;
  shares: number;
  price: number;
  amount: number;
  orderId: string | null;
  agentId: string;
  proposalId: string | null;
  realizedGain: number | null;
}

export async function readTradeLedger(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<TradeLedgerEntry[]> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Trade Ledger!A2:J" });
  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      date: row[0],
      ticker: row[1] ?? "",
      side: row[2] ?? "",
      shares: parseNum(row[3]) ?? 0,
      price: parseNum(row[4]) ?? 0,
      amount: parseNum(row[5]) ?? 0,
      orderId: row[6] || null,
      agentId: row[7] || "unattributed",
      proposalId: row[8] || null,
      realizedGain: parseNum(row[9]),
    }));
}

export interface Lot {
  lotId: string;
  ticker: string;
  openDate: string;
  agentId: string;
  costPerShare: number;
  sharesOriginal: number;
  sharesOpen: number;
  status: string;
}

export async function readLots(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<Lot[]> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Lots!A2:H" });
  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      lotId: row[0],
      ticker: row[1] ?? "",
      openDate: row[2] ?? "",
      agentId: row[3] || "unattributed",
      costPerShare: parseNum(row[4]) ?? 0,
      sharesOriginal: parseNum(row[5]) ?? 0,
      sharesOpen: parseNum(row[6]) ?? 0,
      status: row[7] || "OPEN",
    }));
}

export interface TrackRecordRow {
  horizon: string;
  evaluated: number | null;
  hitRatePct: number | null;
  avgReturnPct: number | null;
  avgAlphaPct: number | null;
}

/** Aggregate hit-rate stats per horizon, written by portfolio-manager's performance-review job into one agent's tab. Rows 7-9 are the 30/90/180-day data rows (see portfolio-manager's seedAgentTabLayout). */
export async function readTrackRecord(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  agentId: string
): Promise<TrackRecordRow[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${agentTabName(agentId)}!A7:E9`,
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
