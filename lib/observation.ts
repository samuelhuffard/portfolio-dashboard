import { randomUUID } from "crypto";
import { getRedis } from "./redis";
import {
  MAX_UPDATE_LENGTH,
  defaultObservationChecklist,
  isObservationChecklistItemId,
  type ObservationChecklistItemId,
  type ObservationChecklistState,
  type ObservationUpdate,
  type Phase0DayRecord,
  validateUpdateText,
} from "./observation-shared";

// Server-side readers/writers for the Phase 0 observation surface. The daily
// records are written and HMAC-signed by the Jetson observer; the dashboard
// displays them as stored (it deliberately does not hold the operational-ledger
// signing secret — verification happens on the Jetson). The authoritative
// window count remains docs/PHASE-0-OBSERVATION.md in the backend repo; this
// surface exists so the window is watchable day to day.

export {
  MAX_UPDATE_LENGTH,
  summarizeObservationWindow,
  validateUpdateText,
  verdictLabel,
  verdictTone,
} from "./observation-shared";
export type {
  ObservationUpdate,
  ObservationWindowSummary,
  Phase0DayRecord,
  Phase0SkillProgress,
} from "./observation-shared";

const OBSERVATION_INDEX_KEY = "pm:phase0-observation:index";
const OBSERVATION_PREFIX = "pm:phase0-observation:";
const UPDATES_KEY = "pm:observation:updates";
const HUMAN_CHECKLIST_KEY = "pm:observation:human-checklist";
const MAX_INDEX_DAYS = 90;
const MAX_UPDATES = 200;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseStored<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as T;
  return null;
}

export async function readObservationDays(limit = MAX_INDEX_DAYS): Promise<Phase0DayRecord[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const dates = await redis.lrange(OBSERVATION_INDEX_KEY, 0, Math.max(0, limit - 1));
    const valid = (dates ?? []).map(String).filter((date) => DATE_RE.test(date));
    if (!valid.length) return [];
    const rows = await redis.mget<(string | Phase0DayRecord | null)[]>(...valid.map((date) => `${OBSERVATION_PREFIX}${date}`));
    const records = (rows ?? [])
      .map((raw) => parseStored<Phase0DayRecord>(raw))
      .filter((record): record is Phase0DayRecord => Boolean(record?.dateET && DATE_RE.test(record.dateET) && typeof record.verdict === "string"));
    return records.sort((a, b) => b.dateET.localeCompare(a.dateET));
  } catch (error) {
    console.warn("[Observation] failed to read observation days:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function listObservationUpdates(limit = 50): Promise<ObservationUpdate[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const rows = await redis.lrange(UPDATES_KEY, 0, Math.max(0, limit - 1));
    return (rows ?? [])
      .map((raw) => parseStored<ObservationUpdate>(raw))
      .filter((update): update is ObservationUpdate => Boolean(update?.id && update?.text && update?.createdAt));
  } catch (error) {
    console.warn("[Observation] failed to read updates:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function appendObservationUpdate({
  text,
  author,
  userId,
}: {
  text: string;
  author: string;
  userId: string;
}): Promise<ObservationUpdate> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured.");
  const update: ObservationUpdate = {
    id: randomUUID(),
    text: validateUpdateText(text),
    author: String(author || "FundManager").slice(0, 120),
    userId: String(userId ?? ""),
    createdAt: new Date().toISOString(),
  };
  await redis.lpush(UPDATES_KEY, JSON.stringify(update));
  await redis.ltrim(UPDATES_KEY, 0, MAX_UPDATES - 1);
  return update;
}

export async function readObservationChecklist(): Promise<ObservationChecklistState[]> {
  const defaults = defaultObservationChecklist();
  const redis = getRedis();
  if (!redis) return defaults;
  try {
    const stored = parseStored<ObservationChecklistState[]>(await redis.get(HUMAN_CHECKLIST_KEY));
    if (!Array.isArray(stored)) return defaults;
    const byId = new Map(stored.filter((item) => isObservationChecklistItemId(item?.id)).map((item) => [item.id, item]));
    return defaults.map((item) => {
      const saved = byId.get(item.id);
      return saved && typeof saved.completed === "boolean"
        ? {
            id: item.id,
            completed: saved.completed,
            updatedAt: typeof saved.updatedAt === "string" ? saved.updatedAt : null,
            updatedBy: typeof saved.updatedBy === "string" ? saved.updatedBy : null,
          }
        : item;
    });
  } catch (error) {
    console.warn("[Observation] failed to read human checklist:", error instanceof Error ? error.message : error);
    return defaults;
  }
}

export async function updateObservationChecklist({
  id,
  completed,
  updatedBy,
}: {
  id: ObservationChecklistItemId;
  completed: boolean;
  updatedBy: string;
}): Promise<ObservationChecklistState[]> {
  if (!isObservationChecklistItemId(id)) throw new Error("Unknown observation checklist item.");
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured.");
  const current = await readObservationChecklist();
  const now = new Date().toISOString();
  const next = current.map((item) => item.id === id
    ? { ...item, completed, updatedAt: now, updatedBy: String(updatedBy || "FundManager").slice(0, 120) }
    : item
  );
  await redis.set(HUMAN_CHECKLIST_KEY, JSON.stringify(next));
  return next;
}
