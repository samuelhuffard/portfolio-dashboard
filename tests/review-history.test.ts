import test from 'node:test';
import assert from 'node:assert/strict';
import { sortReviewAudits, type ReviewAudit } from '@/lib/review-history';

function audit(overrides: Partial<ReviewAudit>): ReviewAudit {
  return {
    schemaVersion: 'research-decision-audit-v1', source: 'legacy_recommendation_sheet', runId: 'legacy', agentId: 'agent-1', ticker: 'ZZZ', decidedAt: '2026-07-20T12:00:00.000Z', quantScore: null,
    generatorAction: 'HOLD', finalAction: 'HOLD', evaluatorState: 'not_recorded_legacy', evaluatorVerdict: 'not recorded', evaluatorCritique: [], evaluatorRevisions: 0,
    proposalDisposition: 'legacy_recommendation_record', proposalId: null, reason: null, ruleCheck: [], generatorThesis: null, finalThesis: null, rationale: null,
    requestedTargetWeight: null, finalTargetWeight: null, kairosOutcome: 'not_recorded_legacy', kairosExplanation: [], ...overrides,
  };
}

test('review history sorts date and score with missing values last', () => {
  const rows = [
    audit({ ticker: 'B', decidedAt: '2026-07-19T12:00:00.000Z', quantScore: 62 }),
    audit({ ticker: 'A', decidedAt: '2026-07-21T12:00:00.000Z', quantScore: 84 }),
    audit({ ticker: 'C', decidedAt: 'unknown', quantScore: null }),
  ];
  assert.deepEqual(sortReviewAudits(rows, 'date', 'desc').map((row) => row.ticker), ['A', 'B', 'C']);
  assert.deepEqual(sortReviewAudits(rows, 'score', 'desc').map((row) => row.ticker), ['A', 'B', 'C']);
});

test('review history orders proposal type and company in either direction', () => {
  const rows = [audit({ ticker: 'MSFT', finalAction: 'SELL' }), audit({ ticker: 'AAPL', finalAction: 'BUY' }), audit({ ticker: 'GOOG', finalAction: 'HOLD' })];
  assert.deepEqual(sortReviewAudits(rows, 'action', 'asc').map((row) => row.finalAction), ['BUY', 'SELL', 'HOLD']);
  assert.deepEqual(sortReviewAudits(rows, 'company', 'asc').map((row) => row.ticker), ['AAPL', 'GOOG', 'MSFT']);
  assert.deepEqual(sortReviewAudits(rows, 'company', 'desc').map((row) => row.ticker), ['MSFT', 'GOOG', 'AAPL']);
});
