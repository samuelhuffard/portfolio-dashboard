// Mirrors portfolio-manager's config/agents.js. The agents share one real
// portfolio/capital pool, but keep separate tabs, strategy context, chat memory,
// proposals, and attributed books.
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
