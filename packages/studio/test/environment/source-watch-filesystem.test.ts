import assert from "node:assert/strict";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSourceWatch } from "../../src/source-watch.js";

test("a filesystem Source watcher detects an atomic replacement save", async t => {
  const root = await mkdtemp(join(tmpdir(), "hypit-source-watch-"));
  const source = join(root, "main.svml");
  await writeFile(source, "before");
  let changed!: () => void;
  const event = new Promise<void>(resolve => { changed = resolve; });
  const watcher = createSourceWatch(changed, message => assert.fail(message));
  t.after(async () => { watcher.close(); await rm(root, { recursive: true, force: true }); });
  watcher.replace([source]);
  await writeFile(join(root, "replacement.tmp"), "after");
  await rename(join(root, "replacement.tmp"), source);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([event, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Source replacement was not observed")), 3000);
    })]);
  } finally {
    clearTimeout(timer);
  }
});
