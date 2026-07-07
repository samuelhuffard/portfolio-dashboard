import { NextResponse } from 'next/server';
import { requireApiPermission } from '@/lib/auth';
import { validateLabResearchRequest } from './validate';

const BACKEND_URL = process.env.PORTFOLIO_BACKEND_URL?.trim();
const SECRET = process.env.PORTFOLIO_WEBHOOK_SECRET?.trim();

// POST /api/lab-research — kick off a single-ticker agent research run on the
// Jetson backend. Proxy only: the dashboard never runs the pipeline itself and
// must degrade gracefully (503/502 with clear copy) when the Jetson is down.
export async function POST(req: Request) {
  const authz = await requireApiPermission({
    permission: 'research:run',
    action: 'LAB_RESEARCH_RUN',
    request: req,
  });
  if (!authz.ok) return authz.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const validated = validateLabResearchRequest(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  if (!BACKEND_URL) {
    return NextResponse.json({ error: 'PORTFOLIO_BACKEND_URL not configured' }, { status: 503 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/research-ticker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
      },
      body: JSON.stringify({ ticker: validated.ticker, agentId: validated.agentId }),
    });

    const json = await res.json().catch(() => ({ error: `Backend returned ${res.status}` }));
    // Pass the backend status straight through (202 accepted, 400 invalid,
    // 409 same ticker+agent already running, 429 full scan running, 401 auth).
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to reach backend: ${message}` }, { status: 502 });
  }
}
