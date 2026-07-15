import { randomUUID } from "crypto";
import { getRedis } from "./redis";

export type AgentMemoryScope = "agent" | "user-agent";
export type AgentMemoryCategory = "investment" | "workflow";
// "weekly_review" rows are written by the backend's jobs/weekly-review.js (calibration lessons).
export type AgentMemorySource = "chat" | "proposal_decision" | "manual" | "strategy" | "weekly_review";

export interface AgentMemory {
  id: string;
  agentId: string;
  scope: AgentMemoryScope;
  userId: string | null;
  text: string;
  source: AgentMemorySource;
  category?: AgentMemoryCategory;
  importance: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMemoryInput {
  agentId: string;
  scope: AgentMemoryScope;
  userId?: string | null;
  text: string;
  source: AgentMemorySource;
  category: AgentMemoryCategory;
  importance?: number;
  now?: string;
}

const MAX_MEMORIES_PER_KEY = 100;
const MAX_MEMORY_TEXT_LENGTH = 500;

export function isAgentMemoryCategory(value: unknown): value is AgentMemoryCategory {
  return value === "investment" || value === "workflow";
}

function globalKey(agentId: string): string {
  return `pm:agent-memory:${agentId}:global`;
}

function userKey(agentId: string, userId: string): string {
  return `pm:agent-memory:${agentId}:user:${userId}`;
}

function keyFor(scope: AgentMemoryScope, agentId: string, userId?: string | null): string | null {
  if (scope === "agent") return globalKey(agentId);
  return userId ? userKey(agentId, userId) : null;
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_TEXT_LENGTH);
}

function clampImportance(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

function normalizeForDedupe(text: string): string {
  return cleanText(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function readMemoryList(key: string): Promise<AgentMemory[]> {
  const redis = getRedis();
  if (!redis) return [];
  const raw = await redis.get(key);
  if (!raw) return [];
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(parsed) ? (parsed as AgentMemory[]) : [];
}

async function writeMemoryList(key: string, memories: AgentMemory[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const sorted = [...memories]
    .sort((a, b) => b.importance - a.importance || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_MEMORIES_PER_KEY);
  await redis.set(key, JSON.stringify(sorted));
}

export async function listAgentMemories(agentId: string, userId?: string | null, limit = 20): Promise<AgentMemory[]> {
  const [global, user] = await Promise.all([
    readMemoryList(globalKey(agentId)).catch(() => []),
    userId ? readMemoryList(userKey(agentId, userId)).catch(() => []) : Promise.resolve([]),
  ]);

  return [...global, ...user]
    .sort((a, b) => b.importance - a.importance || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit);
}

export async function addAgentMemory(input: AgentMemoryInput): Promise<AgentMemory | null> {
  const key = keyFor(input.scope, input.agentId, input.userId);
  if (!key) return null;

  const text = cleanText(input.text);
  if (text.length < 8) return null;

  const now = input.now ?? new Date().toISOString();
  const memories = await readMemoryList(key).catch(() => []);
  const normalized = normalizeForDedupe(text);
  const existing = memories.find((memory) => normalizeForDedupe(memory.text) === normalized);

  if (existing) {
    existing.importance = Math.max(existing.importance, clampImportance(input.importance));
    existing.updatedAt = now;
    existing.source = input.source;
    existing.category = input.category;
    await writeMemoryList(key, memories);
    return existing;
  }

  const memory: AgentMemory = {
    id: randomUUID(),
    agentId: input.agentId,
    scope: input.scope,
    userId: input.scope === "user-agent" ? input.userId ?? null : null,
    text,
    source: input.source,
    category: input.category,
    importance: clampImportance(input.importance),
    createdAt: now,
    updatedAt: now,
  };

  await writeMemoryList(key, [memory, ...memories]);
  return memory;
}

export async function deleteAgentMemory(agentId: string, memoryId: string, userId?: string | null): Promise<boolean> {
  const keys = [globalKey(agentId), ...(userId ? [userKey(agentId, userId)] : [])];

  for (const key of keys) {
    const memories = await readMemoryList(key).catch(() => []);
    const next = memories.filter((memory) => memory.id !== memoryId);
    if (next.length !== memories.length) {
      await writeMemoryList(key, next);
      return true;
    }
  }

  return false;
}

export function formatAgentMemoriesForPrompt(memories: AgentMemory[]): string {
  if (!memories.length) return "(none yet)";
  return memories.map((memory) => `- ${memory.text}`).join("\n");
}
