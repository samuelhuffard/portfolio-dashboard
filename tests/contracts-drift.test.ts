import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// The cross-repo contract guard. `lib/contracts/` is a mechanically generated
// mirror of ../portfolio-manager/contracts/ (produced by `npm run contracts:sync`
// in the backend repo). Vercel cannot import the backend repo at build time, so
// the dashboard ships this copy — and this test fails `npm test` if it ever
// drifts from canonical. Same cross-repo pattern as companion-core.test.ts.
//
// If this fails: run `npm run contracts:sync` in ../portfolio-manager and commit
// the updated lib/contracts/ files. Never hand-edit lib/contracts/.

const here = dirname(fileURLToPath(import.meta.url));
const mirrorDir = resolve(here, "../lib/contracts");
const canonicalDir = resolve(here, "../../portfolio-manager/contracts");

function contractFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((n) => n.endsWith(".js") && !n.endsWith(".test.js") && n !== "sync.mjs")
    .sort();
}

test("canonical contracts repo is present as a sibling checkout", () => {
  assert.ok(
    existsSync(canonicalDir),
    `Expected canonical contracts at ${canonicalDir}. Check out portfolio-manager as a sibling.`
  );
});

test("mirror contains exactly the canonical contract files", () => {
  assert.deepEqual(contractFiles(mirrorDir), contractFiles(canonicalDir));
});

test("every mirrored contract file is byte-identical to canonical", () => {
  for (const name of contractFiles(canonicalDir)) {
    const canonical = readFileSync(join(canonicalDir, name), "utf8");
    const mirror = readFileSync(join(mirrorDir, name), "utf8");
    assert.equal(
      mirror,
      canonical,
      `lib/contracts/${name} has drifted from canonical. Run \`npm run contracts:sync\` in ../portfolio-manager.`
    );
  }
});
