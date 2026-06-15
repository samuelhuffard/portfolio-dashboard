import { NextRequest, NextResponse } from "next/server";
import { getReport } from "@/lib/redis";
import { generateResearchWorkbook, generateComparisonWorkbook } from "@/lib/research/excel";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing report id" }, { status: 400 });
  }

  const report = await getReport(id);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  let buffer: Buffer;
  let filename: string;
  if (report.kind === "research") {
    buffer = await generateResearchWorkbook(report);
    filename = `research-${report.ticker}-${report.reportId.slice(0, 8)}.xlsx`;
  } else {
    buffer = await generateComparisonWorkbook(report);
    const tickers = report.companies.map((c) => c.ticker).join("-");
    filename = `compare-${tickers}-${report.reportId.slice(0, 8)}.xlsx`;
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
