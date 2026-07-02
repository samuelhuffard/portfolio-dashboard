import { createHmac, randomUUID } from "crypto";
import { getRedis } from "./redis";

export type ProposalSide = "BUY" | "SELL";
export type ProposalStatus = "Pending" | "ApprovedForBrokerReview" | "Rejected" | "Expired";

// Sentinel decisionNote for the "no reason, don't remember" rejection option — signals the
// caller to skip writing an agent memory for this rejection, since there's nothing to learn.
export const NO_REASON_REJECTION = "No reason";

export interface AllocationProposal {
  id: string;
  agentId: string;
  ticker: string;
  side: ProposalSide;
  amountDollars: number;
  maxPrice: number | null;
  rationale: string;
  riskSummary: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  // Pending proposals left undecided this long auto-expire so the approval queue
  // doesn't accumulate stale research-agent signals. Decided proposals never expire.
  expiresAt: string;
  createdByUserId: string;
  createdByEmail: string | null;
  decidedAt: string | null;
  decidedByUserId: string | null;
  decisionNote: string | null;
  // Set once the backend (portfolio-manager) detects a Robinhood fill matching this
  // Set once the Mac companion executes the trade via Robinhood MCP.
  fulfilledAt: string | null;
  fulfilledOrderId: string | null;
  fulfilledShares: number | null;
  // HMAC over the trade-relevant fields, attached when a manager approves.
  // Executors verify it before placing an order, so a bare Redis write can no
  // longer forge an "approved" proposal — approval authority stays with the
  // dashboard (the only writer holding AUDIT_HMAC_SECRET at decision time).
  decisionHmac: string | null;
}

/**
 * Canonical signature payload. Every field that determines what trade gets
 * executed is included; fulfillment bookkeeping fields are not (they change
 * after approval and don't alter the authorized trade).
 * Mirrored in portfolio-manager/lib/proposal-signature.js and
 * scripts/mac-companion.mjs — keep the three in sync.
 */
