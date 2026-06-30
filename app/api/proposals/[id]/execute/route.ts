import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getProposal } from "@/lib/proposals";
import { getValidToken, getAccountNumber, placeEquityOrder } from "@/lib/robinhood-mcp";
import { randomUUID } from "crypto";

const JETSON_BASE = (process.env.PORTFOLIO_BACKEND_URL ?? process.env.PORTFOLIO_MANAGER_URL ?? "https://jordan.samputer.xyz").trim();
const JETSON_SECRET = process.env.PORTFOLIO_WEBHOOK_SECRET?.trim() ?? "";

async function getLivePrice(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiPermission({
    permission: "approvals:manage",
    action: "PROPOSAL_EXECUTE",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action as "review" | "place" | undefined;

  if (action !== "review" && action !== "place") {
    return NextResponse.json({ error: "action must be 'review' or 'place'" }, { status: 400 });
  }

  const proposal = await getProposal(id);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (proposal.status !== "ApprovedForBrokerReview") {
    return NextResponse.json({ error: `Proposal must be in ApprovedForBrokerReview status; got ${proposal.status}` }, { status: 400 });
  }

  const token = await getValidToken();
  if (!token) {
    return NextResponse.json({ error: "Robinhood is not connected. Visit /api/robinhood/connect to authorize." }, { status: 403 });
  }

  const accountNumber = await getAccountNumber();
  if (!accountNumber) {
    return NextResponse.json({ error: "No Robinhood account found. Please reconnect via /api/robinhood/connect." }, { status: 403 });
  }

  const livePrice = await getLivePrice(proposal.ticker);

  // ── Review mode: return a preview without placing the order ──────────────────
  if (action === "review") {
    const shares = livePrice != null && livePrice > 0 ? Number((proposal.amountDollars / livePrice).toFixed(6)) : null;
    const maxPriceBreached =
      proposal.maxPrice != null && livePrice != null && livePrice > proposal.maxPrice;
    return NextResponse.json({
      proposal,
      livePrice,
      estimatedShares: shares,
      maxPriceBreached,
      accountNumber,
    });
  }

  // ── Place mode: execute the order ────────────────────────────────────────────
  if (proposal.maxPrice != null && livePrice != null && livePrice > proposal.maxPrice) {
    return NextResponse.json({
      error: `Live price $${livePrice} exceeds max price $${proposal.maxPrice}. Cancel or remove the limit to proceed.`,
    }, { status: 400 });
  }

  const shares = livePrice != null && livePrice > 0
    ? Number((proposal.amountDollars / livePrice).toFixed(6))
    : null;

  if (!shares || shares <= 0) {
    return NextResponse.json({ error: "Could not compute share quantity — live price unavailable." }, { status: 400 });
  }

  const refId = randomUUID();
  const orderArgs = {
    account_number: accountNumber,
    symbol: proposal.ticker,
    side: proposal.side.toLowerCase() as "buy" | "sell",
    quantity: shares,
    type: proposal.maxPrice != null ? ("limit" as const) : ("market" as const),
    ...(proposal.maxPrice != null ? { limit_price: proposal.maxPrice } : {}),
    ref_id: refId,
  };

  const orderResult = await placeEquityOrder(orderArgs, token);
  const orderId = orderResult.orderId;

  // Notify Jetson to record the trade and mark proposal fulfilled
  try {
    await fetch(`${JETSON_BASE}/record-trade`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${JETSON_SECRET}`,
      },
      body: JSON.stringify({
        proposalId: proposal.id,
        orderId,
        ticker: proposal.ticker,
        side: proposal.side,
        shares,
        price: livePrice ?? proposal.maxPrice ?? 0,
        agentId: proposal.agentId,
      }),
    });
  } catch (err) {
    console.error("[Execute] Jetson record-trade failed:", err instanceof Error ? err.message : err);
    // Non-fatal — order is placed, accounting will catch up
  }

  return NextResponse.json({ ok: true, orderId, shares, livePrice, proposal });
}
