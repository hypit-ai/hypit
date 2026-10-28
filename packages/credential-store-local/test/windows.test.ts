import assert from "node:assert/strict";
import childProcess from "node:child_process";
import type { ChildProcess, ExecFileOptionsWithStringEncoding } from "node:child_process";
import { once } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { credentialRef } from "@hypit/runtime";
import { OsCredentialStore } from "../src/os.js";
import { windowsCredential } from "../src/windows.js";

test("an oversized bridge response terminates the child and keeps secret output out of the error", async t => {
  const execFile = childProcess.execFile;
  const systemRoot = process.env.SystemRoot;
  process.env.SystemRoot = systemRoot ?? "C:\\Windows";
  let child: ChildProcess | undefined;
  let closed: Promise<unknown> | undefined;
  const launch = t.mock.method(childProcess, "execFile", (
    _command: string, _args: readonly string[], options: ExecFileOptionsWithStringEncoding,
    callback: (error: childProcess.ExecFileException | null, stdout: string, stderr: string) => void,
  ) => {
    child = execFile(process.execPath, ["-e", 'process.stdin.resume(); process.stdout.write("secret".repeat(800000)); setInterval(() => {}, 1000);'], options, callback);
    closed = once(child, "close");
    return child;
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(windowsCredential("read", "test", "test"), error => {
      assert.match(String(error), /Windows credential read.*failed/u);
      assert.doesNotMatch(String(error), /secret/u);
      return true;
    });
    await closed;
    assert.equal(child?.killed, true);
  } finally {
    launch.mock.restore(); syncBuiltinESMExports(); child?.kill();
    if (systemRoot === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = systemRoot;
  }
});

test("Windows locker replaces credentials and retains the previous value if replacement fails", {
  skip: process.platform !== "win32", timeout: 60_000,
}, async () => {
  const store = new OsCredentialStore({ service: `hypit-test-${randomUUID()}` });
  const ref = credentialRef("os", "replacement");
  try {
    await store.put(ref, { secret: "original" });
    await store.put(ref, { secret: "updated" });
    assert.deepEqual(await store.resolve(ref), { secret: "updated" });
    await assert.rejects(store.put(ref, { secret: "x".repeat(32_000) }));
    assert.deepEqual(await store.resolve(ref), { secret: "updated" });
    assert.equal(await store.delete(ref), true);
    assert.equal(await store.resolve(ref), undefined);
  } finally { await store.delete(ref); }
});
