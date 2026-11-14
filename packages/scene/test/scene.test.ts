import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SceneRevisionConflict,
  applySceneTransaction,
  canRedoSceneEdit,
  commitSceneEdit,
  createSceneEditSession,
  createSceneLoweringHost,
  createSceneProject,
  evaluateSceneProgramAt,
  findSceneObject,
  isSceneEditSessionDirty,
  lowerScenePerformance,
  parseSceneAssetDocument,
  parseSceneLibraryDocument,
  parseSceneProject,
  redoSceneEdit,
  serializeSceneProject,
  serializeSceneAssetDocument,
  serializeSceneLibraryDocument,
  sceneControlBehavior,
  undoSceneEdit,
  type SceneAssetDocument,
  type SceneLibraryDocument,
  type SceneObject,
} from "../src/index.js";

const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });

async function readModelDocument(path: string, mediaType: string) {
  const bytes = await readFile(path);
  if (mediaType === "model/gltf+json") return JSON.parse(bytes.toString("utf8")) as {
    materials?: { name?: string }[];
    nodes?: { name?: string }[];
  };
  assert.equal(mediaType, "model/gltf-binary");
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8").trimEnd()) as {
    materials?: { name?: string }[];
    nodes?: { name?: string }[];
  };
}

const actor: SceneObject = {
  id: "actor-main",
  name: "Actor",
  using: { module: { name: "@project/characters" }, name: "actor" },
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
  },
  enabled: true,
  parameters: { asset: { path: "scenes/assets/characters/actor/actor.scene-asset.json" } },
};

test("a Scene Asset owns explicit package-interpreted files", () => {
  const asset: SceneAssetDocument = {
    format: "hypit.scene-asset@1",
    id: "actor",
    name: "Actor",
    using: { module: { name: "@project/scene-assets" }, name: "humanoid-character" },
    resources: { model: { path: "model.gltf", mediaType: "model/gltf+json" } },
    parameters: { rigProfile: "hypit-humanoid" },
  };
  assert.deepEqual(parseSceneAssetDocument(serializeSceneAssetDocument(asset)), asset);
  assert.throws(() => parseSceneAssetDocument(JSON.stringify({ ...asset,
    resources: { model: { path: "../model.gltf", mediaType: "model/gltf+json" } },
  })), /parent segments/u);
});

test("a Scene Library owns arbitrary presentation collections rather than fixed categories", () => {
  const library: SceneLibraryDocument = {
    format: "hypit.scene-library@1",
    id: "project-assets",
    name: "Project Assets",
    collections: [{ id: "objects", label: "物体", children: [
      { id: "furniture", label: "家具", children: [] },
      { id: "production", label: "拍摄与舞台", children: [] },
    ] }],
    entries: [{
      id: "chair",
      label: "椅子",
      asset: { path: "props/chair/chair.scene-asset.json" },
      collections: ["objects", "furniture"],
      tags: ["椅子", "seat"],
    }],
  };
  assert.deepEqual(parseSceneLibraryDocument(serializeSceneLibraryDocument(library)), library);
  assert.throws(() => parseSceneLibraryDocument(JSON.stringify({ ...library, entries: [{
    ...library.entries[0], collections: ["objects", "unknown"],
  }] })), /missing Collection unknown/u);
});

