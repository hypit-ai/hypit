import assert from "node:assert/strict";
import childProcess from "node:child_process";
import type { ChildProcess, ExecFileOptionsWithStringEncoding } from "node:child_process";
import { once } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { windowsCredential } from "../src/windows.js";

// The child is controlled by the test; the real Windows credential host is covered in environment/.
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
