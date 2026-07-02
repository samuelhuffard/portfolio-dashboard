/**
 * Portfolio Dashboard — Mac Trade Executor Companion
 *
 * Polls Redis every 30s for ApprovedForBrokerReview proposals and executes
 * them via `claude -p` using the Robinhood MCP on this Mac.
 *
 * Run once to set up:
 *   pm2 start scripts/mac-companion.mjs --name portfolio-executor --interpreter node
 *
 * Requires:
 *   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in env or .env
 *   - Claude Code CLI authenticated with claude.ai (unset ANTHROPIC_API_KEY)
 *   - Robinhood MCP added and authorized in Claude Code CLI
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";

const execFileAsync = promisify(execFile);

// ── Env loading ────────────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const candidates = [
    join(__dir, "../.env.local"),
    join(__dir, "../.env"),
    join(__dir, "../../portfolio-manager/.env"),
  ];
  for (const f of candidates) {
    if (!existsSync(f)) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL?.trim();
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 min during market hours
const LOCK_TTL_SECONDS = 300; // 5 min — prevents double-execution if companion restarts mid-trade
const LIST_KEY = "pm:approval_proposals";
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "/Users/samhuffard/.local/bin/claude";
const ROBINHOOD_MCP_TOOLS = "mcp__robinhood-trading__*";
const MARKET_SYNC_DISALLOWED_TOOLS = [
  "mcp__robinhood-trading__place_equity_order",
  "mcp__robinhood-trading__place_option_order",
  "mcp__robinhood-trading__cancel_equity_order",
  "mcp__robinhood-trading__cancel_option_order",
  "mcp__robinhood-trading__review_equity_order",
  "mcp__robinhood-trading__review_option_order",
  "mcp__robinhood-trading__create_scan",
  "mcp__robinhood-trading__update_scan_filters",
  "mcp__robinhood-trading__update_scan_config",
  "mcp__robinhood-trading__create_watchlist",
  "mcp__robinhood-trading__rename_watchlist",
  "mcp__robinhood-trading__add_to_watchlist",
  "mcp__robinhood-trading__remove_from_watchlist",
].join(",");

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error("[companion] Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

// ── Redis helpers ──────────────────────────────────────────────────────────────
async function redisCmd(cmd, ...args) {
  const res = await fetch(`${REDIS_URL}/${cmd}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const json = await res.json();
  return json.result;
}

async function redisPost(body) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return json.result;
}

async function getProposal(id) {
  const raw = await redisCmd("get", `pm:approval_proposal:${id}`);
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
}

async function setProposalField(id, updates) {
  const proposal = await getProposal(id);
  if (!proposal) throw new Error(`Proposal ${id} not found`);
  const updated = { ...proposal, ...updates };
  await redisPost(["set", `pm:approval_proposal:${id}`, JSON.stringify(updated)]);
  return updated;
}

async function acquireLock(id) {
  // SET NX EX — returns "OK" if acquired, null if already locked
  const result = await redisPost(["set", `pm:exec_lock:${id}`, "1", "NX", "EX", LOCK_TTL_SECONDS]);
  return result === "OK";
}

async function releaseLock(id) {
  await redisCmd("del", `pm:exec_lock:${id}`);
}

// ── Approval signature verification ───────────────────────────────────────────
// Mirrors lib/proposals.ts computeDecisionSignature and
// portfolio-manager/lib/proposal-signature.js — keep the three in sync.
// Without this, anything that can write to Redis could forge an "approved"
// proposal and this process would trade real money on it.
function computeDecisionSignature(p, secret) {
  const payload = [
    p.id,
    p.status,
    p.agentId,
    p.ticker,
    p.side,
    String(p.amountDollars),
    p.maxPrice == null ? "" : String(p.maxPrice),
    p.decidedAt ?? "",
    p.decidedByUserId ?? "",
  ].join("|");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function verifyApprovalSignature(proposal) {
  const secret = process.env.AUDIT_HMAC_SECRET?.trim();
  if (!secret) {
    return { ok: false, reason: "AUDIT_HMAC_SECRET is not configured on this machine — cannot verify approvals" };
  }
  if (!proposal.decisionHmac) {
    return { ok: false, reason: "proposal has no decision signature (not approved through the dashboard)" };
  }
  const expected = Buffer.from(computeDecisionSignature(proposal, secret), "hex");
  const provided = Buffer.from(String(proposal.decisionHmac), "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "decision signature is INVALID (fields modified after approval, or forged)" };
  }
  return { ok: true };
}

// ── Telegram alerts ────────────────────────────────────────────────────────────
// Execution problems must page Sam, not just sit in PM2 logs.
async function alertTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  console.error(`[companion] ALERT: ${message}`);
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `🚨 Portfolio executor: ${message}` }),
    });
  } catch (err) {
    console.error("[companion] Telegram alert failed:", err.message);
  }
}

function extractJsonObject(stdout, predicate) {
  const starts = [];
  for (let i = 0; i < stdout.length; i++) {
    if (stdout[i] === "{") starts.push(i);
  }
  for (const start of starts.reverse()) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < stdout.length; i++) {
      const ch = stdout[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === "\"") inString = false;
        continue;
      }
      if (ch === "\"") inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(stdout.slice(start, i + 1));
            if (!predicate || predicate(parsed)) return { parsed, text: stdout.slice(start, i + 1) };
          } catch {}
          break;
        }
      }
    }
  }
  return null;
}

// ── Claude executor ────────────────────────────────────────────────────────────
async function executeViaClaude(proposal) {
  const { id, ticker, side, amountDollars, maxPrice } = proposal;
  const isSell = side.toUpperCase() === "SELL";

  let orderInstructions;
  if (isSell) {
    // SELL: dollar-notional market order, hard-capped by the actual position.
    // maxPrice is a BUY-side concept — never use it to derive SELL share counts.
    orderInstructions = `MARKET ORDER — sell $${amountDollars} notional of ${ticker} using dollar-amount fractional sizing.
First check current positions: if the ${ticker} position's market value is LESS than $${amountDollars}, sell the entire remaining position (by share quantity) instead of the dollar amount. Never sell more than currently held. If there is no ${ticker} position at all, place NO order and report failure.`;
  } else {
    const wholeShares = maxPrice ? Math.floor(amountDollars / maxPrice) : 0;
    if (maxPrice && wholeShares < 1) {
      console.warn(`[companion] ${id} limit order impossible: floor(${amountDollars}/${maxPrice})=0 shares — routing to market order instead`);
    }
    const useLimit = maxPrice && wholeShares >= 1;
    orderInstructions = useLimit
      ? `LIMIT ORDER — buy ${wholeShares} whole shares of ${ticker} at limit price $${maxPrice}. Use whole share quantity, NOT dollar amount.`
      : `MARKET ORDER — buy $${amountDollars} notional of ${ticker} using dollar-amount fractional sizing.`;
  }

  const prompt = `Use the Robinhood MCP to place the following trade on my Agentic account (the one enabled for agentic trading, not margin or IRA):

Ticker: ${ticker}
Side: ${side.toUpperCase()}
${orderInstructions}

IDEMPOTENCY — CRITICAL: pass ref_id "${id}" (exactly this UUID) to place_equity_order. If you retry after a transient failure, re-send the SAME ref_id so the broker deduplicates.

IMPORTANT: Place the order now — skip the review step, do not ask for confirmation. After placing, respond with ONLY this JSON (no other text):
{"ok": true, "orderId": "...", "shares": 0.0, "price": 0.00, "message": "brief status"}

Use the actual average fill price for "price". On failure respond with ONLY:
{"ok": false, "error": "reason"}`;

  // Strip ANTHROPIC_API_KEY so claude uses claude.ai login (which has Robinhood auth)
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  const { stdout, stderr } = await execFileAsync(
    CLAUDE_BIN,
    ["-p", "--allowedTools", "mcp__robinhood-trading__*", "--permission-mode", "bypassPermissions", prompt],
    { env, timeout: 120_000 }
  );

  if (stderr) console.warn(`[companion] claude stderr:`, stderr.trim());

  // Claude's -p output contains tool call JSON + final text. Find the last
  // standalone JSON object that has an "ok" field (our response format).
  const candidates = [...stdout.matchAll(/\{[^{}]*"ok"[^{}]*\}/g)];
  for (const c of candidates.reverse()) {
    try { return JSON.parse(c[0]); } catch {}
  }
  // Fallback: last top-level JSON object
  const blocks = [...stdout.matchAll(/\{(?:[^{}]|\{[^{}]*\})*\}/g)];
  for (const b of blocks.reverse()) {
    try { const p = JSON.parse(b[0]); if ("ok" in p) return p; } catch {}
  }
  throw new Error(`No valid JSON in claude output: ${stdout.slice(0, 300)}`);
}

/**
 * Reconciles a proposal stuck in executionState "Executing" (we started an order
 * attempt but never confirmed the outcome — crash, timeout, sleep, or a failed
 * record step). Asks the broker what actually happened instead of re-executing.
 */
