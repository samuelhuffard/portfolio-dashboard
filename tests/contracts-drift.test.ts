import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

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
// CI checks out the canonical backend below GITHUB_WORKSPACE; normal local
// runs keep the sibling-checkout convention. An explicit absolute override is
// allowed for review worktrees, but never to the shipped mirror itself.
const canonicalDir = process.env.PORTFOLIO_MANAGER_CONTRACTS_DIR
  ? resolve(process.env.PORTFOLIO_MANAGER_CONTRACTS_DIR)
  : process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_WORKSPACE
    ? resolve(process.env.GITHUB_WORKSPACE, "portfolio-manager/contracts")
    : resolve(here, "../../portfolio-manager/contracts");

function sameOrNested(child: string, parent: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

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
  assert.ok(contractFiles(canonicalDir).length > 0, "Canonical contracts directory is empty.");
});

test("canonical contracts cannot be the dashboard mirror", () => {
  assert.equal(
    sameOrNested(canonicalDir, mirrorDir),
    false,
    "PORTFOLIO_MANAGER_CONTRACTS_DIR must point to an independent backend checkout, never lib/contracts."
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
