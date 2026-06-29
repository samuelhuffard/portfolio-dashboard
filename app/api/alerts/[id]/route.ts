import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/lib/auth';

const BACKEND_URL = process.env.PORTFOLIO_BACKEND_URL;
const SECRET = process.env.PORTFOLIO_WEBHOOK_SECRET;

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiPermission({
    permission: 'alerts:manage',
    action: 'ALERT_DELETE',
    request: req,
  });
  if (!authz.ok) return authz.response;

  if (!BACKEND_URL) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  try {
    const { id } = await params;
    const res = await fetch(`${BACKEND_URL}/alerts/${id}`, {
      method: 'DELETE',
      headers: { ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}) },
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 502 });
  }
}
