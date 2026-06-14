import { NextResponse } from "next/server";
import { getServiceAccountClients, getSpreadsheetId, readRecommendations } from "@/lib/sheets";

export async function GET() {
  try {
    const spreadsheetId = await getSpreadsheetId();
    const sheets = await getServiceAccountClients();

    const recommendations = await readRecommendations(sheets, spreadsheetId);

    return NextResponse.json({ recommendations: recommendations.reverse() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
