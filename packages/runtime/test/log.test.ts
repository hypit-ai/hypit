import assert from "node:assert/strict";
import test from "node:test";

import { readExecutionLog } from "@hypit/runtime";

async function* bytes(text: string): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode(text);
}

test("execution log decoding reconstructs one owned event branch from an untrusted line", async () => {
  const view = await readExecutionLog(bytes(`${JSON.stringify({
    format: "hypit.execution-log@1",
    time: 1,
    command: "command:one",
    endpoint: "renderer",
    kind: "phase",
    phase: "rendering",
    extra: "not owned",
  })}\n`), 10);
  assert.deepEqual(view, {
    total: 1,
    records: [{
      format: "hypit.execution-log@1",
      time: 1,
      command: "command:one",
      endpoint: "renderer",
      kind: "phase",
      phase: "rendering",
    }],
  });
});