async function reconcileViaClaude(proposal) {
  const { id, ticker, executionStartedAt } = proposal;
  const sinceIso = new Date(new Date(executionStartedAt ?? Date.now()).getTime() - 10 * 60 * 1000).toISOString();

  const prompt = `Use the Robinhood MCP (read-only order tools) on my Agentic account. Do NOT place, cancel, or modify any order.

Call get_equity_orders with symbol ${ticker} and created_at_gte ${sinceIso}, and look for the order whose ref_id is "${id}". If ref_id is not visible in the response, treat the most recent agentic ${ticker} order created after ${sinceIso} as the candidate.

Respond with ONLY this JSON (no other text):
{"found": true, "orderId": "...", "state": "filled|new|queued|confirmed|partially_filled|cancelled|rejected|failed", "shares": 0.0, "price": 0.00}
or, if no matching order exists:
{"found": false}`;

  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  const { stdout } = await execFileAsync(
    CLAUDE_BIN,
    ["-p", "--allowedTools", ROBINHOOD_MCP_TOOLS, "--disallowedTools", MARKET_SYNC_DISALLOWED_TOOLS, "--permission-mode", "bypassPermissions", prompt],
    { env, timeout: 120_000 }
  );

  const extracted = extractJsonObject(stdout, (p) => typeof p.found === "boolean");
  if (!extracted) throw new Error(`No valid reconcile JSON in claude output: ${stdout.slice(0, 300)}`);
  return extracted.parsed;
}

