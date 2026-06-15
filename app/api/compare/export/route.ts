import { NextRequest, NextResponse } from "next/server";
import { generateComparisonWorkbook } from "@/lib/research/excel";
import type { AnalyzeResponse } from "@/lib/research/types";

export async function POST(request: NextRequest) {
  let body: AnalyzeResponse;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.companies || body.companies.length === 0) {
    return NextResponse.json({ error: "No comparison data provided" }, { status: 400 });
  }

  const buffer = await generateComparisonWorkbook(body);
  const tickers = body.companies.map((c) => c.ticker).join("-");
  const filename = `compare-${tickers}-${body.reportId.slice(0, 8)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
