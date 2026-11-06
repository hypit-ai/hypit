import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  commitNleEdit,
  completeNleProjectSave,
  createNleEditSession,
  createNleProject,
  isNleEditSessionDirty,
  prepareNleProjectSave,
} from "../src/index.js";
import { readNleProjectFile, writeNleProjectFile } from "../src/node/index.js";

test("the Node adapter atomically writes and reopens exact NLE JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-nle-project-"));
  try {
    const path = join(directory, "剪辑工程.nle.json");
    let session = createNleEditSession(createNleProject({
      id: "node-file",
      name: "Node file",
      canvas: { width: 1280, height: 720, clearColor: "black" },
    }), { saved: false });
    session = commitNleEdit(session, {
      label: "Add picture track",
      transaction: { revision: 0, commands: [{
        kind: "track.add",
        track: { id: "picture", name: "Picture", kind: "picture", locked: false, muted: false, items: [] },
      }] },
    });
    const ticket = prepareNleProjectSave(session);

    await writeNleProjectFile(path, ticket);
    session = completeNleProjectSave(session, ticket);
    assert.equal(isNleEditSessionDirty(session), false);
    assert.equal((await readFile(path, "utf8")).endsWith("\n"), true);

    const reopened = await readNleProjectFile(path);
    assert.deepEqual(reopened.current, session.current);
    assert.equal(reopened.history.length, 0);
    assert.equal(isNleEditSessionDirty(reopened), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
