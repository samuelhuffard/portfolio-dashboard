// Mirrors portfolio-manager's config/agents.js. Each agent has its own
// spreadsheet (own Holdings/Recommendations/Strategy/Track Record), own chat
// memory in Redis, and no shared state with the other agents except market
// facts (news/macro), which aren't agent memory or opinion.
export interface AgentDef {
  id: string;
  name: string; // empty until Sam names this agent after its investment philosophy
}

export const AGENTS: AgentDef[] = [
  { id: "agent-1", name: "" },
  { id: "agent-2", name: "" },
  { id: "agent-3", name: "" },
];

export function getAgent(id: string): AgentDef | undefined {
  return AGENTS.find((a) => a.id === id);
}
