import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { createProposal, listProposals, validateProposalInput } from "@/lib/proposals";

export async function GET(req: Request) {
  const authz = await requireApiPermission({
    permission: "approvals:manage",
    action: "APPROVAL_QUEUE_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  try {
    const proposals = await listProposals();
    return NextResponse.json({ proposals });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authz = await requireApiPermission({
    permission: "approvals:manage",
    action: "PROPOSAL_CREATE",
    request: req,
  });
  if (!authz.ok) return authz.response;

  try {
    const body = await req.json();
    const validated = validateProposalInput(body);
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

    const proposal = await createProposal(validated, authz.context.userId, authz.context.email);
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
