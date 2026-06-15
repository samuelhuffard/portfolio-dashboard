import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { fetchCompanyData } from "@/lib/research/yahoo";
import { computeCompanyData } from "@/lib/research/compute";
import { generateCompanyAnalysis } from "@/lib/research/analyze";
import { saveReport } from "@/lib/redis";
import type { ResearchRequest, ResearchResponse } from "@/lib/research/types";

export async function POST(request: NextRequest) {
  let body: ResearchRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ticker = (body.ticker ?? "").trim().toUpperCase();
  const focus = body.focus?.trim() || undefined;

  if (!ticker) {
    return NextResponse.json({ error: "A ticker is required" }, { status: 400 });
  }

  const raw = await fetchCompanyData(ticker);
  const company = computeCompanyData(raw);

  if (company.error) {
    return NextResponse.json(
      { error: `Could not fetch data for ${ticker}: ${company.error}` },
      { status: 404 },
    );
  }

  let analysis: string;
  try {
    analysis = await generateCompanyAnalysis(company, focus);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis generation failed" },
      { status: 502 },
    );
  }

  const response: ResearchResponse = {
    kind: "research",
    reportId: randomUUID(),
    generatedAt: new Date().toISOString(),
    ticker,
    focus,
    company,
    analysis,
  };

  await saveReport(response);

  return NextResponse.json(response);
}
