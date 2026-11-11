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
  nleLinearSourceTime,
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
        track: { id: "picture", name: "Picture", kind: "picture", muted: false, items: [] },
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
    await mkdir(join(directory, "edits"));
    const base = createNleProject({ id: "media-files", name: "Media files" });
    const second = { ticks: "1", timeBase: { numerator: 1, denominator: 1 } } as const;
    const project = applyNleTransaction(base, { revision: 0, commands: [{
      kind: "track.add",
      track: { id: "picture", name: "Picture", kind: "picture", muted: false, items: ["left", "right"].map((id) => ({
        id, kind: "present" as const, source: "media" as const,
        asset: { path: "../media/shared.media.json" },
        start: { ticks: "0", timeBase: second.timeBase }, duration: second,
        sourceTime: nleLinearSourceTime(second), enabled: true,
        picture: { layout: { x: 0, y: 0, width: 1, height: 1, fit: "fill" as const } },
      })) },
    }] });
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
    const resolver = await createNodeNleMediaResolver(directory, join(directory, "edits", "edit.nle.json"), project,
      async (path) => { opened.push(path); return media; });
    assert.equal(opened.length, 1);
    assert.equal(opened[0], join(directory, "media", "shared.media.json"));
    const left = project.tracks[0]!.items[0]!;
    if (left.kind !== "present" || left.source !== "media") throw new Error("Media fixture is invalid.");
    assert.equal(resolver(left.asset, { project, track: project.tracks[0]!, item: left }).id, "shared");
    const outside = applyNleTransaction(project, { revision: project.revision, commands: [{
      kind: "item.replace",
      item: { ...left, asset: { path: "../../outside.media.json" } },
    }] });
    await assert.rejects(createNodeNleMediaResolver(
      directory,
      join(directory, "edits", "edit.nle.json"),
      outside,
      async () => media,
    ), /leaves the application Project Root/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
