# Read-only demo readiness smoke

`npm run smoke:core` checks the seven manager-facing demo routes and their
existing authenticated GET APIs. It emits a sanitized `demo-readiness-v1` JSON
report to stdout with route status, freshness/integrity assertions, safe
structural/projection fingerprints, aggregate proposal state, and non-sensitive
companion and agent status.

The check is synthetic/demo evidence only. It never reads or writes the Phase 0
observer record and must not be counted as organic observation evidence.

Provide a browser session cookie through the environment rather than a command
argument so it is not saved in shell history:

```sh
PORTFOLIO_SMOKE_BASE_URL=https://your-dashboard.example \
PORTFOLIO_SMOKE_COOKIE='__session=...' \
npm run smoke:core
```

`PORTFOLIO_SMOKE_MAX_AGE_MINUTES` defaults to 1,440 minutes. Use
`--allow-offline-companion` only for a local UI-only run; the default demo
readiness result fails when the companion heartbeat is offline or inconsistent.

The report deliberately omits tickers, names, emails, proposal IDs, rationale,
ledger rows, cash/NAV amounts, cookies, response bodies, and backend error text.
It uses short SHA-256 fingerprints of allowlisted structural projections. These
are not proof of a full response revision because private/value fields are
intentionally excluded. The target must be an HTTPS origin, except for exact
`localhost`/`127.0.0.1` development origins; it cannot contain credentials, a
query, a fragment, or a path. Failure details are local stable reason codes,
never upstream response or exception text.
