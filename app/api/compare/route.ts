import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { fetchCompaniesData } from "@/lib/research/yahoo";
import { computeCompaniesData } from "@/lib/research/compute";
import { saveReport } from "@/lib/redis";
import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/research/types";

const MAX_TICKERS = 5;

export async function POST(request: NextRequest) {
  let body: AnalyzeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tickers = Array.from(
    new Set((body.tickers ?? []).map((t) => t.trim().toUpperCase()).filter(Boolean)),
  );

  if (tickers.length === 0) {
    return NextResponse.json({ error: "At least one ticker is required" }, { status: 400 });
  }
  if (tickers.length > MAX_TICKERS) {
    return NextResponse.json({ error: `Limit ${MAX_TICKERS} tickers per comparison` }, { status: 400 });
  }

  const rawList = await fetchCompaniesData(tickers);
  const companies = computeCompaniesData(rawList);

  const response: AnalyzeResponse = {
    kind: "comparison",
    reportId: randomUUID(),
    generatedAt: new Date().toISOString(),
    companies,
  };

  await saveReport(response);

  return NextResponse.json(response);
}
