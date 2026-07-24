import { test } from "node:test";
import assert from "node:assert/strict";
import { closeChildStdin, execFileWithClosedStdin } from "../scripts/claude-cli.mjs";

test("Claude CLI launcher closes stdin before awaiting the command result", async () => {
  let ended = 0;
  let receivedOptions: object | undefined;
  let callback: ((error: Error | null, stdout: string, stderr: string) => void) | undefined;
  const child = { stdin: { destroyed: false, writableEnded: false, end: () => { ended += 1; } } };
  const execFileStub = (_file: string, _args: string[], _options: object, done: typeof callback) => {
    receivedOptions = _options;
    callback = done;
    return child;
  };

  const result = execFileWithClosedStdin(execFileStub, "claude", ["-p", "hello"], {});
  assert.equal(ended, 1, "stdin must be closed immediately for claude -p");
  callback?.(null, "done", "");
  assert.deepEqual(await result, { stdout: "done", stderr: "" });
  assert.deepEqual(receivedOptions, {});
});

test("closing stdin is safe when the child does not expose a writable pipe", () => {
  assert.equal(closeChildStdin({}), false);
  assert.equal(closeChildStdin({ stdin: { destroyed: true, writableEnded: false, end: () => assert.fail("must not end") } }), false);
  assert.equal(closeChildStdin({ stdin: { destroyed: false, writableEnded: true, end: () => assert.fail("must not end") } }), false);
});