// ── Market hours check ─────────────────────────────────────────────────────────
function isMarketOpen() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  // ET offset: UTC-5 (EST) or UTC-4 (EDT)
  // Approximate: use UTC-4 (EDT) for summer, UTC-5 (EST) for winter
  const jan = new Date(now.getUTCFullYear(), 0, 1);
  const jul = new Date(now.getUTCFullYear(), 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  const isDST = now.getTimezoneOffset() < stdOffset;
  const etOffset = isDST ? 4 : 5;

  const etHour = (now.getUTCHours() - etOffset + 24) % 24;
  const etMin = now.getUTCMinutes();
  const etMinutes = etHour * 60 + etMin;

  return etMinutes >= 9 * 60 + 30 && etMinutes < 16 * 60; // 9:30–16:00 ET
}

// ── Trade ledger + lots ────────────────────────────────────────────────────────
const RECORD_SCRIPT = join(__dir, "../../portfolio-manager/scripts/record-trade.js");

async function recordTrade(proposal, result) {
  // A real order happened by the time this runs — failing to record it corrupts
  // the FIFO/attribution books, so every problem here must THROW (the caller
  // keeps the proposal in Executing state and retries), never silently skip.
  if (!existsSync(RECORD_SCRIPT)) {
    throw new Error(`record-trade.js not found at ${RECORD_SCRIPT} — cannot record executed trade`);
  }
  if (!result.orderId) throw new Error("record-trade: missing orderId from execution result");
  const shares = Number(result.shares);
  if (!Number.isFinite(shares) || shares <= 0) throw new Error(`record-trade: invalid shares "${result.shares}"`);
  const price = Number(result.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`record-trade: invalid price "${result.price}"`);

  const { stdout, stderr } = await execFileAsync(
    "node",
    [
      RECORD_SCRIPT,
      "--proposalId", proposal.id,
      "--orderId",    result.orderId,
      "--ticker",     proposal.ticker,
      "--side",       proposal.side,
      "--shares",     String(shares),
      "--price",      String(price),
      "--agentId",    proposal.agentId,
    ],
    { cwd: join(__dir, "../../portfolio-manager"), timeout: 30_000 }
  );
  if (stderr) console.warn("[companion] record-trade stderr:", stderr.trim());
  console.log("[companion] ✓ Trade recorded in ledger:", stdout.trim());
}

