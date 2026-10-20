import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import type { FSWatcher } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import test from "node:test";
import { createSourceWatch } from "../src/source-watch.js";

test("Source watches follow the current file closure and release unused directories", t => {
  const opened: { directory: string; listener: (event: string, filename: string | null) => void; closed: boolean }[] = [];
  t.mock.method(fs, "watch", (directory: string, listener: (event: string, filename: string | null) => void) => {
    const entry = { directory, listener, closed: false };
    opened.push(entry);
    return Object.assign(new EventEmitter(), { close() { entry.closed = true; } }) as FSWatcher;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const project = resolve("watch-project");
  let changes = 0;
  const watcher = createSourceWatch(() => changes++, message => assert.fail(message));
  watcher.replace([join(project, "main.svml"), join(project, "old.svs"),
    join(project, "imported", "script.svml"), "memory:script", "https://example.test/script.svml", "virtual/source"]);
  assert.deepEqual(opened.map(entry => entry.directory), [project, join(project, "imported")]);
  opened[0]!.listener("change", "unrelated.svml");
  assert.equal(changes, 0);
  opened[0]!.listener("rename", "main.svml");
  assert.equal(changes, 1, "replacement saves trigger the same change callback");
  watcher.replace([join(project, "main.svml"), join(project, "new.svs")]);
  assert.equal(opened.length, 2, "a still-used directory is retained");
  assert.equal(opened[1]!.closed, true);
  opened[0]!.listener("change", "old.svs");
  opened[1]!.listener("change", "script.svml");
  assert.equal(changes, 1, "removed dependencies and queued events from released watchers are ignored");
  opened[0]!.listener("change", "new.svs");
  opened[0]!.listener("rename", null);
  assert.equal(changes, 3);
  watcher.close();
  opened[0]!.listener("change", "main.svml");
  watcher.replace([join(project, "late.svml")]);
  assert.equal(changes, 3);
  assert.equal(opened.length, 2, "an in-flight compilation cannot reopen a closed watcher");
  assert.ok(opened.every(entry => entry.closed));
});

for (const failure of ["opening", "watching"] as const) {
  test(`Source watch failure while ${failure} reports the directory and does not retry`, t => {
    let opens = 0;
    let closed = false;
    const handle = Object.assign(new EventEmitter(), { close() { closed = true; } });
    t.mock.method(fs, "watch", () => {
      opens++;
      if (failure === "opening") throw new Error("EACCES: permission denied");
      return handle as FSWatcher;
    });
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    const warnings: string[] = [];
    const watcher = createSourceWatch(() => assert.fail("failed watcher must not emit changes"), message => warnings.push(message));
    const source = resolve("inaccessible-project", "main.svml");
    watcher.replace([source]);
    if (failure === "watching") handle.emit("error", new Error("EMFILE: too many open files"));
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0]!.includes(resolve("inaccessible-project")));
    assert.match(warnings[0]!, failure === "opening" ? /EACCES/ : /EMFILE/);
    assert.match(warnings[0]!, /Browser refresh does not recompile Sources; restart Studio/);
    watcher.replace([source]);
    assert.equal(opens, 1);
    assert.equal(warnings.length, 1);
    assert.equal(closed, failure === "watching");
    watcher.close();
  });
}