export function computeDecisionSignature(
  proposal: Pick<
    AllocationProposal,
    "id" | "status" | "agentId" | "ticker" | "side" | "amountDollars" | "maxPrice" | "decidedAt" | "decidedByUserId"
  >,
  secret: string
): string {
  const payload = [
    proposal.id,
    proposal.status,
    proposal.agentId,
    proposal.ticker,
    proposal.side,
    String(proposal.amountDollars),
    proposal.maxPrice == null ? "" : String(proposal.maxPrice),
    proposal.decidedAt ?? "",
    proposal.decidedByUserId ?? "",
  ].join("|");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export interface ProposalInput {
  agentId: unknown;
  ticker: unknown;
  side: unknown;
  amountDollars: unknown;
  maxPrice?: unknown;
  rationale: unknown;
  riskSummary?: unknown;
}

const LIST_KEY = "pm:approval_proposals";
const MAX_PROPOSALS = 250;
const MAX_AMOUNT_DOLLARS = 10000;
const PROPOSAL_EXPIRY_MS = 48 * 60 * 60 * 1000;
const AGENT_IDS = new Set(["agent-1", "agent-2", "agent-3"]);
const STATUSES = new Set<ProposalStatus>(["Pending", "ApprovedForBrokerReview", "Rejected", "Expired"]);

function keyFor(id: string): string {
  return `pm:approval_proposal:${id}`;
}

function toFinitePositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function validateProposalInput(input: ProposalInput): { ok: true; value: Omit<AllocationProposal, "id" | "status" | "createdAt" | "updatedAt" | "expiresAt" | "createdByUserId" | "createdByEmail" | "decidedAt" | "decidedByUserId" | "decisionNote" | "fulfilledAt" | "fulfilledOrderId" | "fulfilledShares" | "decisionHmac"> } | { ok: false; error: string } {
  const agentId = cleanText(input.agentId);
  if (!AGENT_IDS.has(agentId)) return { ok: false, error: "Select a valid agent." };

  const ticker = cleanText(input.ticker).toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return { ok: false, error: "Enter a valid ticker." };

  const side = cleanText(input.side).toUpperCase();
  if (side !== "BUY" && side !== "SELL") return { ok: false, error: "Side must be BUY or SELL." };

  const amountDollars = toFinitePositiveNumber(input.amountDollars);
  if (amountDollars == null) return { ok: false, error: "Amount must be a positive dollar value." };
  if (amountDollars > MAX_AMOUNT_DOLLARS) return { ok: false, error: `Amount cannot exceed $${MAX_AMOUNT_DOLLARS.toLocaleString()} per proposal.` };

  const maxPriceRaw = input.maxPrice === "" || input.maxPrice == null ? null : toFinitePositiveNumber(input.maxPrice);
  if (input.maxPrice !== "" && input.maxPrice != null && maxPriceRaw == null) {
    return { ok: false, error: "Max price must be blank or a positive number." };
  }

  const rationale = cleanText(input.rationale);
  if (rationale.length < 12) return { ok: false, error: "Rationale must explain the setup." };
  if (rationale.length > 2000) return { ok: false, error: "Rationale is too long." };

  const riskSummary = cleanText(input.riskSummary, "Manager reviewed standard sizing and liquidity constraints.");
  if (riskSummary.length > 2000) return { ok: false, error: "Risk summary is too long." };

  return {
    ok: true,
    value: {
      agentId,
      ticker,
      side,
      amountDollars: Math.round(amountDollars * 100) / 100,
      maxPrice: maxPriceRaw == null ? null : Math.round(maxPriceRaw * 100) / 100,
      rationale,
      riskSummary,
    },
  };
}

function parseProposal(value: unknown): AllocationProposal | null {
  if (!value) return null;
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return parsed as AllocationProposal;
}

// A Pending proposal left undecided for 48h flips to Expired (persisted, mirrors
// portfolio-manager's lib/redis.js expiry) so it stops showing as actionable in
// the approval queue and stops reserving cash. Decided/fulfilled proposals never expire.
async function expireIfNeeded(proposal: AllocationProposal | null): Promise<AllocationProposal | null> {
  if (!proposal || proposal.status !== "Pending") return proposal;
  const expiresAt = proposal.expiresAt ?? new Date(Date.parse(proposal.createdAt) + PROPOSAL_EXPIRY_MS).toISOString();
  if (Date.now() < Date.parse(expiresAt)) return proposal;

  const expired: AllocationProposal = { ...proposal, status: "Expired", expiresAt, updatedAt: new Date().toISOString() };
  const redis = getRedis();
  if (redis) await redis.set(keyFor(expired.id), JSON.stringify(expired)).catch(() => {});
  return expired;
}

export function normalizeDecisionStatus(status: unknown): Exclude<ProposalStatus, "Pending"> {
  const normalizedStatus = cleanText(status);
  if (!STATUSES.has(normalizedStatus as ProposalStatus) || normalizedStatus === "Pending") {
    throw new Error("Decision must approve or reject the proposal.");
  }
  return normalizedStatus as Exclude<ProposalStatus, "Pending">;
}

export function applyProposalDecision(
  current: AllocationProposal,
  status: unknown,
  note: unknown,
  userId: string,
  now = new Date().toISOString()
): AllocationProposal {
  if (current.status === "Expired") {
    throw new Error("Proposal expired 48 hours after creation. Ask the agent to re-propose if the setup still holds.");
  }
  if (current.status !== "Pending") {
    throw new Error("Proposal has already been decided. Create a new proposal for any correction.");
  }

  const decided: AllocationProposal = {
    ...current,
    status: normalizeDecisionStatus(status),
    updatedAt: now,
    decidedAt: now,
    decidedByUserId: userId,
    decisionNote: cleanText(note) || null,
    decisionHmac: null,
  };

  // Sign approvals so executors can verify this decision came from the
  // dashboard, not a bare Redis write. Rejections don't authorize anything,
  // so they stay unsigned.
  if (decided.status === "ApprovedForBrokerReview") {
    const secret = process.env.AUDIT_HMAC_SECRET?.trim();
    if (secret) {
      decided.decisionHmac = computeDecisionSignature(decided, secret);
    } else if (process.env.NODE_ENV === "production") {
      throw new Error("AUDIT_HMAC_SECRET is not configured — cannot sign an approval. Refusing to approve.");
    }
  }
  return decided;
}

export function computeAcceptedBuyReserve(proposals: AllocationProposal[], excludeId?: string): number {
  return proposals
    .filter(
      (proposal) =>
        proposal.id !== excludeId &&
        proposal.side === "BUY" &&
        proposal.status === "ApprovedForBrokerReview" &&
        !proposal.fulfilledAt
    )
    .reduce((sum, proposal) => sum + proposal.amountDollars, 0);
}

export function computeAvailableBuyCash(proposals: AllocationProposal[], cashAvailable: number, excludeId?: string): number {
  return Math.max(0, Math.round((cashAvailable - computeAcceptedBuyReserve(proposals, excludeId)) * 100) / 100);
}

export function assertCashAvailableForBuyProposal(
  proposal: Pick<AllocationProposal, "side" | "amountDollars"> & { id?: string },
  proposals: AllocationProposal[],
  cashAvailable: number,
): void {
  if (proposal.side !== "BUY") return;

  const available = computeAvailableBuyCash(proposals, cashAvailable, proposal.id);
  if (proposal.amountDollars > available + 0.005) {
    throw new Error(
      `This BUY proposal needs $${proposal.amountDollars.toFixed(2)}, but only $${available.toFixed(2)} cash is available after accepted unfilled BUYs are reserved.`
    );
  }
}

export function assertCashAvailableForAcceptance(
  current: AllocationProposal,
  proposals: AllocationProposal[],
  cashAvailable: number
): void {
  try {
    assertCashAvailableForBuyProposal(current, proposals, cashAvailable);
  } catch {
    const available = computeAvailableBuyCash(proposals, cashAvailable, current.id);
    throw new Error(
      `Accepting this BUY would reserve $${current.amountDollars.toFixed(2)}, but only $${available.toFixed(2)} idle cash is available after already accepted BUYs.`
    );
  }
}

export async function listProposals(limit = 100): Promise<AllocationProposal[]> {
  const redis = getRedis();
  if (!redis) return [];

  const ids = await redis.lrange<string>(LIST_KEY, 0, limit - 1);
  const proposals = await Promise.all(
    ids.map((id) => redis.get(keyFor(id)).then(parseProposal).then(expireIfNeeded).catch(() => null))
  );
  return proposals.filter((proposal): proposal is AllocationProposal => proposal !== null);
}

export async function getProposal(id: string): Promise<AllocationProposal | null> {
  const redis = getRedis();
  if (!redis) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for approval proposals.");
  return expireIfNeeded(parseProposal(await redis.get(keyFor(id))));
}

export async function createProposal(input: ReturnType<typeof validateProposalInput> & { ok: true }, userId: string, email: string | null): Promise<AllocationProposal> {
  const redis = getRedis();
  if (!redis) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for approval proposals.");

  const now = new Date().toISOString();
  const proposal: AllocationProposal = {
    id: randomUUID(),
    ...input.value,
    status: "Pending",
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.parse(now) + PROPOSAL_EXPIRY_MS).toISOString(),
    createdByUserId: userId,
    createdByEmail: email,
    decidedAt: null,
    decidedByUserId: null,
    decisionNote: null,
    fulfilledAt: null,
    fulfilledOrderId: null,
    fulfilledShares: null,
    decisionHmac: null,
  };

  await redis.set(keyFor(proposal.id), JSON.stringify(proposal));
  await redis.lpush(LIST_KEY, proposal.id);
  await redis.ltrim(LIST_KEY, 0, MAX_PROPOSALS - 1);
  return proposal;
}

