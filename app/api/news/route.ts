import { NextResponse } from "next/server";
import { getServiceAccountClients, getSpreadsheetId, readRecommendations } from "@/lib/sheets";

export async function GET() {
  try {
    const spreadsheetId = await getSpreadsheetId();
    const sheets = await getServiceAccountClients();

    const recommendations = await readRecommendations(sheets, spreadsheetId);

    const news = recommendations
      .filter((r) => r.newsLinks && r.newsLinks.trim().length > 0)
      .map((r) => ({
        date: r.date,
        ticker: r.ticker,
        action: r.action,
        rationale: r.rationale,
        links: r.newsLinks.split(",").map((l) => l.trim()).filter(Boolean),
      }))
      .reverse();

    return NextResponse.json({ news });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
