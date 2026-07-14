import {
  MCP_ACCOUNT_POLICY_VERSION,
  McpReadReceiptSchema,
  McpReadRequestSchema,
} from "../lib/contracts/mcp-read-job.js";

export const MCP_JOB_HISTORY_TTL_SECONDS = 14 * 24 * 3600;
export const MCP_JOB_HISTORY_MAX = 100;

export function buildMcpReadReceiptEvidence(requestInput, result, completedAt = new Date().toISOString()) {
  const request = McpReadRequestSchema.parse(requestInput);
  const receipt = McpReadReceiptSchema.parse({
    requestId: request.id,
    kind: request.kind,
    requestedAt: request.requestedAt,
    completedAt,
    ok: result.ok === true,
    outcome: result.outcome,
    error: result.error ? String(result.error).slice(0, 500) : null,
    // Preserve the invocation the durable request actually represents. If a
    // later scheduler slot coalesced onto this pending request, it must remain
    // missing rather than receiving fabricated completion evidence.
    invocationId: request.invocationId ?? null,
    accountVerified: result.ok === true && result.outcome === "ok",
    accountPolicyVersion: MCP_ACCOUNT_POLICY_VERSION,
  });
  const jobRecord = {
    ...receipt,
    ts: receipt.completedAt,
    dateET: request.requestedForET,
    slotET: receipt.invocationId?.split("/")[1] ?? null,
    durationMs: Math.max(0, Date.parse(receipt.completedAt) - Date.parse(request.requestedAt)),
    source: "mac-robinhood-mcp",
  };
  return {
    receipt,
    jobRecord,
    historyKey: `pm:job:${request.kind}:history:${request.requestedForET}`,
  };
}
