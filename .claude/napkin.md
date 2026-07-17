# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-07-17] Scheduled broker reads must not depend on Mac availability**
   Do instead: run the Jetson companion with `COMPANION_ROLE=read-worker` and the Mac companion with `COMPANION_ROLE=execution`; keep `portfolio-keepawake` only as temporary execution-host protection.
1. **[2026-07-15] A clean deployment worktree must include the full user-visible fix set**
   Do instead: before a direct Vercel deploy from an older base, compare it with `main` for dependent chart/page commits and deploy the smallest complete set, not merely the triggering API fix.
1. **[2026-06-18] Client investor views must not expose pooled fund data**
   Do instead: when changing Client routes or APIs, verify Clients only receive their own capital account or intentional curated signals, never full fund holdings/totals unless explicitly approved.

## Shell & Command Reliability
1. **[2026-07-15] Claude stream JSON omits tool-input chunks unless explicitly requested**
   Do instead: for auditable MCP reads, pass `--include-partial-messages`, reconstruct only complete `input_json_delta` payloads, and retain strict account binding.
1. **[2026-06-18] Next.js checks are the source of truth**
   Do instead: after TSX/API changes, run `npm run lint` and targeted tests instead of manually counting structure.

## Domain Behavior Guardrails
1. **[2026-06-18] Dashboard is research/accounting only**
   Do instead: keep execution, money movement, and trade-placement language out of dashboard APIs and UI.
2. **[2026-06-29] Pending proposals are alternatives**
   Do instead: allow all agents to propose against the shared cash pool, but block accepting BUYs when accepted unfilled BUYs already reserve the available cash.
3. **[2026-06-29] Agent memory feeds proposal scans**
   Do instead: store durable agent preferences/feedback under `pm:agent-memory:*` and keep chat/proposal decision memories global to the agent when future backend scans should see them.

## User Directives
1. **[2026-06-18] Do not store secrets in memory or runbooks**
   Do instead: record only env var names, deployment facts, and non-secret operational details.
