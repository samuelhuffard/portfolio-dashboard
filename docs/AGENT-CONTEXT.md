# Portfolio Dashboard — Shared Agent Context

This repository is the Portfolio Manager dashboard and broker companion. Read it with the backend's canonical shared context: [`../portfolio-manager/docs/AGENT-CONTEXT.md`](../../portfolio-manager/docs/AGENT-CONTEXT.md).

## What this repository owns

- The Clerk-gated Next.js dashboard deployed on Vercel.
- The Mac execution companion, which verifies a signed approval before placing an order.
- The Jetson read-worker companion configuration, which performs broker reads only.

The dashboard never places orders. The read-worker never executes orders. Only the Mac execution companion can act on a properly signed approval, and Sam remains the sole order approver.

## Required reading

1. `CLAUDE.md` and this file.
2. The backend shared context and `ONBOARDING.md`.
3. Backend `INVARIANTS.md` and `CHANGE_MAP.md` before changing proposals, approvals, execution, ledgers, or investor-facing data.
4. Backend `RUNBOOK.md` before an operational or deployment change.

## Cross-repository contract

The backend repository's `contracts/` directory is canonical. This repository's `lib/contracts/` is a mechanically synchronized mirror. Change shared contracts in the backend first, run `npm run contracts:sync`, commit the corresponding changes in both repositories, and run the drift tests before deployment.

## Access and context maintenance

GitHub access to both Portfolio Manager repositories provides code context. It does not provide Vercel, Neon, Jetson, broker, Sheets, or Upstash access. Use individual accounts and least privilege for any infrastructure access; never share infrastructure tokens or broker credentials with collaborators or encode them in agent context.

For shared operational knowledge, update the appropriate canonical backend document: `ARCHITECTURE.md`, `CHANGE_MAP.md`, `INVARIANTS.md`, `RUNBOOK.md`, `TEST_PLAN.md`, `RISK_REGISTER.md`, or `portfolio-master-plan.md`. Do not make Sam's private local memory vault the only place a collaborator would need to consult.

Last reviewed: 2026-08-01.
