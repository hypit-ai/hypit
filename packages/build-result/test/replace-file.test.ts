import assert from "node:assert/strict";
import { mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { replaceFile } from "../src/replace-file.js";

test("file replacement publishes the exact destination name and preserves an open reader", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-replace-"));
  try {
    for (const name of ["result.json", ".writer.json", "素材 🎬.json"]) {
      const destination = join(directory, name);
      const temporary = join(directory, `${name}.part`);
      await writeFile(temporary, "first");
      await replaceFile(temporary, destination);
      assert.deepEqual(await readdir(directory), [name]);
      const reader = await open(destination, "r");
      try {
        await writeFile(temporary, "second");
        await replaceFile(temporary, destination);
        assert.equal(await readFile(destination, "utf8"), "second");
        assert.equal(await reader.readFile("utf8"), "first");
        assert.deepEqual(await readdir(directory), [name]);
      } finally {
        await reader.close();
      }
      await rm(destination);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
