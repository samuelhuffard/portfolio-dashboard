# portfolio-dashboard (dashboard + Mac executor)

Next.js 16 / React 19 / Tailwind 4 / TS dashboard on Vercel (Clerk auth, dark "Portfolio OS" theme) **plus** the Mac trade executor (`scripts/mac-companion.mjs` + pure logic in `scripts/companion-core.mjs`, PM2 `portfolio-executor`). **Real money: the executor places live Robinhood orders from signed approvals.**

## Read first

System docs live in the backend repo: `../portfolio-manager/docs/` — `ONBOARDING.md` (new here), `CHANGE_MAP.md` (before any change), `INVARIANTS.md` (before touching proposals/approvals/executor/investor views), `RUNBOOK.md` (ops).

## Hard rules

- Every `app/api/**` route starts with `requireApiPermission` (permission + audit action) — zero exceptions. New audit actions go in the `AuditAction` union in `lib/audit.ts`.
- FundManager = Clerk `publicMetadata.role` AND `FUND_MANAGER_EMAILS`. Clients never see pooled-fund data (`lib/client-access.ts` is a fail-closed allowlist — new pages are manager-only by default).
- Approvals are signed. The signature payload + HMAC are single-source in `lib/contracts/signature.js` (a mirror of `../portfolio-manager/contracts/`, synced by `npm run contracts:sync`, drift-tested by `tests/contracts-drift.test.ts`); `lib/proposals.ts`, `scripts/companion-core.mjs`, and the backend all delegate to it, and `tests/companion-core.test.ts` still cross-checks they agree. Change the payload only in `contracts/signature.js`.
- Proposal enums/limits/validation and lot ownership are likewise shared in `lib/contracts/`. The `AllocationProposal` shape stays a local interface but `tests/proposal-shape.test.ts` pins its field set to the shared `ProposalSchema` — see the checklist in `../portfolio-manager/docs/CHANGE_MAP.md`.
- Executor changes: keep the ordering (verify signature → `Executing` marker → order with `ref_id = proposal.id` → ledger record → fulfill; unknown outcomes reconcile against the broker, never re-execute). Pure logic goes in `companion-core.mjs` so it stays testable.
- Dashboard never places orders itself and keeps working when the Jetson is down (only `/api/scan` + alerts proxy to :3200) — preserve both properties.

## Verify + deploy

`npm test && npm run lint && npm run build` (lint = `tsc --noEmit`). Deploy: `npx vercel --prod --scope samuelhuffard-9533s-projects`; smoke: `/sign-in` 200, `/api/portfolio` 401 signed-out. Executor "deploy" = `git pull` + `pm2 restart portfolio-executor --update-env` on the Mac (needs a `../portfolio-manager` sibling checkout with `.env`).
