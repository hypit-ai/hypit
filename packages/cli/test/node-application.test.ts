import assert from "node:assert/strict";
import test from "node:test";

import { runNodeCli } from "../src/node-application.js";

async function failingRun(argv: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const write = { stdout: process.stdout.write, stderr: process.stderr.write };
  const exitCode = process.exitCode;
  process.stdout.write = ((chunk: string) => { stdout += chunk; return true; }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => { stderr += chunk; return true; }) as typeof process.stderr.write;
  try {
    await runNodeCli(argv, async () => {
      throw Object.assign(new Error("Runtime Profile is missing"), { code: "RUNTIME_PROFILE_MISSING" });
    });
    assert.equal(process.exitCode, 1);
  } finally {
    process.stdout.write = write.stdout;
    process.stderr.write = write.stderr;
    process.exitCode = exitCode;
  }
  return { stdout, stderr };
}

test("a JSONL stream reports its failure as one machine record on stdout", async () => {
  const { stdout, stderr } = await failingRun(["activity", "--watch", "--jsonl"]);
  assert.equal(stderr, "");
  const lines = stdout.trimEnd().split("\n");
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]!) as { format: string; ok: boolean; error: { code: string } };
  assert.equal(record.format, "hypit.cli-error@1");
  assert.equal(record.ok, false);
  assert.equal(record.error.code, "RUNTIME_PROFILE_MISSING");
});

test("JSON and human failures keep their streams", async () => {
  const json = await failingRun(["activity", "--json"]);
  assert.equal(json.stderr, "");
  assert.equal((JSON.parse(json.stdout) as { error: { code: string } }).error.code, "RUNTIME_PROFILE_MISSING");
  assert.match(json.stdout, /\n  "ok": false/u, "a single JSON document stays indented");
  const human = await failingRun(["activity"]);
  assert.equal(human.stdout, "");
  assert.match(human.stderr, /RUNTIME_PROFILE_MISSING/u);
});
