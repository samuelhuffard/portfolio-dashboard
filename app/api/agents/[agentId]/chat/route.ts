import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireApiPermission } from "@/lib/auth";
import { getServiceAccountClients, getSharedSpreadsheetId, readHoldings, readRecommendations, readStrategyNotes, readTrackRecord } from "@/lib/sheets";
import { getChatHistory, appendChatMessages, clearChatHistory, type ChatMessage } from "@/lib/agentChat";
import { getAgent } from "@/lib/agents";

const MODEL = "claude-sonnet-4-6";

function buildSystemPrompt(agentId: string, name: string, contextBlock: string): string {
  return `You are an independent research agent, internally identified as "${agentId}"${name ? ` ("${name}")` : ""}, proposing trades against ONE shared real Robinhood portfolio alongside two other research agents. You have no assigned investment philosophy yet — Sam will name and define your mandate later. Until then, discuss your own watchlist, recommendations, and track record plainly and helpfully, without inventing a philosophy you don't have.

You and the other two agents share the same pool of capital — the holdings/cash below are the REAL shared portfolio's current state, not yours alone. Your proposals compete with theirs for the same money, and Sam's risk engine can downgrade a BUY if combined exposure across all three agents would breach a position/sector limit. You only know your own strategy notes, recommendation history, and track record — never assume anything about the other agents' reasoning. You do not place trades or claim that anything has been sent to a broker. If Sam wants action, draft a proposed allocation for the dashboard approval queue with ticker, side, dollar amount, rationale, and risk notes. The person you're talking to is named Sam — address him as Sam, not by any other name.

Your current data:
${contextBlock}`;
}

async function loadContextBlock(agentId: string): Promise<string> {
  const spreadsheetId = await getSharedSpreadsheetId();
  const sheets = await getServiceAccountClients();

  const [holdingsResult, recommendations, strategyNotes, trackRecord] = await Promise.all([
    readHoldings(sheets, spreadsheetId).catch(() => ({ holdings: [], cash: null, lastSynced: null })),
    readRecommendations(sheets, spreadsheetId, agentId).catch(() => []),
    readStrategyNotes(sheets, spreadsheetId, agentId).catch(() => ""),
    readTrackRecord(sheets, spreadsheetId, agentId).catch(() => []),
  ]);

  const recentRecs = recommendations.slice(-15);

  return [
    `Current shared portfolio holdings (all three agents propose against this same pool): ${holdingsResult.holdings.length ? holdingsResult.holdings.map((h) => `${h.ticker} (${h.shares} sh)`).join(", ") : "none yet"}`,
    `Strategy notes from Sam: ${strategyNotes || "(none set)"}`,
    `Recent recommendations (most recent ${recentRecs.length}):\n${recentRecs.map((r) => `- ${r.date} ${r.ticker} ${r.action} (quant score ${r.quantScore ?? "—"})`).join("\n") || "none yet"}`,
    `Track record: ${trackRecord.length ? trackRecord.map((t) => `${t.horizon} — ${t.evaluated ?? 0} evaluated, ${t.hitRatePct ?? "—"}% hit rate, ${t.avgAlphaPct ?? "—"}% avg alpha vs SPY`).join("; ") : "no completed evaluations yet"}`,
  ].join("\n\n");
}

export async function GET(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const authz = await requireApiPermission({
    permission: "research:run",
    action: "AGENT_CHAT_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const { agentId } = await params;
  if (!getAgent(agentId)) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  const history = await getChatHistory(agentId, authz.context.userId);
  return NextResponse.json({ history });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const authz = await requireApiPermission({
    permission: "research:run",
    action: "AGENT_CHAT_SEND",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const { agentId } = await params;
  if (!getAgent(agentId)) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  await clearChatHistory(agentId, authz.context.userId);
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const authz = await requireApiPermission({
    permission: "research:run",
    action: "AGENT_CHAT_SEND",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const { agentId } = await params;
  const agent = getAgent(agentId);
  if (!agent) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  try {
    const body = await req.json();
    const message = body?.message;
    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "message must be a non-empty string" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

    const contextBlock = await loadContextBlock(agentId);
    const history = await getChatHistory(agentId, authz.context.userId);

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(agentId, agent.name, contextBlock),
      messages: [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user" as const, content: message }],
    });

    const reply = response.content.find((b) => b.type === "text")?.text ?? "";

    const now = new Date().toISOString();
    const exchange: ChatMessage[] = [
      { role: "user", content: message, ts: now },
      { role: "assistant", content: reply, ts: now },
    ];
    await appendChatMessages(agentId, authz.context.userId, exchange);

    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
