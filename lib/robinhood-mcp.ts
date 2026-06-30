import { randomBytes, createHash } from "crypto";
import { getRedis } from "./redis";

const CLIENT_ID = "LtLiNmbs9owbYfWgBlC68Z2VujIPuvGoAiSYr8xW";
const REDIRECT_URI =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000/api/robinhood/callback"
    : "https://portfolio-dashboard-ivory-five.vercel.app/api/robinhood/callback";
const MCP_URL = "https://agent.robinhood.com/mcp/trading";
const TOKEN_URL = "https://api.robinhood.com/oauth2/token/";
const AUTH_URL = "https://robinhood.com/oauth";

const K_ACCESS = "pm:robinhood:access_token";
const K_REFRESH = "pm:robinhood:refresh_token";
const K_EXPIRY = "pm:robinhood:token_expiry";
const K_ACCOUNT = "pm:robinhood:account_number";

// ── PKCE helpers ──────────────────────────────────────────────────────────────

export function generatePKCE(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  return { verifier, challenge, state };
}

export function buildAuthUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "internal",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function storePKCEVerifier(state: string, verifier: string): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis required for Robinhood connect");
  await redis.set(`pm:robinhood:pkce:${state}`, verifier, { ex: 300 });
}

export async function consumePKCEVerifier(state: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  const key = `pm:robinhood:pkce:${state}`;
  const verifier = await redis.get<string>(key);
  if (verifier) await redis.del(key);
  return verifier;
}

// ── Token management ──────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(code: string, verifier: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in ?? 3600 };
}

export async function storeTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis required");
  const expiry = Date.now() + (expiresIn - 60) * 1000;
  await Promise.all([
    redis.set(K_ACCESS, accessToken),
    redis.set(K_REFRESH, refreshToken),
    redis.set(K_EXPIRY, String(expiry)),
  ]);
}

export async function getValidToken(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  const [accessToken, refreshToken, expiryStr] = await Promise.all([
    redis.get<string>(K_ACCESS),
    redis.get<string>(K_REFRESH),
    redis.get<string>(K_EXPIRY),
  ]);
  if (!accessToken) return null;
  if (Date.now() < Number(expiryStr ?? 0)) return accessToken;
  if (!refreshToken) return null;

  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) return null;
    const json = await res.json();
    await storeTokens(json.access_token, json.refresh_token ?? refreshToken, json.expires_in ?? 3600);
    return json.access_token as string;
  } catch {
    return null;
  }
}

export async function isConnected(): Promise<boolean> {
  return (await getValidToken()) !== null;
}

export async function storeAccountNumber(accountNumber: string): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis required");
  await redis.set(K_ACCOUNT, accountNumber);
}

export async function getAccountNumber(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  return redis.get<string>(K_ACCOUNT);
}

// ── MCP HTTP client ───────────────────────────────────────────────────────────

let _sessionId: string | null = null;
let _reqId = 1;

async function mcpPost(method: string, params: unknown, token: string, sessionId?: string | null): Promise<{ result: unknown; sessionId: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "Authorization": `Bearer ${token}`,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: _reqId++, method, params }),
  });

  const newSessionId = res.headers.get("Mcp-Session-Id") ?? sessionId ?? null;
  const ct = res.headers.get("Content-Type") ?? "";

  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    const lastData = text.split("\n").filter((l) => l.startsWith("data: ")).pop()?.slice(6) ?? "";
    if (!lastData) throw new Error("Empty SSE from MCP");
    const parsed = JSON.parse(lastData);
    if (parsed.error) throw new Error(parsed.error.message ?? "MCP error");
    return { result: parsed.result, sessionId: newSessionId };
  }

  if (!res.ok) throw new Error(`MCP ${method} failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "MCP error");
  return { result: json.result, sessionId: newSessionId };
}

async function ensureSession(token: string): Promise<void> {
  const { sessionId } = await mcpPost(
    "initialize",
    { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "portfolio-dashboard", version: "1.0.0" } },
    token,
    null,
  );
  _sessionId = sessionId;
  // send initialized notification (fire and forget)
  mcpPost("notifications/initialized", {}, token, _sessionId).catch(() => {});
}

export async function mcpToolCall(toolName: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  // Try with existing session first; re-initialize on session error
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { result, sessionId } = await mcpPost("tools/call", { name: toolName, arguments: args }, token, _sessionId);
      _sessionId = sessionId;
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (attempt === 0 && (msg.includes("session") || msg.includes("400") || msg.includes("initialize"))) {
        await ensureSession(token);
        continue;
      }
      throw err;
    }
  }
}

export async function getAccounts(token: string): Promise<Array<{ account_number: string; type: string; [k: string]: unknown }>> {
  const result = await mcpToolCall("get_accounts", {}, token);
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  if (Array.isArray(content) && content[0]?.text) return JSON.parse(content[0].text);
  return result as Array<{ account_number: string; type: string }>;
}

export async function placeEquityOrder(args: {
  account_number: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  type: "market" | "limit";
  limit_price?: number;
  ref_id: string;
}, token: string): Promise<{ orderId: string; [k: string]: unknown }> {
  const result = await mcpToolCall("place_equity_order", args as Record<string, unknown>, token);
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  const parsed = Array.isArray(content) && content[0]?.text ? JSON.parse(content[0].text) : result;
  const orderId = parsed?.id ?? parsed?.order_id ?? parsed?.orderId ?? String(parsed);
  return { ...parsed, orderId };
}