// ── Holdings sync ─────────────────────────────────────────────────────────────
const SYNC_SCRIPT = join(__dir, "../../portfolio-manager/scripts/sync-holdings-from-mcp.js");

async function syncHoldings() {
  if (!existsSync(SYNC_SCRIPT)) {
    console.warn("[companion] sync-holdings-from-mcp.js not found — skipping sheet update");
    return;
  }

  const prompt = `Use the Robinhood MCP to get all current positions and buying power in my Agentic account.
Return ONLY this JSON — no other text, no markdown:
{"positions":[{"ticker":"NVDA","name":"NVIDIA Corporation","shares":0.076,"avgCost":196.38,"currentPrice":196.40}],"cash":12.34}
Include every open position. Use the actual live values from the MCP.`;

  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      CLAUDE_BIN,
      ["-p", "--allowedTools", "mcp__robinhood-trading__*", "--permission-mode", "bypassPermissions", prompt],
      { env, timeout: 120_000 }
    ));
  } catch (err) {
    console.warn("[companion] sync: failed to fetch positions from Robinhood:", err.message);
    return;
  }

  // Extract the JSON blob from claude output
  let positionsJson;
  const blocks = [...stdout.matchAll(/\{(?:[^{}]|\{[^{}]*\})*\}/gs)];
  for (const b of blocks.reverse()) {
    try {
      const p = JSON.parse(b[0]);
      if (Array.isArray(p.positions)) { positionsJson = b[0]; break; }
    } catch {}
  }
  if (!positionsJson) {
    console.warn("[companion] sync: could not parse positions from claude output");
    return;
  }

  // Pipe positions JSON into sync-holdings-from-mcp.js, run from portfolio-manager dir so
  // dotenv + credentials.json resolve correctly
  const syncDir = join(__dir, "../../portfolio-manager");
  await new Promise((resolve, reject) => {
    const child = execFile("node", [SYNC_SCRIPT], { env: process.env, cwd: syncDir }, (err) => {
      if (err) reject(err); else resolve();
    });
    child.stdin.write(positionsJson);
    child.stdin.end();
  });

  console.log("[companion] ✓ Holdings synced to Google Sheets");
}

// ── Market scan sync ─────────────────────────────────────────────────────────
const MARKET_SYNC_SCRIPT = join(__dir, "../../portfolio-manager/scripts/sync-market-scans-from-mcp.js");

async function setMarketScanStatus(status) {
  await redisPost(["set", "pm:market-scans:status", JSON.stringify({
    ...status,
    updatedAt: new Date().toISOString(),
  }), "EX", 3600]).catch(() => null);
}

async function runMarketScanSync() {
  if (!existsSync(MARKET_SYNC_SCRIPT)) {
    console.warn("[companion] sync-market-scans-from-mcp.js not found — skipping market scan sync");
    return;
  }

  await setMarketScanStatus({ state: "running", count: 0, error: null });

  const prompt = `Use only Robinhood MCP read-only scanner, quote, fundamentals, technical indicator, earnings, portfolio, and position tools.
Do not place, review, cancel, or modify any order. Do not create or update saved scans or watchlists.

Task:
1. Get my saved Robinhood scans.
2. Run the most useful scans for discovering equity candidates. Prefer momentum/relative-volume, oversold-quality/pullback, earnings/catalyst, and large-cap strength scans when present.
3. Add enough quote/market data to make each candidate useful for research.

Return ONLY this JSON — no markdown, no prose:
{
  "syncedAt": "ISO timestamp",
  "scans": [
    {
      "scanName": "Momentum + Volume",
      "results": [
        {
          "ticker": "NVDA",
          "name": "NVIDIA Corporation",
          "price": 196.40,
          "changePct": 2.1,
          "volume": 12345678,
          "avgVolume": 9876543,
          "marketCap": 4800000000000,
          "signal": "Why this scan surfaced the ticker",
          "score": 92,
          "agentHint": "agent-1",
          "notes": "One brief extra market-data note"
        }
      ]
    }
  ]
}

Use agentHint only when obvious: agent-1 for high-growth technology/software/semis, agent-2 for financials/healthcare/quality compounders, agent-3 for defensive/consumer/industrial/dividend names. Otherwise leave agentHint empty. Limit total results to the 40 best rows.`;

  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      CLAUDE_BIN,
      ["-p", "--allowedTools", ROBINHOOD_MCP_TOOLS, "--disallowedTools", MARKET_SYNC_DISALLOWED_TOOLS, "--permission-mode", "bypassPermissions", prompt],
      { env, timeout: 180_000 }
    ));
  } catch (err) {
    console.warn("[companion] market scan: failed to fetch scans from Robinhood:", err.message);
    await setMarketScanStatus({ state: "error", count: 0, error: err.message });
    return;
  }

  const extracted = extractJsonObject(stdout, (p) => Array.isArray(p.scans) || Array.isArray(p.results));
  if (!extracted) {
    console.warn("[companion] market scan: could not parse scan JSON from claude output");
    await setMarketScanStatus({ state: "error", count: 0, error: "Could not parse scan JSON from Claude output" });
    return;
  }

  const syncDir = join(__dir, "../../portfolio-manager");
  await new Promise((resolve, reject) => {
    const child = execFile("node", [MARKET_SYNC_SCRIPT], { env: process.env, cwd: syncDir }, (err) => {
      if (err) reject(err); else resolve();
    });
    child.stdin.write(extracted.text);
    child.stdin.end();
  });

  console.log("[companion] ✓ Market scans synced to Google Sheets");
}

