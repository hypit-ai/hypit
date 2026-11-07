import assert from "node:assert/strict";
import test from "node:test";

import { runBoundedMediaProcess } from "../src/process.js";

test("an import Host can abort an in-flight local media process", async () => {
  const controller = new AbortController();
  const pending = runBoundedMediaProcess({
    executable: process.execPath,
    argv: ["-e", "setTimeout(() => {}, 10000)"],
    timeoutMs: 20_000,
    maxStdoutBytes: 1024,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(new Error("cancel import")), 20);
  await assert.rejects(pending, /cancel import/u);
});
