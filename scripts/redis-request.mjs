/**
 * Read and parse a Redis REST response under one deadline. Keeping the signal
 * alive through response.json() matters: a server can send headers then stall
 * the body, which must not wedge a long-running worker's serialized loop.
 */
export async function fetchJsonWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const json = await response.json();
    return { response, json };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Redis request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
