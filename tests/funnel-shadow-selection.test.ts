import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("funnel response and panel preserve aggregate-only shadow selection telemetry", () => {
  const route = readFileSync(new URL("../app/api/funnel/route.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../app/funnel/page.tsx", import.meta.url), "utf8");
  assert.match(route, /researchDataHealth/);
  assert.match(panel, /Shadow selection/);
  assert.match(panel, /Non-holding only/);
  assert.match(panel, /reasonCodeCounts/);
  assert.doesNotMatch(panel, /liveSlate|selectedTickers|rationales/);
});
