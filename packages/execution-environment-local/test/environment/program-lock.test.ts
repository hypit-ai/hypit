import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { tryProgramLock } from "../../src/program-lock.js";

test("Program ownership excludes another process and the OS releases it on owner exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-program-lock-"));
  const other = join(root, "other");
  await mkdir(other);
  const moduleUrl = new URL("../../src/program-lock.ts", import.meta.url).href;
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    const { tryProgramLock } = await import(${JSON.stringify(moduleUrl)});
    if (!tryProgramLock(process.argv[1])) throw new Error('unexpected owner');
    process.stdout.write('owned');
    setInterval(() => {}, 1000);
  `, root], { stdio: ["ignore", "pipe", "inherit"] });
  const exited = once(child, "exit");
  try {
    await once(child.stdout, "data");
    assert.equal(tryProgramLock(root), undefined);
    const unrelated = tryProgramLock(other);
    assert.ok(unrelated, "unrelated Programs do not share a global lock");
    unrelated();
    child.kill("SIGKILL");
    await exited;
    const released = tryProgramLock(root);
    assert.ok(released, "an abandoned lock file needs no timeout, stale-owner repair or deletion");
    released();
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
    await rm(root, { recursive: true, force: true });
  }
});
