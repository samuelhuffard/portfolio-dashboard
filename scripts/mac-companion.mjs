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

// ── Claude executor ────────────────────────────────────────────────────────────
async function executeViaClaude(proposal) {
  const { id, ticker, side, amountDollars, maxPrice } = proposal;

  const wholeShares = maxPrice ? Math.floor(amountDollars / maxPrice) : 0;
  if (maxPrice && wholeShares < 1) {
    console.warn(`[companion] ${id} limit order impossible: floor(${amountDollars}/${maxPrice})=0 shares — routing to market order instead`);
  }
  const useLimit = maxPrice && wholeShares >= 1;
  const orderInstructions = useLimit
    ? `LIMIT ORDER — buy ${wholeShares} whole shares of ${ticker} at limit price $${maxPrice}. Use whole share quantity, NOT dollar amount.`
    : `MARKET ORDER — buy $${amountDollars} notional of ${ticker} using dollar-amount fractional sizing.`;

  const prompt = `Use the Robinhood MCP to place the following trade on my Agentic account (the one enabled for agentic trading, not margin or IRA):

Ticker: ${ticker}
Side: ${side.toUpperCase()}
${orderInstructions}
Proposal ID (for reference): ${id}

IMPORTANT: Place the order now — do not ask for confirmation. After placing, respond with ONLY this JSON (no other text):
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
  if (!existsSync(RECORD_SCRIPT)) {
    console.warn("[companion] record-trade.js not found — skipping ledger entry");
    return;
  }
  const { stdout, stderr } = await execFileAsync(
    "node",
    [
      RECORD_SCRIPT,
      "--proposalId", proposal.id,
      "--orderId",    result.orderId,
      "--ticker",     proposal.ticker,
      "--side",       proposal.side,
      "--shares",     String(result.shares),
      "--price",      String(result.price ?? (proposal.amountDollars / result.shares).toFixed(4)),
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

      const locked = await acquireLock(id);
      if (!locked) {
        console.log(`[companion] ${id} already being processed, skipping`);
        continue;
      }

      console.log(`[companion] Executing proposal ${id}: ${proposal.side} $${proposal.amountDollars} ${proposal.ticker}`);

      try {
        const result = await executeViaClaude(proposal);

        if (result.ok) {
          // 1. Record in trade ledger + open lot (runs while fulfilledAt is still null)
          await recordTrade(proposal, result).catch((err) => console.warn("[companion] record-trade error:", err.message));
          // 2. Mark fulfilled in dashboard Redis (adds fulfilledOrderId + fulfilledShares)
          await setProposalField(id, {
            fulfilledAt: new Date().toISOString(),
            fulfilledOrderId: result.orderId,
            fulfilledShares: result.shares,
          });
          console.log(`[companion] ✓ ${id} fulfilled — order ${result.orderId}, ${result.shares} shares`);
          // 3. Sync holdings sheet in background
          syncHoldings().catch((err) => console.warn("[companion] sync error:", err.message));
        } else {
          console.error(`[companion] ✗ ${id} failed:`, result.error);
          // Don't mark fulfilled — will retry next poll unless manually rejected
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
  const triggered = await redisCmd("getdel", "pm:exec_trigger").catch(() => null);
  if (triggered) {
    console.log(`[companion] Manual trigger received — running immediate poll`);
    await poll(true);
  }
}

console.log(`[companion] Starting — polling every ${POLL_INTERVAL_MS / 1000}s`);
poll(); // run immediately on start
setInterval(poll, POLL_INTERVAL_MS);
setInterval(heartbeat, 30_000); // check for manual trigger every 30s
