import assert from "node:assert/strict";
import test from "node:test";

import { replaceSourceFiles } from "../src/source-transaction.js";

test("a failed multi-file publish restores every file already replaced", async () => {
  const files = new Map<string, string>([["/work/a.svml", "old-a"], ["/work/b.svml", "old-b"]]);
  let failed = false;
  await assert.rejects(replaceSourceFiles(new Map([
    ["/work/a.svml", "new-a"],
    ["/work/b.svml", "new-b"],
  ]), {
    read: async (path) => files.get(path)!,
    write: async (path, text) => { files.set(path, text); },
    move: async (from, to) => {
      if (to === "/work/b.svml" && !failed) {
        failed = true;
        throw new Error("publish failed");
      }
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    remove: async (path) => { files.delete(path); },
  }), /publish failed/u);
  assert.equal(files.get("/work/a.svml"), "old-a");
  assert.equal(files.get("/work/b.svml"), "old-b");
});
