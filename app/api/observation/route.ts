import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { isObservationChecklistItemId } from "@/lib/observation-shared";
import {
  appendObservationUpdate,
  listObservationUpdates,
  readObservationDays,
  readObservationChecklist,
  summarizeObservationWindow,
  updateObservationChecklist,
} from "@/lib/observation";

export async function GET(req: NextRequest) {
  const authz = await requireApiPermission({
    permission: "portfolio:full",
    action: "OBSERVATION_READ",
    request: req,
  });
  if (!authz.ok) return authz.response;

  const [days, updates, checklist] = await Promise.all([readObservationDays(), listObservationUpdates(), readObservationChecklist()]);
  return NextResponse.json({
    window: summarizeObservationWindow(days),
    days,
    updates,
    checklist,
  });
}

export async function POST(req: NextRequest) {
  const authz = await requireApiPermission({
    permission: "strategy:write",
    action: "OBSERVATION_UPDATE_POST",
    request: req,
  });
  if (!authz.ok) return authz.response;

  let body: { text?: unknown; checklistItemId?: unknown; completed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    if (body.checklistItemId !== undefined) {
      if (!isObservationChecklistItemId(body.checklistItemId) || typeof body.completed !== "boolean") {
        return NextResponse.json({ error: "Checklist item and completed state are required." }, { status: 400 });
      }
      const checklist = await updateObservationChecklist({
        id: body.checklistItemId,
        completed: body.completed,
        updatedBy: authz.context.email ?? "FundManager",
      });
      return NextResponse.json({ checklist });
    }
    const update = await appendObservationUpdate({
      text: String(body?.text ?? ""),
      author: authz.context.email ?? "FundManager",
      userId: authz.context.userId,
    });
    return NextResponse.json({ update }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record update.";
    const status = /required|at most/.test(message) ? 400 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
