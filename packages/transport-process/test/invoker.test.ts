import assert from "node:assert/strict";
import test from "node:test";

import { ProcessJsonInvoker } from "@svml/transport-process";

test("process transport uses an absolute executable, no shell and no inherited environment", async () => {
  const script = [
    "let input = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', chunk => input += chunk);",
    "process.stdin.on('end', () => {",
    "  const value = JSON.parse(input);",
    "  process.stdout.write(JSON.stringify({ value, inherited: process.env.SVML_SHOULD_NOT_LEAK ?? null }));",
    "});",
  ].join("\n");
  const transport = new ProcessJsonInvoker({
    executable: process.execPath,
    args: ["-e", script],
    timeoutMs: 5_000,
  });
  const previous = process.env.SVML_SHOULD_NOT_LEAK;
  process.env.SVML_SHOULD_NOT_LEAK = "secret";
  try {
    assert.deepEqual(await transport.invoke({ hello: "world" }), {
      inherited: null,
      value: { hello: "world" },
    });
  } finally {
    if (previous === undefined) delete process.env.SVML_SHOULD_NOT_LEAK;
    else process.env.SVML_SHOULD_NOT_LEAK = previous;
  }
});

test("process transport enforces timeout and output bounds", async () => {
  const timeout = new ProcessJsonInvoker({
    executable: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    timeoutMs: 20,
  });
  await assert.rejects(timeout.invoke({}), /exceeded 20ms/u);

  const output = new ProcessJsonInvoker({
    executable: process.execPath,
    args: ["-e", "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('x'.repeat(1024)))"],
    timeoutMs: 5_000,
    maxOutputBytes: 32,
  });
  await assert.rejects(output.invoke({}), /output exceeded 32 bytes/u);
});