test("the example Library resolves every generated asset and its model", async () => {
  const assetRoot = fileURLToPath(new URL("../examples/scenes/assets/", import.meta.url));
  const library = parseSceneLibraryDocument(await readFile(resolve(assetRoot, "library.scene-library.json"), "utf8"));
  const people = library.entries.filter((entry) => entry.collections.includes("people"));
  assert.ok(people.length >= 17, `expected a useful set of body structures, received ${people.length}`);

  for (const entry of library.entries) {
    const assetFile = resolve(assetRoot, entry.asset.path);
    const asset = parseSceneAssetDocument(await readFile(assetFile, "utf8"));
    assert.equal(asset.id, entry.id);
    if (asset.preview !== undefined) await access(resolve(dirname(assetFile), asset.preview.path));
    for (const resource of Object.values(asset.resources)) {
      const resourceFile = resolve(dirname(assetFile), resource.path);
      await access(resourceFile);
      if (resource.mediaType === "model/gltf+json") JSON.parse(await readFile(resourceFile, "utf8"));
    }
  }

  for (const entry of people) {
    const asset = parseSceneAssetDocument(await readFile(resolve(assetRoot, entry.asset.path), "utf8"));
    assert.ok(asset.preview !== undefined);
    assert.ok(asset.parameters !== null && typeof asset.parameters === "object" && !Array.isArray(asset.parameters));
    const parameters = asset.parameters as Record<string, unknown>;
    assert.ok(parameters.anthropometry !== null && typeof parameters.anthropometry === "object" && !Array.isArray(parameters.anthropometry));
    const anthropometry = parameters.anthropometry as Record<string, unknown>;
    assert.equal(anthropometry.basis, "observed figure landmarks for low-poly blocking");
    assert.equal(typeof anthropometry.statureM, "number");
    assert.equal(typeof anthropometry.headCount, "number");
    const headCount = anthropometry.headCount as number;
    if (anthropometry.ageBand === "toddler-2-3") assert.ok(headCount >= 4.5 && headCount <= 5.5);
    else if (anthropometry.ageBand === "child-8-9") assert.ok(headCount >= 5.5 && headCount <= 6.5);
    else if (anthropometry.ageBand === "adolescent") assert.ok(headCount >= 6.75 && headCount <= 7.5);
    else assert.ok(headCount >= 7 && headCount <= 8);
    const modelResource = asset.resources.model!;
    const model = await readModelDocument(
      resolve(dirname(resolve(assetRoot, entry.asset.path)), modelResource.path),
      modelResource.mediaType,
    );
    assert.ok(model.nodes?.some((node) => node.name?.toLowerCase().includes("nose")), `${entry.id} must expose a front-facing Nose node`);
    assert.ok((model.materials?.length ?? 0) >= 1, `${entry.id} must provide a visible mannequin material`);
  }
});

function project() {
  return createSceneProject({
    id: "stage",
    name: "Stage",
    environment: {
      using: { module: { name: "@test/environment" }, name: "environment" },
      parameters: {},
    },
    objects: [actor],
    cameras: [{
      id: "camera-main",
      name: "Camera 1",
      pose: {
        position: { x: 4, y: 3, z: 7 },
        rotation: {
          x: -0.11721816593195057,
          y: 0.2547732634625492,
          z: 0.031128976250639893,
          w: 0.9593651404120223,
        },
      },
      lens: { fov: 45, aspect: { numerator: 16, denominator: 9 } },
    }],
    performances: [{
      id: "main",
      name: "Main",
      duration: second(5),
      tracks: [{
        id: "actor-actions",
        name: "Actor actions",
        subject: { kind: "object", ref: "actor-main" },
        items: [{
          id: "walk",
          name: "Walk",
          start: second(0),
          duration: second(3),
          enabled: true,
          using: { module: { name: "@project/motions" }, name: "walk" },
          parameters: { speed: 1 },
        }],
      }, {
        id: "camera-actions",
        name: "Camera actions",
        subject: { kind: "camera", ref: "camera-main" },
        items: [{
          id: "dolly",
          name: "Dolly",
          start: second(0),
          duration: second(5),
          enabled: true,
          using: { module: { name: "@project/motions" }, name: "dolly" },
          parameters: { distance: 2 },
        }],
      }],
      shots: [{ id: "opening", name: "Opening", camera: "camera-main", start: second(0), duration: second(5) }],
    }],
  });
}

test("one Scene Project owns base state and local performances", () => {
  const value = project();
  const reopened = parseSceneProject(serializeSceneProject(value));
  assert.equal(reopened.objects[0]?.id, "actor-main");
  assert.equal(reopened.performances[0]?.tracks[0]?.items[0]?.id, "walk");
  assert.equal(Object.hasOwn(reopened, "mode"), false);
  assert.equal(Object.hasOwn(reopened, "playhead"), false);
  assert.equal(Object.hasOwn(reopened.objects[0]!, "locked"), false);
});