// ── Execution + reconciliation handlers ──────────────────────────────────────

/** Records the trade in the ledger, then (only on success) marks fulfilled. */
async function recordAndFulfill(id, proposal, { orderId, shares, price }) {
  try {
    await recordTrade(proposal, { orderId, shares, price });
  } catch (err) {
    // Money moved but the ledger write failed. Do NOT mark fulfilled — the
    // Executing state + stored order fields make the next poll retry recording
    // without touching the broker again.
    await setProposalField(id, {
      executionState: "Executing",
      executionOrderId: orderId,
      executionShares: shares,
      executionPrice: price,
    });
    await alertTelegram(`Trade EXECUTED but ledger recording FAILED for ${proposal.side} $${proposal.amountDollars} ${proposal.ticker} (proposal ${id}, order ${orderId}): ${err.message}. Will retry recording next poll.`);
    return false;
  }
  await setProposalField(id, {
    fulfilledAt: new Date().toISOString(),
    fulfilledOrderId: orderId,
    fulfilledShares: shares,
    executionState: null,
  });
  console.log(`[companion] ✓ ${id} fulfilled — order ${orderId}, ${shares} shares`);
  syncHoldings().catch((err) => console.warn("[companion] sync error:", err.message));
  return true;
}

async function executeProposal(id, proposal) {
  console.log(`[companion] Executing proposal ${id}: ${proposal.side} $${proposal.amountDollars} ${proposal.ticker}`);

  // Mark Executing BEFORE the order goes out. If we die mid-flight, the next
  // poll reconciles against the broker instead of double-executing.
  await setProposalField(id, {
    executionState: "Executing",
    executionStartedAt: new Date().toISOString(),
  });

  let result;
  try {
    result = await executeViaClaude(proposal);
  } catch (err) {
    // Unknown outcome (timeout/crash) — leave Executing; reconcile next poll.
    await alertTelegram(`Order attempt for ${proposal.side} $${proposal.amountDollars} ${proposal.ticker} (proposal ${id}) ended with UNKNOWN outcome: ${err.message}. Will reconcile against the broker next poll.`);
    throw err;
  }

  if (result.ok) {
    await recordAndFulfill(id, proposal, {
      orderId: result.orderId,
      shares: result.shares,
      price: result.price ?? (result.shares ? (proposal.amountDollars / result.shares).toFixed(4) : null),
    });
  } else {
    // The model REPORTED failure, but that's not proof no order was placed —
    // keep Executing so the next poll verifies with the broker before retrying.
    console.error(`[companion] ✗ ${id} reported failure:`, result.error);
    await alertTelegram(`Order attempt for ${proposal.side} $${proposal.amountDollars} ${proposal.ticker} (proposal ${id}) reported failure: ${result.error}. Verifying against broker next poll.`);
  }
}

