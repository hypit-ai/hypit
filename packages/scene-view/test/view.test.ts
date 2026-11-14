import assert from "node:assert/strict";
import test from "node:test";

import {
  applySceneTransaction,
  createSceneProject,
  type SceneObject,
} from "@hypit/scene";

import {
  applySceneViewTransaction,
  assertSceneViewAllowsTransaction,
  createSceneView,
  projectSceneWorkbench,
  reconcileSceneView,
} from "../src/index.js";

const actor: SceneObject = {
  id: "actor",
  name: "Actor",
  using: { module: { name: "@project/character" }, name: "actor" },
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
  },
  enabled: true,
  parameters: {},
};

function project() {
  return createSceneProject({
    id: "stage",
    name: "Stage",
    environment: {
      using: { module: { name: "@test/environment" }, name: "environment" },
      parameters: {},
    },
    objects: [actor],
    cameras: [],
    performances: [{
      id: "main",
      name: "Main",
      duration: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } },
      tracks: [{ id: "actions", name: "Actions", subject: { kind: "object", ref: "actor" }, items: [] }],
      shots: [],
    }],
  });
}

test("Scene View persists editing facts without changing Scene output", () => {
  const document = project();
  const initial = createSceneView({
    id: "stage-main",
    name: "Stage View",
    project: { path: "stage.scene.json" },
    objects: ["actor"],
  });
  const view = applySceneViewTransaction(initial, document, { revision: 0, commands: [
    { kind: "object-state.set", object: "actor", hidden: true, locked: true },
    { kind: "track-lock.set", performance: "main", track: "actions", locked: true },
  ] });
  assert.deepEqual(view.objects[0], { object: "actor", hidden: true, locked: true });
  assert.equal(Object.hasOwn(document.objects[0]!, "hidden"), false);
  assert.equal(Object.hasOwn(document.objects[0]!, "locked"), false);
});

test("View locks guard the work surface but do not enter Scene Core", () => {
  const document = project();
  const initial = createSceneView({
    id: "stage-main", name: "Stage View", project: { path: "stage.scene.json" }, objects: ["actor"],
  });
  const view = applySceneViewTransaction(initial, document, { revision: 0, commands: [
    { kind: "object-state.set", object: "actor", locked: true },
  ] });
  const edit = {
    revision: 0,
    commands: [{ kind: "object.transform.set" as const, id: "actor", transform: {
      ...actor.transform, position: { x: 3, y: 0, z: 0 },
    } }],
  };
  assert.throws(() => assertSceneViewAllowsTransaction(view, document, edit), /Object actor is locked/u);
  assert.doesNotThrow(() => applySceneTransaction(document, edit));
});

test("projection joins Project, View and transient previews, then reconciliation drops stale refs", () => {
  const document = project();
  let view = createSceneView({
    id: "stage-main", name: "Stage View", project: { path: "stage.scene.json" }, objects: ["actor"],
    editRate: { numerator: 24, denominator: 1 },
  });
  view = applySceneViewTransaction(view, document, { revision: 0, commands: [
    { kind: "object-state.set", object: "actor", hidden: true },
  ] });
  const scene = projectSceneWorkbench(document, view, [{
    object: "actor",
    preview: { kind: "primitive", shape: "capsule", color: "#cccccc", size: { x: 1, y: 2, z: 1 } },
  }]);
  assert.equal(scene.objects[0]?.editorVisible, false);
  assert.equal(scene.objects[0]?.preview?.kind, "primitive");
  assert.equal(scene.performances[0]?.durationFrames, 48);

  const withoutPerformance = applySceneTransaction(document, {
    revision: 0,
    commands: [{ kind: "performance.remove", id: "main" }, { kind: "object.remove", id: "actor" }],
  });
  const reconciled = reconcileSceneView(view, withoutPerformance);
  assert.deepEqual(reconciled.objects, []);
  assert.deepEqual(reconciled.tracks, []);
});
