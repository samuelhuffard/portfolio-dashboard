import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { addAgentMemory } from "@/lib/agentMemory";
import {
  assertCashAvailableForAcceptance,
  assertCashAvailableForBuyProposal,
  computeSellOwnerShareLimit,
  getProposal,
  listProposals,
  NO_REASON_REJECTION,
  updateProposalDecision,
  updateProposalFields,
  validateProposalPatch,
} from "@/lib/proposals";
import { getServiceAccountClients, getSharedSpreadsheetId, readCashBalance, readHoldingsDetail, readLots } from "@/lib/sheets";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiPermission({
    permission: "approvals:manage",
    action: "APPROVAL_DECISION",
    request: req,
  });
  if (!authz.ok) return authz.response;

  try {
    const { id } = await params;
    const body = await req.json();
    let sellOwnerShareLimit: number | null = null;
    if (body?.status === "ApprovedForBrokerReview") {
      const current = await getProposal(id);
      if (!current) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

      if (current.side === "BUY") {
        const [proposals, sheets, spreadsheetId] = await Promise.all([
          listProposals(250),
          getServiceAccountClients(),
          getSharedSpreadsheetId(),
        ]);
        const cashAvailable = await readCashBalance(sheets, spreadsheetId);
        assertCashAvailableForAcceptance(current, proposals, cashAvailable);
      } else if (current.side === "SELL") {
        const [sheets, spreadsheetId] = await Promise.all([
          getServiceAccountClients(),
          getSharedSpreadsheetId(),
        ]);
        const [lots, holdings] = await Promise.all([
          readLots(sheets, spreadsheetId),
          readHoldingsDetail(sheets, spreadsheetId),
        ]);
        sellOwnerShareLimit = computeSellOwnerShareLimit(current, lots, holdings);
      }
    }

    const proposal = await updateProposalDecision(
      id,
      body?.status,
      body?.note,
      authz.context.userId,
      { sellOwnerShareLimit },
    );
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    // "No reason" is Sam explicitly opting out of giving the agent anything to learn from —
    // skip the memory write entirely rather than recording an empty/placeholder lesson.
    const skipMemory = proposal.status === "Rejected" && proposal.decisionNote === NO_REASON_REJECTION;
    if (!skipMemory) {
      await addAgentMemory({
        agentId: proposal.agentId,
        scope: "agent",
        text:
          proposal.status === "ApprovedForBrokerReview"
            ? `Sam accepted this proposal style: ${proposal.side} ${proposal.ticker} for $${proposal.amountDollars}. Rationale: ${proposal.rationale.slice(0, 220)}`
            : `Sam rejected this proposal style: ${proposal.side} ${proposal.ticker} for $${proposal.amountDollars}. Reason: ${proposal.decisionNote || "not given"}. Rationale: ${proposal.rationale.slice(0, 220)}`,
        source: "proposal_decision",
        category: "investment",
        importance: proposal.status === "ApprovedForBrokerReview" ? 4 : 3,
      }).catch((err) => console.warn("[Proposals] failed to save decision memory:", err instanceof Error ? err.message : err));
    }
    return NextResponse.json({ proposal });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 400 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiPermission({
    permission: "approvals:manage",
    action: "PROPOSAL_EDIT",
    request: req,
  });
  if (!authz.ok) return authz.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const validated = validateProposalPatch(body);
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

    const current = await getProposal(id);
    if (!current) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    const candidate = { ...current, ...validated.patch };

    if (candidate.side === "BUY") {
      const [proposals, sheets, spreadsheetId] = await Promise.all([
        listProposals(250),
        getServiceAccountClients(),
        getSharedSpreadsheetId(),
      ]);
      const cashAvailable = await readCashBalance(sheets, spreadsheetId);
      assertCashAvailableForBuyProposal(candidate, proposals, cashAvailable);
    }

    const proposal = await updateProposalFields(id, validated.patch);
    return NextResponse.json({ proposal });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 400 });
  }
}
