import { NextResponse } from 'next/server';
import { requireApiPermission } from '@/lib/auth';

const BACKEND_URL = process.env.PORTFOLIO_BACKEND_URL;
const SECRET = process.env.PORTFOLIO_WEBHOOK_SECRET;

export async function POST(req: Request) {
  const authz = await requireApiPermission({
    permission: 'research:run',
    action: 'RESEARCH_GENERATE',
    request: req,
  });
  if (!authz.ok) return authz.response;

  if (!BACKEND_URL) {
    return NextResponse.json({ error: 'PORTFOLIO_BACKEND_URL not configured' }, { status: 503 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
      },
    });

    const body = await res.json();

    if (!res.ok) {
      return NextResponse.json(body, { status: res.status });
    }

    return NextResponse.json(body, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to reach backend: ${message}` }, { status: 502 });
  }
}