test("object and camera Behaviors lower to complete states on one exact Performance clock", () => {
  const value = project();
  const linear = (left: number, right: number, progress: { numerator: bigint; denominator: bigint }) =>
    left + (right - left) * Number(progress.numerator) / Number(progress.denominator);
  const host = createSceneLoweringHost([{ behaviors: [
    {
      behavior: { module: { name: "@project/motions" }, name: "walk" },
      resolve: (_item, context) => sceneControlBehavior({
        domain: context.domain,
        segments: [{
          range: { start: second(0), end: context.domain.duration },
          from: { kind: "object", transform: structuredClone(actor.transform) },
          to: { kind: "object", transform: { ...structuredClone(actor.transform), position: { x: 3, y: 0, z: 0 } } },
          interpolation: { kind: "linear" },
        }],
      }, [], (from, to, progress) => ({
        kind: "object",
        transform: {
          ...structuredClone(from.transform),
          position: {
            x: linear(from.transform.position.x, to.transform.position.x, progress),
            y: linear(from.transform.position.y, to.transform.position.y, progress),
            z: linear(from.transform.position.z, to.transform.position.z, progress),
          },
        },
      })),
    },
    {
      behavior: { module: { name: "@project/motions" }, name: "dolly" },
      resolve: (_item, context) => {
        const camera = value.cameras[0]!;
        return sceneControlBehavior({
          domain: context.domain,
          segments: [{
            range: { start: second(0), end: context.domain.duration },
            from: { kind: "camera", pose: structuredClone(camera.pose), lens: structuredClone(camera.lens) },
            to: {
              kind: "camera",
              pose: { ...structuredClone(camera.pose), position: { x: 2, y: 3, z: 5 } },
              lens: { ...structuredClone(camera.lens), fov: 35 },
            },
            interpolation: { kind: "linear" },
          }],
        }, [], (from, to, progress) => ({
          kind: "camera",
          pose: {
            position: {
              x: linear(from.pose.position.x, to.pose.position.x, progress),
              y: linear(from.pose.position.y, to.pose.position.y, progress),
              z: linear(from.pose.position.z, to.pose.position.z, progress),
            },
            rotation: structuredClone(from.pose.rotation),
          },
          lens: { ...structuredClone(from.lens), fov: linear(from.lens.fov, to.lens.fov, progress) },
        }));
      },
    },
  ] }]);
  const program = lowerScenePerformance(value, "main", host);
  const evaluated = evaluateSceneProgramAt(program, second(2));
  assert.equal(evaluated.objects["actor-main"]?.transform.position.x, 2);
  assert.equal(evaluated.cameras["camera-main"]?.pose.position.x, 3.2);
  assert.equal(evaluated.cameras["camera-main"]?.lens.fov, 41);
  assert.equal(evaluated.activeCamera, "camera-main");
});

test("a transform gesture becomes one immutable revision and referenced removals fail", () => {
  const before = project();
  const next = applySceneTransaction(before, {
    revision: 0,
    commands: [{
      kind: "object.transform.set",
      id: "actor-main",
      transform: {
        ...actor.transform,
        position: { x: 2, y: 0, z: -1 },
      },
    }],
  });
  assert.deepEqual(findSceneObject(next, "actor-main").transform.position, { x: 2, y: 0, z: -1 });
  assert.deepEqual(findSceneObject(before, "actor-main").transform.position, { x: 0, y: 0, z: 0 });
  assert.equal(next.revision, 1);
  assert.throws(() => applySceneTransaction(before, { revision: 1, commands: [] }), SceneRevisionConflict);
  assert.throws(() => applySceneTransaction(before, {
    revision: 0,
    commands: [{ kind: "object.remove", id: "actor-main" }],
  }), /references missing Object actor-main/u);
  assert.throws(() => applySceneTransaction(before, {
    revision: 0,
    commands: [{ kind: "camera.remove", id: "camera-main" }],
  }), /references missing Camera camera-main/u);
});

test("Scene history and savepoint remain outside the Project file", () => {
  let session = createSceneEditSession(project());
  session = commitSceneEdit(session, {
    label: "Move actor",
    transaction: {
      revision: 0,
      commands: [{
        kind: "object.transform.set",
        id: "actor-main",
        transform: { ...actor.transform, position: { x: 1, y: 0, z: 0 } },
      }],
    },
  });
  assert.equal(session.history.length, 1);
  assert.equal(isSceneEditSessionDirty(session), true);
  session = undoSceneEdit(session);
  assert.equal(findSceneObject(session.current, "actor-main").transform.position.x, 0);
  assert.equal(isSceneEditSessionDirty(session), false);
  assert.equal(canRedoSceneEdit(session), true);
  session = redoSceneEdit(session);
  assert.equal(findSceneObject(session.current, "actor-main").transform.position.x, 1);
  assert.equal(Object.hasOwn(session.current, "history"), false);
});
