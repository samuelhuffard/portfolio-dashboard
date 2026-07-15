/**
 * Extract complete Robinhood MCP tool-use evidence from Claude Code's
 * stream-json output. With --include-partial-messages, tool inputs arrive as
 * JSON fragments that must be reconstructed before account binding is checked.
 */
export function extractMcpToolCalls(stdout) {
  const calls = [];
  const streamedTools = new Map();

  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (
      typeof value.name === "string"
      && value.name.startsWith("mcp__robinhood-trading__")
      && value.input
      && typeof value.input === "object"
      && !Array.isArray(value.input)
      && Object.keys(value.input).length > 0
    ) {
      calls.push({ name: value.name, input: value.input });
    }
    Object.values(value).forEach(visit);
  };

  for (const line of stdout.split("\n")) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    visit(record);

    const event = record.type === "stream_event" ? record.event : null;
    if (!event || typeof event !== "object") continue;
    const index = event.index;
    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block?.type === "tool_use" && typeof block.name === "string" && block.name.startsWith("mcp__robinhood-trading__")) {
        streamedTools.set(index, { name: block.name, input: block.input ?? {}, partialJson: "" });
      }
    } else if (event.type === "content_block_delta") {
      const tool = streamedTools.get(index);
      if (tool && event.delta?.type === "input_json_delta" && typeof event.delta.partial_json === "string") {
        tool.partialJson += event.delta.partial_json;
      }
    } else if (event.type === "content_block_stop") {
      const tool = streamedTools.get(index);
      streamedTools.delete(index);
      if (!tool) continue;
      let input = tool.input;
      if (tool.partialJson) {
        try {
          input = JSON.parse(tool.partialJson);
        } catch {
          continue;
        }
      }
      if (input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length > 0) {
        calls.push({ name: tool.name, input });
      }
    }
  }

  return calls;
}

/** Safe to log: event categories and MCP tool names only, never tool input or output. */
export function summarizeMcpStream(stdout) {
  const eventTypes = new Set();
  const mcpToolNames = new Set();
  for (const line of stdout.split("\n")) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof record.type === "string") eventTypes.add(record.type);
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value.name === "string" && value.name.startsWith("mcp__robinhood-trading__")) {
        mcpToolNames.add(value.name);
      }
      Object.values(value).forEach(visit);
    };
    visit(record);
  }
  return { eventTypes: [...eventTypes].sort(), mcpToolNames: [...mcpToolNames].sort() };
}

export function assertScheduledMcpAccountBinding(stdout, requiredToolNames, accountNumber) {
  const calls = extractMcpToolCalls(stdout);
  for (const name of requiredToolNames) {
    const toolCalls = calls.filter((call) => call.name === name);
    if (!toolCalls.length) throw new Error(`MCP trace did not include required ${name}`);
    if (toolCalls.some((call) => call.input.account_number !== accountNumber)) {
      throw new Error(`MCP trace shows ${name} without the configured Agentic account_number`);
    }
  }
}
