import { test } from "node:test";
import assert from "node:assert/strict";
import { getLocalPreviewRole } from "../lib/local-preview";

test("local preview is available only while developing locally", () => {
  assert.equal(getLocalPreviewRole({ NODE_ENV: "development" }), "FundManager");
});

test("local preview cannot be enabled in production", () => {
  assert.equal(
    getLocalPreviewRole({ NODE_ENV: "production", PORTFOLIO_LOCAL_PREVIEW_ROLE: "FundManager" }),
    null,
  );
});
