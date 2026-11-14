import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createProductionContextHostFromFacets } from "@hypit/production-context";

import {
  createSceneProject,
  serializeSceneAssetDocument,
  serializeSceneLibraryDocument,
  serializeSceneProject,
  type SceneAssetDocument,
  type SceneLibraryDocument,
} from "../src/index.js";
import { createSceneProjectObjectOwnerFacets } from "../src/node/index.js";

const sceneAsset: SceneAssetDocument = {
  format: "hypit.scene-asset@1",
  id: "actor",
  name: "Actor",
  using: { module: { name: "@project/scene-assets" }, name: "character" },
  resources: { model: { path: "actor.glb", mediaType: "model/gltf-binary" } },
  parameters: {},
};

const sceneLibrary: SceneLibraryDocument = {
  format: "hypit.scene-library@1",
  id: "scene-assets",
  name: "Scene Assets",
  collections: [{ id: "characters", label: "Characters", children: [] }],
  entries: [{
    id: "actor",
    label: "Actor",
    asset: { path: "characters/actor/actor.scene-asset.json" },
    collections: ["characters"],
    tags: ["actor"],
  }],
};

test("a freely placed Scene reaches its owner-private Library and Assets through Project references", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-scene-context-"));
  try {
    const assetDirectory = join(directory, "scenes", "assets", "characters", "actor");
    const sceneDirectory = join(directory, "episode-01", "shots");
    await mkdir(assetDirectory, { recursive: true });
    await mkdir(sceneDirectory, { recursive: true });
    await writeFile(join(assetDirectory, "actor.glb"), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
    await writeFile(join(assetDirectory, "actor.scene-asset.json"), serializeSceneAssetDocument(sceneAsset));
    await writeFile(join(directory, "scenes", "assets", "library.scene-library.json"),
      serializeSceneLibraryDocument(sceneLibrary));
    await writeFile(join(sceneDirectory, "opening.scene.json"), serializeSceneProject(createSceneProject({
      id: "opening",
      name: "Opening",
      libraries: [{ path: "../../scenes/assets/library.scene-library.json" }],
      environment: {
        using: { module: { name: "@project/scene-environment" }, name: "world" },
        parameters: {},
      },
    })));

    const context = await createProductionContextHostFromFacets(
      createSceneProjectObjectOwnerFacets(),
    ).project(directory);

    assert.deepEqual(context.objects.map((value) => value.label), ["Actor", "Scene Assets", "Opening"]);
    const scene = context.objects.find((value) => value.label === "Opening");
    assert.deepEqual(scene?.references, [{
      path: "scenes/assets/library.scene-library.json",
      format: "hypit.scene-library@1",
    }]);
    const library = context.objects.find((value) => value.label === "Scene Assets");
    assert.deepEqual(library?.references, [{
      path: "scenes/assets/characters/actor/actor.scene-asset.json",
      format: "hypit.scene-asset@1",
    }]);
    assert.deepEqual(context.unresolved, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
