import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { holdingRowLabel, isHoldingMarkerRow, isSecurityHoldingRow } from "../lib/holdingRows";
import {
  RESEARCH_DATA_STATUS_FIELDS,
  SHADOW_SELECTION_REASON_CODES,
  SHADOW_SELECTION_STATUS_FIELDS,
} from "../lib/research-data-health";

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, "../../portfolio-manager");

async function backendModule(relativePath: string) {
  const path = join(backendRoot, relativePath);
  assert.ok(existsSync(path), `Expected Portfolio Manager sibling module at ${path}`);
  return import(pathToFileURL(path).href);
}

test("backend and dashboard Holdings classifiers have identical behavior", async () => {
  const backend = await backendModule("lib/holdings-rows.js");
  const fixtures: unknown[] = [
    "", "  ", "Cash", " cAsH ", "Last synced: 2026-07-13",
    "Synced via Robinhood Agentic MCP", " synced via robinhood agentic mcp ",
    "⚠️ Sample data — preview only", "NVDA", " BRK.B ", "BF-B",
    "Total Portfolio Value", ["NVDA"], [" Last synced: now "], null,
  ];
  for (const fixture of fixtures) {
    assert.equal(holdingRowLabel(fixture), backend.holdingRowLabel(fixture), `label drift for ${JSON.stringify(fixture)}`);
    assert.equal(isHoldingMarkerRow(fixture), backend.isHoldingMarkerRow(fixture), `marker drift for ${JSON.stringify(fixture)}`);
    assert.equal(isSecurityHoldingRow(fixture), backend.isSecurityHoldingRow(fixture), `security drift for ${JSON.stringify(fixture)}`);
  }
});

test("backend privacy allow-lists and dashboard status types stay in lockstep", async () => {
  const backend = await backendModule("lib/research-status-contract.js");
  assert.deepEqual([...RESEARCH_DATA_STATUS_FIELDS], [...backend.RESEARCH_DATA_STATUS_FIELDS]);
  assert.deepEqual([...SHADOW_SELECTION_STATUS_FIELDS], [...backend.SHADOW_SELECTION_STATUS_FIELDS]);
  assert.deepEqual([...SHADOW_SELECTION_REASON_CODES], [...backend.SHADOW_SELECTION_REASON_CODES]);

  const forbidden = /ticker|symbol|rationale|evidence|holding|investor|account|dollar/i;
  assert.equal(RESEARCH_DATA_STATUS_FIELDS.some((field) => forbidden.test(field)), false);
  assert.equal(SHADOW_SELECTION_STATUS_FIELDS.some((field) => forbidden.test(field)), false);
});