async function reconcileProposal(id, proposal) {
  console.log(`[companion] Reconciling proposal ${id} (${proposal.side} ${proposal.ticker}) against broker...`);

  // Case 1: order confirmed earlier, only the ledger write is outstanding.
  if (proposal.executionOrderId) {
    await recordAndFulfill(id, proposal, {
      orderId: proposal.executionOrderId,
      shares: proposal.executionShares,
      price: proposal.executionPrice,
    });
    return;
  }

  // Case 2: outcome unknown — ask the broker.
  const rec = await reconcileViaClaude(proposal);

  if (!rec.found) {
    // Broker has no matching order — safe to clear the marker and let the next
    // poll re-execute (ref_id keeps even that idempotent upstream).
    console.log(`[companion] ${id}: no broker order found — clearing Executing state for retry.`);
    await setProposalField(id, { executionState: null, executionStartedAt: null });
    return;
  }

  const state = String(rec.state ?? "").toLowerCase();
  if (state === "filled") {
    await recordAndFulfill(id, proposal, { orderId: rec.orderId, shares: rec.shares, price: rec.price });
  } else if (["cancelled", "rejected", "failed", "voided"].includes(state)) {
    console.log(`[companion] ${id}: broker order ${rec.orderId} ended ${state} — clearing Executing state for retry.`);
    await setProposalField(id, { executionState: null, executionStartedAt: null });
    await alertTelegram(`Order for ${proposal.side} ${proposal.ticker} (proposal ${id}) ended ${state} at the broker. Proposal returned to the execution queue.`);
  } else {
    // Still working (new/queued/confirmed/partially_filled) — leave Executing, check again next poll.
    console.log(`[companion] ${id}: broker order ${rec.orderId} still ${state || "working"} — waiting.`);
  }
}

// ── Main poll loop ─────────────────────────────────────────────────────────────
async function poll(force = false) {
  if (!force && !isMarketOpen()) {
    console.log(`[companion] Market closed — skipping poll`);
    return;
  }
  try {
    const ids = await redisCmd("lrange", LIST_KEY, "0", "99");
    if (!ids?.length) return;

    for (const id of ids) {
      const proposal = await getProposal(id);
      if (!proposal) continue;
      if (proposal.status !== "ApprovedForBrokerReview") continue;
      if (proposal.fulfilledAt) continue;

      // Verify BEFORE any handler touches the broker: an unsigned/forged
      // "approval" written straight into Redis must never trade.
      const sig = verifyApprovalSignature(proposal);
      if (!sig.ok) {
        await alertTelegram(`REFUSED proposal ${id} (${proposal.side} $${proposal.amountDollars} ${proposal.ticker}): ${sig.reason}.`);
        continue;
      }

      const locked = await acquireLock(id);
      if (!locked) {
        console.log(`[companion] ${id} already being processed, skipping`);
        continue;
      }

      try {
        if (proposal.executionState === "Executing") {
          // A previous attempt started but never confirmed its outcome (crash,
          // sleep, timeout, or failed ledger recording). NEVER blindly re-execute
          // — ask the broker what happened first.
          await reconcileProposal(id, proposal);
        } else {
          await executeProposal(id, proposal);
        }
      } catch (err) {
        console.error(`[companion] ✗ ${id} exception:`, err.message);
      } finally {
        await releaseLock(id);
      }
    }
  } catch (err) {
    console.error("[companion] Poll error:", err.message);
  }
}

async function heartbeat() {
  // Liveness beacon — the dashboard warns when this goes stale while approved
  // proposals are waiting (Mac asleep = nothing executes, silently).
  await redisPost(["set", "pm:companion:last-seen", new Date().toISOString(), "EX", 3600]).catch(() => null);

  const triggered = await redisCmd("getdel", "pm:exec_trigger").catch(() => null);
  if (triggered) {
    console.log(`[companion] Manual trigger received — running immediate poll`);
    await poll(true);
  }

  const marketTriggered = await redisCmd("getdel", "pm:market_scan_trigger").catch(() => null);
  if (marketTriggered) {
    console.log(`[companion] Market scan trigger received — syncing Robinhood scans`);
    await runMarketScanSync();
  }
}

console.log(`[companion] Starting — polling every ${POLL_INTERVAL_MS / 1000}s`);
poll(); // run immediately on start
setInterval(poll, POLL_INTERVAL_MS);
setInterval(heartbeat, 30_000); // check for manual trigger every 30s