export async function updateProposalDecision(id: string, status: unknown, note: unknown, userId: string): Promise<AllocationProposal | null> {
  const redis = getRedis();
  if (!redis) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for approval proposals.");

  const current = await expireIfNeeded(parseProposal(await redis.get(keyFor(id))));
  if (!current) return null;

  const updated = applyProposalDecision(current, status, note, userId);

  await redis.set(keyFor(updated.id), JSON.stringify(updated));
  return updated;
}

export interface ProposalPatch {
  ticker?: string;
  side?: ProposalSide;
  amountDollars?: number;
  maxPrice?: number | null;
  rationale?: string;
  riskSummary?: string;
}

export function validateProposalPatch(
  input: Record<string, unknown>
): { ok: true; patch: ProposalPatch } | { ok: false; error: string } {
  const patch: ProposalPatch = {};

  if ("ticker" in input) {
    const ticker = cleanText(input.ticker).toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return { ok: false, error: "Enter a valid ticker." };
    patch.ticker = ticker;
  }

  if ("side" in input) {
    const side = cleanText(input.side).toUpperCase();
    if (side !== "BUY" && side !== "SELL") return { ok: false, error: "Side must be BUY or SELL." };
    patch.side = side as ProposalSide;
  }

  if ("amountDollars" in input) {
    const amountDollars = toFinitePositiveNumber(input.amountDollars);
    if (amountDollars == null) return { ok: false, error: "Amount must be a positive dollar value." };
    if (amountDollars > MAX_AMOUNT_DOLLARS) return { ok: false, error: `Amount cannot exceed $${MAX_AMOUNT_DOLLARS.toLocaleString()} per proposal.` };
    patch.amountDollars = Math.round(amountDollars * 100) / 100;
  }

  if ("maxPrice" in input) {
    const raw = input.maxPrice;
    const maxPriceRaw = raw === "" || raw == null ? null : toFinitePositiveNumber(raw);
    if (raw !== "" && raw != null && maxPriceRaw == null) {
      return { ok: false, error: "Max price must be blank or a positive number." };
    }
    patch.maxPrice = maxPriceRaw == null ? null : Math.round(maxPriceRaw * 100) / 100;
  }

  if ("rationale" in input) {
    const rationale = cleanText(input.rationale);
    if (rationale.length < 12) return { ok: false, error: "Rationale must explain the setup." };
    if (rationale.length > 2000) return { ok: false, error: "Rationale is too long." };
    patch.rationale = rationale;
  }

  if ("riskSummary" in input) {
    const riskSummary = cleanText(input.riskSummary);
    if (riskSummary.length > 2000) return { ok: false, error: "Risk summary is too long." };
    patch.riskSummary = riskSummary;
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: "No editable fields provided." };
  return { ok: true, patch };
}

export async function updateProposalFields(
  id: string,
  patch: ProposalPatch,
): Promise<AllocationProposal | null> {
  const redis = getRedis();
  if (!redis) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for approval proposals.");

  const current = await expireIfNeeded(parseProposal(await redis.get(keyFor(id))));
  if (!current) return null;
  if (current.status !== "Pending") {
    throw new Error("Only Pending proposals can be edited. Create a new proposal to replace a decided one.");
  }

  const updated: AllocationProposal = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(keyFor(id), JSON.stringify(updated));
  return updated;
}
