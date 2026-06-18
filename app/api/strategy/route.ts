import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getServiceAccountClients, getSpreadsheetId, readStrategyNotes, writeStrategyNotes } from "@/lib/sheets";

export async function GET(request: NextRequest) {
  const authz = await requireApiPermission({
    permission: "strategy:write",
    action: "STRATEGY_READ",
    request,
  });
  if (!authz.ok) return authz.response;

  try {
    const spreadsheetId = await getSpreadsheetId();
    const sheets = await getServiceAccountClients();

    const notes = await readStrategyNotes(sheets, spreadsheetId);

    return NextResponse.json({ notes });
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

    const spreadsheetId = await getSpreadsheetId();
    const sheets = await getServiceAccountClients();

    await writeStrategyNotes(sheets, spreadsheetId, notes);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
