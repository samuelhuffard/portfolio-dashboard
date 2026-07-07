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

// "What did the system last do" — surfaced in the sidebar in place of the old
// static Risk Console blurb. Proxies the Jetson's most-recently-finished cron
// job (see lib/redis.js getLastSystemActivity on the backend); read-only, safe
// to poll, and degrades to null activity if the Jetson is unreachable.
export async function GET(req: NextRequest) {
  const authz = await requireApiPermission({
    permission: 'portfolio:read',
    action: 'ACTIVITY_READ',
    request: req,
  });
  if (!authz.ok) return authz.response;

  if (!BACKEND_URL) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  try {
    const res = await fetch(`${BACKEND_URL}/activity`, { headers: backendHeaders() });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 502 });
  }
}
