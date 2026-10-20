import assert from "node:assert/strict";
import test from "node:test";
import { stopProcessTree } from "../../src/process-control.js";

test("a process-group permission error still tries the owned process", { skip: process.platform === "win32" }, async (t) => {
  const targets: number[] = [];
  t.mock.method(process, "kill", (target: number, signal?: NodeJS.Signals | number) => {
    if (signal === 0) return true;
    targets.push(target);
    if (target < 0) throw Object.assign(new Error("group signal denied"), { code: "EPERM" });
    return true;
  });
  assert.equal(await stopProcessTree(4242), "sent");
  assert.deepEqual(targets, [-4242, 4242]);
});
