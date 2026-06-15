import { NextRequest, NextResponse } from "next/server";
import { generateResearchWorkbook } from "@/lib/research/excel";
import type { ResearchResponse } from "@/lib/research/types";

export async function POST(request: NextRequest) {
  let body: ResearchResponse;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.company || !body.analysis) {
    return NextResponse.json({ error: "No research data provided" }, { status: 400 });
  }

  const buffer = await generateResearchWorkbook(body);
  const filename = `research-${body.ticker}-${body.reportId.slice(0, 8)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
