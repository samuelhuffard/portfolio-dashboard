import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { updateProposalDecision } from "@/lib/proposals";

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
    const proposal = await updateProposalDecision(id, body?.status, body?.note, authz.context.userId);
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    return NextResponse.json({ proposal });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 400 });
  }
}
