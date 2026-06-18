# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-06-18] Client investor views must not expose pooled fund data**
   Do instead: when changing Client routes or APIs, verify Clients only receive their own capital account or intentional curated signals, never full fund holdings/totals unless explicitly approved.

## Shell & Command Reliability
1. **[2026-06-18] Next.js checks are the source of truth**
   Do instead: after TSX/API changes, run `npm run lint` and targeted tests instead of manually counting structure.

## Domain Behavior Guardrails
1. **[2026-06-18] Dashboard is research/accounting only**
   Do instead: keep execution, money movement, and trade-placement language out of dashboard APIs and UI.

## User Directives
1. **[2026-06-18] Do not store secrets in memory or runbooks**
   Do instead: record only env var names, deployment facts, and non-secret operational details.
