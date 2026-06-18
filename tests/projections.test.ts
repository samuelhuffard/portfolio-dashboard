import { test } from "node:test";
import assert from "node:assert/strict";
import { projectNewsForRole, projectRecommendationForRole } from "../lib/projections";
import type { Recommendation } from "../lib/sheets";

const recommendation = {
  date: "2026-06-18",
  ticker: "MSFT",
  action: "BUY",
  quantScore: 82.5,
  rationale: "Strong quality compounder with improving AI infrastructure contribution.",
  newsLinks: "https://one.example, https://two.example, https://three.example, https://four.example",
  status: "Open",
  internalRuleCheck: "manager-only",
} as Recommendation & { internalRuleCheck: string };

test("FundManager recommendation projection preserves the current response shape", () => {
  const projected = projectRecommendationForRole(recommendation, "FundManager");
  assert.equal((projected as Recommendation & { internalRuleCheck?: string }).internalRuleCheck, "manager-only");
  assert.equal(projected.newsLinks.split(",").length, 4);
});

test("Client recommendation projection keeps public fields and limits news links", () => {
  const projected = projectRecommendationForRole(recommendation, "Client") as Recommendation & {
    internalRuleCheck?: string;
  };

  assert.deepEqual(Object.keys(projected), [
    "date",
    "ticker",
    "action",
    "quantScore",
    "rationale",
    "newsLinks",
    "status",
  ]);
  assert.equal(projected.internalRuleCheck, undefined);
  assert.equal(projected.newsLinks.split(",").length, 3);
});

test("Client news projection returns a lighter catalyst feed", () => {
  const clientNews = projectNewsForRole([recommendation], "Client");
  const managerNews = projectNewsForRole([recommendation], "FundManager");

  assert.equal(clientNews[0].links.length, 3);
  assert.equal(managerNews[0].links.length, 4);
});
