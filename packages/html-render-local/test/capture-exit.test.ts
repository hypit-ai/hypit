import assert from "node:assert/strict";
import test from "node:test";

const counts = () => ({
  exit: process.listenerCount("exit"),
  sigterm: process.listenerCount("SIGTERM"),
  sigint: process.listenerCount("SIGINT"),
  uncaught: process.listenerCount("uncaughtExceptionMonitor"),
});

test("importing local HTML execution does not install worker process hooks", async () => {
  const before = counts();
  const execution = await import("../src/index.js");
  assert.deepEqual(counts(), before);

  const release = execution.installCaptureExitCleanup();
  assert.deepEqual(counts(), {
    exit: before.exit + 1,
    sigterm: before.sigterm + 1,
    sigint: before.sigint + 1,
    uncaught: before.uncaught + (process.platform === "win32" ? 1 : 0),
  });
  release();
  assert.deepEqual(counts(), before);
});
