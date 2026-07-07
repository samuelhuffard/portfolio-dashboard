import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/lib/auth';

const BACKEND_URL = process.env.PORTFOLIO_BACKEND_URL?.trim();
const SECRET = process.env.PORTFOLIO_WEBHOOK_SECRET?.trim();

// Matches the backend's requestId route constraint (UUID-ish hex + dashes).
const REQUEST_ID_RE = /^[0-9a-fA-F-]{1,64}$/;

// GET /api/lab-research/[requestId] — poll a Lab research run's status/result.
export async function GET(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const authz = await requireApiPermission({
    permission: 'research:run',
    action: 'LAB_RESEARCH_POLL',
    request: req,
  });
  if (!authz.ok) return authz.response;

  const { requestId } = await params;
  if (!REQUEST_ID_RE.test(requestId)) {
    return NextResponse.json({ error: 'Invalid requestId' }, { status: 400 });
  }

  if (!BACKEND_URL) {
    return NextResponse.json({ error: 'PORTFOLIO_BACKEND_URL not configured' }, { status: 503 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/research-ticker/${requestId}`, {
      headers: { ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}) },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({ error: `Backend returned ${res.status}` }));
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to reach backend: ${message}` }, { status: 502 });
  }
}
