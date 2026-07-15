import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { addAgentMemory, deleteAgentMemory, isAgentMemoryCategory, listAgentMemories } from "@/lib/agentMemory";
import { getAgent } from "@/lib/agents";

export async function GET(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const authz = await requireApiPermission({
    permission: "research:run",
    action: "AGENT_CHAT_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const { agentId } = await params;
  if (!getAgent(agentId)) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  const memories = await listAgentMemories(agentId, authz.context.userId, 100);
  return NextResponse.json({ memories });
}

export async function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const authz = await requireApiPermission({
    permission: "research:run",
    action: "AGENT_CHAT_SEND",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const { agentId } = await params;
  if (!getAgent(agentId)) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  try {
    const body = await req.json();
    const text = body?.text;
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text must be a non-empty string" }, { status: 400 });
    }
    if (!isAgentMemoryCategory(body?.category)) {
      return NextResponse.json({ error: "category must be investment or workflow" }, { status: 400 });
    }

    const memory = await addAgentMemory({
      agentId,
      scope: body?.scope === "user-agent" ? "user-agent" : "agent",
      userId: authz.context.userId,
      text,
      source: "manual",
      category: body.category,
      importance: body?.importance,
    });

    return NextResponse.json({ memory }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const authz = await requireApiPermission({
    permission: "research:run",
    action: "AGENT_CHAT_SEND",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const { agentId } = await params;
  if (!getAgent(agentId)) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  try {
    const body = await req.json();
    const id = body?.id;
    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const deleted = await deleteAgentMemory(agentId, id, authz.context.userId);
    return NextResponse.json({ ok: deleted });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
