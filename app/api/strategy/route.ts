import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getServiceAccountClients, getSharedSpreadsheetId, readStrategyNotes, writeStrategyNotes } from "@/lib/sheets";
import { getAgent } from "@/lib/agents";

function resolveAgentId(raw: string | null): string {
  const agentId = raw || "agent-1";
  if (!getAgent(agentId)) throw new Error(`Unknown agent "${agentId}"`);
  return agentId;
}

export async function GET(request: NextRequest) {
  const authz = await requireApiPermission({
    permission: "strategy:write",
    action: "STRATEGY_READ",
    request,
  });
  if (!authz.ok) return authz.response;

  try {
    const agentId = resolveAgentId(new URL(request.url).searchParams.get("agentId"));
    const spreadsheetId = await getSharedSpreadsheetId();
    const sheets = await getServiceAccountClients();

    const notes = await readStrategyNotes(sheets, spreadsheetId, agentId);

    return NextResponse.json({ agentId, notes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authz = await requireApiPermission({
    permission: "strategy:write",
    action: "STRATEGY_EDIT",
    request: req,
  });
  if (!authz.ok) return authz.response;

  try {
    const body = await req.json();
    const notes = body?.notes;
    if (typeof notes !== "string") {
      return NextResponse.json({ error: "notes must be a string" }, { status: 400 });
    }
    const agentId = resolveAgentId(body?.agentId ?? null);

    const spreadsheetId = await getSharedSpreadsheetId();
    const sheets = await getServiceAccountClients();

    await writeStrategyNotes(sheets, spreadsheetId, agentId, notes);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
