import assert from "node:assert/strict";
import test from "node:test";

import { openProcessInput, processEnvironment, runProcess } from "../src/process.js";

test("Windows HTML rasterizer children receive TEMP and process-creation variables, not Host secrets", () => {
  const previous = process.env.HYPIT_PRIVATE_ENV_PROBE;
  const previousTemp = process.env.TEMP;
  process.env.HYPIT_PRIVATE_ENV_PROBE = "secret";
  process.env.TEMP = "C:\\Windows\\Temp";
  try {
    const env = processEnvironment("win32");
    assert.equal(env.PATH, process.env.PATH);
    assert.equal(env.TEMP, "C:\\Windows\\Temp");
    assert.equal(env.HYPIT_PRIVATE_ENV_PROBE, undefined);
    assert.equal(env.HOME, undefined);
    assert.equal(env.TMPDIR, undefined);
  } finally {
    if (previous === undefined) delete process.env.HYPIT_PRIVATE_ENV_PROBE;
    else process.env.HYPIT_PRIVATE_ENV_PROBE = previous;
    if (previousTemp === undefined) delete process.env.TEMP;
    else process.env.TEMP = previousTemp;
  }
});

test("POSIX HTML rasterizer children receive TMPDIR without Host secrets", async () => {
  const previous = process.env.HYPIT_PRIVATE_ENV_PROBE;
  process.env.HYPIT_PRIVATE_ENV_PROBE = "secret";
  try {
    const env = processEnvironment("darwin");
    assert.equal(env.HYPIT_PRIVATE_ENV_PROBE, undefined);
    assert.equal(env.PATH, process.env.PATH);
    assert.equal(env.TMPDIR, process.env.TMPDIR);
    const { stdout } = await runProcess({
      executable: process.execPath,
      argv: ["-e", "process.stdout.write(JSON.stringify({ probe: process.env.HYPIT_PRIVATE_ENV_PROBE, path: Boolean(process.env.PATH) }))"],
      timeoutMs: 5_000,
      maxOutputBytes: 4_096,
    });
    const body = JSON.parse(Buffer.from(stdout).toString("utf8")) as { probe?: string; path: boolean };
    assert.equal(body.probe, undefined);
    assert.equal(body.path, true);
  } finally {
    if (previous === undefined) delete process.env.HYPIT_PRIVATE_ENV_PROBE;
    else process.env.HYPIT_PRIVATE_ENV_PROBE = previous;
  }
});

test("an input process consumes bounded incremental writes and settles after EOF", async () => {
  const child = openProcessInput({
    executable: process.execPath,
    argv: ["-e", "const chunks=[]; process.stdin.on('data', chunk => chunks.push(chunk)); process.stdin.on('end', () => process.stdout.write(Buffer.concat(chunks)))"],
    timeoutMs: 5_000,
    maxOutputBytes: 4_096,
  });
  await child.write(Buffer.from("ordered "));
  await child.write(Buffer.from("input"));
  const result = await child.close();
  assert.equal(Buffer.from(result.stdout).toString(), "ordered input");
});

test("an input process reports encoder exit instead of leaving writers pending", async () => {
  const child = openProcessInput({
    executable: process.execPath,
    argv: ["-e", "process.stderr.write('encoder failure'); process.exit(7)"],
    timeoutMs: 5_000,
    maxOutputBytes: 4_096,
  });
  await assert.rejects(child.completed, /exited 7: encoder failure/u);
});
