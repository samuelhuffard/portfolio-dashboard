import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getServiceAccountClients, getSharedSpreadsheetId, readInvestorLedger } from "@/lib/sheets";

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(req: Request) {
  const authz = await requireApiPermission({
    permission: "portfolio:read",
    action: "INVESTORS_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const { userId, email, role } = authz.context;
  if (role !== "Client") {
    return NextResponse.json({ error: "Statement downloads are for Client accounts." }, { status: 403 });
  }

  try {
    const sheets = await getServiceAccountClients();
    const spreadsheetId = await getSharedSpreadsheetId();
    const ledger = await readInvestorLedger(sheets, spreadsheetId);
    const rows = ledger.filter((entry) =>
      (entry.investorId && entry.investorId === userId) ||
      (email && entry.email.toLowerCase() === email.toLowerCase())
    );
    const csv = [
      ["Date", "Type", "Amount", "NAV per Unit", "Units"].map(csvCell).join(","),
      ...rows.map((entry) => [entry.date, entry.type, entry.amount, entry.navPerUnit, entry.units].map(csvCell).join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="portfolio-capital-statement.csv"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create statement" }, { status: 500 });
  }
}
