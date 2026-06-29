import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/lib/auth';

const BACKEND_URL = process.env.PORTFOLIO_BACKEND_URL;
const SECRET = process.env.PORTFOLIO_WEBHOOK_SECRET;

function backendHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
  };
}

export async function GET(req: NextRequest) {
  const authz = await requireApiPermission({
    permission: 'alerts:manage',
    action: 'ALERTS_READ',
    request: req,
  });
  if (!authz.ok) return authz.response;

  if (!BACKEND_URL) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  try {
    const res = await fetch(`${BACKEND_URL}/alerts`, { headers: backendHeaders() });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const authz = await requireApiPermission({
    permission: 'alerts:manage',
    action: 'ALERT_CREATE',
    request: req,
  });
  if (!authz.ok) return authz.response;

  if (!BACKEND_URL) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND_URL}/alerts`, {
      method: 'POST',
      headers: backendHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 502 });
  }
}
