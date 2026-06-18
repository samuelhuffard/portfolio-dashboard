import { getRedis } from "./redis";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

const MAX_HISTORY = 40;

/** Each (agent, user) pair gets its own Redis key — separate memory per agent AND per person, no cross-user or cross-agent visibility. */
function historyKey(agentId: string, userId: string): string {
  return `agents:${agentId}:${userId}:chat`;
}

/** Chronological (oldest first) — capped to the most recent MAX_HISTORY messages. */
export async function getChatHistory(agentId: string, userId: string): Promise<ChatMessage[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const items = await redis.lrange(historyKey(agentId, userId), 0, MAX_HISTORY - 1);
    return items
      .map((item) => (typeof item === "string" ? JSON.parse(item) : item) as ChatMessage)
      .reverse();
  } catch (e) {
    console.warn(`[AgentChat] getChatHistory(${agentId}, ${userId}) failed:`, e instanceof Error ? e.message : e);
    return [];
  }
}

/** Appends messages in the given order (typically [user, assistant]) and trims to MAX_HISTORY. */
export async function appendChatMessages(agentId: string, userId: string, messages: ChatMessage[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    for (const m of messages) {
      await redis.lpush(historyKey(agentId, userId), JSON.stringify(m));
    }
    await redis.ltrim(historyKey(agentId, userId), 0, MAX_HISTORY - 1);
  } catch (e) {
    console.warn(`[AgentChat] appendChatMessages(${agentId}, ${userId}) failed:`, e instanceof Error ? e.message : e);
  }
}

/** Clears one person's conversation with one agent — doesn't touch other users' history with that agent, or this user's history with other agents. */
export async function clearChatHistory(agentId: string, userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(historyKey(agentId, userId));
  } catch (e) {
    console.warn(`[AgentChat] clearChatHistory(${agentId}, ${userId}) failed:`, e instanceof Error ? e.message : e);
  }
}
