/**
 * Preserve the complete scheduler provenance pair when the companion starts
 * the backend holdings-sync process. A partial pair is never meaningful and
 * must fail locally before a broker-derived snapshot can be written.
 *
 * @param {{ requestId?: string | null, invocationId?: string | null }} options
 */
export function buildHoldingsSyncProvenanceArgs(options = {}) {
  const { requestId = null, invocationId = null } = options;
  if (Boolean(requestId) !== Boolean(invocationId)) {
    throw new Error("MCP holdings-sync provenance requires both requestId and invocationId.");
  }
  return requestId ? ["--request-id", requestId, "--invocation-id", invocationId] : [];
}
