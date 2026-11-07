import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyNleTransaction,
  commitNleEdit,
  completeNleProjectSave,
  createNleEditSession,
  createNleProject,
  isNleEditSessionDirty,
  prepareNleProjectSave,
} from "../src/index.js";
import { createNodeNleMediaResolver, readNleProjectFile, writeNleProjectFile } from "../src/node/index.js";

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

test("media files open explicitly after the project and are cached by file path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-nle-media-"));
  try {
    await mkdir(join(directory, "media"));
    const base = createNleProject({ id: "media-files", name: "Media files" });
    const project = applyNleTransaction(base, { revision: 0, commands: [
      { kind: "media.add", media: { id: "left", name: "Left", asset: { path: "./media/shared.media.json" } } },
      { kind: "media.add", media: { id: "right", name: "Right", asset: { path: "./media/shared.media.json" } } },
    ] });
    const opened: string[] = [];
    const media = {
      id: "shared",
      source: { kind: "blob" as const, resource: "res_nle-node-media" as const,
        size: 1, mediaType: "image/png" },
      picture: {
        kind: "constant" as const,
        streamIndex: 0,
        interpretation: {
          codedWidth: 1, codedHeight: 1,
          sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0 as const,
          picture: { colorPrimaries: "bt709" as const, colorTransfer: "srgb" as const,
            colorMatrix: "rgb" as const, colorRange: "full" as const, bitDepth: 8 as const,
            alphaMode: "opaque" as const },
        },
      },
    };
    const resolver = await createNodeNleMediaResolver(join(directory, "edit.nle.json"), project,
      async (path) => { opened.push(path); return media; });
    assert.equal(opened.length, 1);
    assert.equal(opened[0], join(directory, "media", "shared.media.json"));
    const left = project.media[0]!;
    assert.equal(resolver(left, { project, track: undefined as never, item: undefined as never }).id, "shared");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
