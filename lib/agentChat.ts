import { getRedis } from "./redis";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

const MAX_HISTORY = 40;

/** Each agent's conversation lives under its own Redis key — fully separate memory, no cross-agent visibility. */
function historyKey(agentId: string): string {
  return `agents:${agentId}:chat`;
}

/** Chronological (oldest first) — capped to the most recent MAX_HISTORY messages. */
export async function getChatHistory(agentId: string): Promise<ChatMessage[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const items = await redis.lrange(historyKey(agentId), 0, MAX_HISTORY - 1);
    return items
      .map((item) => (typeof item === "string" ? JSON.parse(item) : item) as ChatMessage)
      .reverse();
  } catch (e) {
    console.warn(`[AgentChat] getChatHistory(${agentId}) failed:`, e instanceof Error ? e.message : e);
    return [];
  }
}

/** Appends messages in the given order (typically [user, assistant]) and trims to MAX_HISTORY. */
export async function appendChatMessages(agentId: string, messages: ChatMessage[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    for (const m of messages) {
      await redis.lpush(historyKey(agentId), JSON.stringify(m));
    }
    await redis.ltrim(historyKey(agentId), 0, MAX_HISTORY - 1);
  } catch (e) {
    console.warn(`[AgentChat] appendChatMessages(${agentId}) failed:`, e instanceof Error ? e.message : e);
  }
}
