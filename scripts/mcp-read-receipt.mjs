import {
  MCP_ACCOUNT_POLICY_VERSION,
  MCP_READ_RECEIPT_SOURCES,
  McpReadReceiptSchema,
  McpReadRequestSchema,
  signMcpReadReceipt,
} from "../lib/contracts/mcp-read-job.js";

export const MCP_JOB_HISTORY_TTL_SECONDS = 14 * 24 * 3600;
export const MCP_JOB_HISTORY_MAX = 100;

export function resolveMcpReceiptSource(roleName, configuredSource) {
  const expected = roleName === "read-worker" ? "jetson-robinhood-mcp" : "mac-robinhood-mcp";
  const source = String(configuredSource ?? expected).trim();
  if (!MCP_READ_RECEIPT_SOURCES.includes(source)) {
    throw new Error(`MCP_READ_RECEIPT_SOURCE must be one of: ${MCP_READ_RECEIPT_SOURCES.join(", ")}.`);
  }
  if (source !== expected) {
    throw new Error(`COMPANION_ROLE=${roleName} must emit ${expected} receipts, not ${source}.`);
  }
  return source;
}

/**
 * @param {unknown} requestInput
 * @param {{ ok: boolean, outcome: "ok" | "mismatch" | "failed", error?: unknown }} result
 * @param {{ completedAt?: string, source: string, secret: string }} options
 */
export function buildMcpReadReceiptEvidence(requestInput, result, {
  completedAt = new Date().toISOString(),
  source,
  secret,
} = {}) {
  const request = McpReadRequestSchema.parse(requestInput);
  const receipt = signMcpReadReceipt({
    schemaVersion: "mcp-read-receipt-v2",
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
    source,
  }, secret);
  const jobRecord = {
    ...receipt,
    ts: receipt.completedAt,
    dateET: request.requestedForET,
    slotET: receipt.invocationId?.split("/")[1] ?? null,
    durationMs: Math.max(0, Date.parse(receipt.completedAt) - Date.parse(request.requestedAt)),
    source: receipt.source,
  };
  return {
    receipt,
    jobRecord,
    historyKey: `pm:job:${request.kind}:history:${request.requestedForET}`,
  };
}
