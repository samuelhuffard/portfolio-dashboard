import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { addAgentMemory } from "@/lib/agentMemory";
import { assertCashAvailableForAcceptance, getProposal, listProposals, updateProposalDecision, updateProposalFields, validateProposalPatch } from "@/lib/proposals";
import { getServiceAccountClients, getSharedSpreadsheetId, readCashBalance } from "@/lib/sheets";

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
      }
    }

    const proposal = await updateProposalDecision(id, body?.status, body?.note, authz.context.userId);
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    await addAgentMemory({
      agentId: proposal.agentId,
      scope: "agent",
      text:
        proposal.status === "ApprovedForBrokerReview"
          ? `Sam accepted this proposal style: ${proposal.side} ${proposal.ticker} for $${proposal.amountDollars}. Rationale: ${proposal.rationale.slice(0, 220)}`
          : `Sam rejected this proposal style: ${proposal.side} ${proposal.ticker} for $${proposal.amountDollars}. Rationale: ${proposal.rationale.slice(0, 220)}`,
      source: "proposal_decision",
      importance: proposal.status === "ApprovedForBrokerReview" ? 4 : 3,
    }).catch((err) => console.warn("[Proposals] failed to save decision memory:", err instanceof Error ? err.message : err));
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

    const proposal = await updateProposalFields(id, validated.patch);
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    return NextResponse.json({ proposal });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 400 });
  }
}
