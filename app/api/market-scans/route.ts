import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/lib/auth';
import { computeAcceptedBuyReserve, computeAvailableBuyCash, listProposals } from '@/lib/proposals';
import { getRedis } from '@/lib/redis';
import { getServiceAccountClients, getSharedSpreadsheetId, readCashBalance, readMarketScans } from '@/lib/sheets';

function parseStatus(raw: unknown) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

export async function GET(req: NextRequest) {
  const authz = await requireApiPermission({
    permission: 'portfolio:full',
    action: 'MARKET_SCANS_READ',
    request: req,
  });
  if (!authz.ok) return authz.response;

  try {
    const sheets = await getServiceAccountClients();
    const spreadsheetId = await getSharedSpreadsheetId();
    const [rows, cashAvailable, proposals] = await Promise.all([
      readMarketScans(sheets, spreadsheetId),
      readCashBalance(sheets, spreadsheetId),
      listProposals(250),
    ]);
    const redis = getRedis();
    const status = redis ? parseStatus(await redis.get('pm:market-scans:status')) : null;
    const reservedBuyCash = computeAcceptedBuyReserve(proposals);
    return NextResponse.json({
      rows,
      status,
      proposalCash: {
        cashAvailable,
        reservedBuyCash,
        availableBuyCash: computeAvailableBuyCash(proposals, cashAvailable),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authz = await requireApiPermission({
    permission: 'research:run',
    action: 'MARKET_SCAN_SYNC',
    request: req,
  });
  if (!authz.ok) return authz.response;

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });

  const now = new Date().toISOString();
  await redis.set('pm:market_scan_trigger', '1', { ex: 120 });
  await redis.set('pm:market-scans:status', JSON.stringify({ state: 'queued', count: 0, error: null, updatedAt: now }), { ex: 3600 });

  return NextResponse.json({ ok: true, status: { state: 'queued', count: 0, error: null, updatedAt: now } }, { status: 202 });
}
