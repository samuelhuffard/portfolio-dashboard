import { NextResponse } from "next/server";
import { getServiceAccountClients, getSpreadsheetId, readStrategyNotes, writeStrategyNotes } from "@/lib/sheets";

export async function GET() {
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

export async function POST(req: Request) {
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
