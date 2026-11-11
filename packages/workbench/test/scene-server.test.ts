import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createSceneProject,
  createSceneLoweringHost,
  parseSceneProject,
  serializeSceneProject,
  type SceneObject,
} from "@hypit/scene";
import { sceneMotionPackage } from "@hypit/scene-motion";
import { parseSceneView } from "@hypit/scene-view";

import type { SceneWorkbenchSnapshot } from "../src/index.js";
import { startSceneWorkbenchServer } from "../src/node/index.js";

async function responseJson(response: Response): Promise<SceneWorkbenchSnapshot> {
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return JSON.parse(text) as SceneWorkbenchSnapshot;
}

const actor: SceneObject = {
  id: "actor",
  name: "Actor",
  using: { module: { name: "@project/characters", version: "1" }, name: "actor" },
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
  },
  enabled: true,
  parameters: { asset: { path: "assets/scene/actor/actor.scene-asset.json" } },
};

const frames = (ticks: number) => ({ ticks: String(ticks), timeBase: { numerator: 1, denominator: 24 } });

test("opens one Scene document, serves its GLB observation and commits one transform gesture", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-workbench-scene-"));
  const projectFile = join(directory, "shot.scene.json");
  const assetDirectory = join(directory, "assets", "scene", "actor");
  const assetFile = join(assetDirectory, "model.glb");
  const previewFile = join(assetDirectory, "preview.glb");
  await mkdir(assetDirectory, { recursive: true });
  await writeFile(assetFile, Buffer.from([0x67, 0x6c, 0x54, 0x46]));
  await writeFile(previewFile, Buffer.from([0x70, 0x72, 0x65, 0x76]));
  await writeFile(join(assetDirectory, "actor.scene-asset.json"), JSON.stringify({
    format: "hypit.scene-asset@1",
    id: "actor",
    name: "Actor",
    using: { module: { name: "@project/characters", version: "1" }, name: "humanoid-character" },
    preview: { path: "preview.glb", mediaType: "model/gltf-binary" },
    resources: { model: { path: "model.glb", mediaType: "model/gltf-binary" } },
    parameters: { rigProfile: "mixamo-humanoid" },
  }));
  await writeFile(join(directory, "assets", "scene", "library.scene-library.json"), JSON.stringify({
    format: "hypit.scene-library@1",
    id: "project-assets",
    name: "Project Assets",
    collections: [{ id: "characters", label: "角色", icon: "person", children: [
      { id: "people", label: "基础人物", children: [] },
    ] }],
    entries: [{
      id: "actor",
      label: "Actor",
      asset: { path: "actor/actor.scene-asset.json" },
      collections: ["characters", "people"],
      tags: ["actor"],
    }],
  }));
  await writeFile(projectFile, serializeSceneProject(createSceneProject({
    id: "shot",
    name: "Opening Shot",
    libraries: [{ path: "assets/scene/library.scene-library.json" }],
    environment: {
      using: { module: { name: "@test/environment", version: "1" }, name: "environment" },
      parameters: {},
    },
    objects: [actor],
    cameras: [{
      id: "camera-main",
      name: "Camera 1",
      pose: {
        position: { x: 4, y: 3, z: 7 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      lens: { fov: 45, aspect: { numerator: 16, denominator: 9 } },
    }],
    performances: [{
      id: "main",
      name: "Main",
      duration: frames(120),
      tracks: [{
        id: "camera-motion",
        name: "Camera Motion",
        subject: { kind: "camera", ref: "camera-main" },
        items: [{
          id: "dolly",
          name: "Dolly",
          start: frames(0),
          duration: frames(120),
          enabled: true,
          using: { module: { name: "@hypit/scene-motion", version: "1" }, name: "camera-motion" },
          parameters: {
            kind: "dolly",
            distance: 1,
            aim: { kind: "point", position: { x: 0, y: 1, z: 0 } },
            easing: "linear",
          },
        }],
      }],
      shots: [{ id: "opening", name: "Opening", camera: "camera-main", start: frames(0), duration: frames(120) }],
    }],
  })));
  const server = await startSceneWorkbenchServer({
    projectFile,
    lowering: createSceneLoweringHost([sceneMotionPackage]),
  });
  try {
    const opened = await responseJson(await fetch(`${server.origin}/api/scene`));
    assert.equal(opened.performancePreviews[0]?.frames.length, 120);
    assert.notDeepEqual(
      opened.performancePreviews[0]?.frames[0]?.cameras["camera-main"]?.pose.position,
      opened.performancePreviews[0]?.frames.at(-1)?.cameras["camera-main"]?.pose.position,
    );
    const libraryModel = await fetch(`${server.origin}${opened.libraries[0]?.entries[0]?.preview?.resource ?? ""}`);
    assert.equal(libraryModel.status, 200);
    assert.equal(libraryModel.headers.get("content-type"), "model/gltf-binary");
    assert.deepEqual(new Uint8Array(await libraryModel.arrayBuffer()), new Uint8Array([0x70, 0x72, 0x65, 0x76]));
    assert.equal(opened.scene.objects[0]?.preview?.kind, "model");
    assert.equal(opened.dirty, true);
    const resource = opened.scene.objects[0]?.preview?.kind === "model"
      ? opened.scene.objects[0].preview.resource : "";
    const model = await fetch(`${server.origin}${resource}`);
    assert.equal(model.status, 200);
    assert.equal(model.headers.get("content-type"), "model/gltf-binary");
    assert.deepEqual(new Uint8Array(await model.arrayBuffer()), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
    await rm(assetFile);
    assert.equal((await fetch(`${server.origin}${resource}`)).status, 400);
    assert.equal((await fetch(`${server.origin}/api/scene`)).status, 200);

    const moved = await responseJson(await fetch(`${server.origin}/api/scene/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Move Actor",
        transaction: { revision: 0, commands: [{
          kind: "object.transform.set",
          id: "actor",
          transform: { ...actor.transform, position: { x: 2, y: 0, z: -1 } },
        }] },
      }),
    }));
    assert.deepEqual(moved.project.objects[0]?.transform.position, { x: 2, y: 0, z: -1 });
    assert.equal(moved.canUndo, true);
    assert.equal(moved.undoLabel, "Move Actor");

    const locked = await responseJson(await fetch(`${server.origin}/api/scene/view-transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction: { revision: moved.view.revision, commands: [
        { kind: "object-state.set", object: "actor", locked: true },
      ] } }),
    }));
    assert.equal(locked.scene.objects[0]?.editable, false);
    const rejected = await fetch(`${server.origin}/api/scene/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Move locked Actor",
        transaction: { revision: moved.project.revision, commands: [{
          kind: "object.transform.set", id: "actor", transform: actor.transform,
        }] },
      }),
    });
    assert.equal(rejected.status, 400);

    const saved = await responseJson(await fetch(`${server.origin}/api/scene/save`, { method: "POST" }));
    assert.equal(saved.dirty, false);
    assert.equal(parseSceneProject(await readFile(projectFile, "utf8")).objects[0]?.transform.position.x, 2);
    assert.equal(parseSceneView(await readFile(server.viewFile, "utf8")).objects[0]?.locked, true);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
