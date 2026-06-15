import { NextResponse } from "next/server";
import { getHistory } from "@/lib/redis";

export async function GET() {
  const reports = await getHistory();
  return NextResponse.json({ reports });
}
