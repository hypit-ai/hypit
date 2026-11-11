import assert from "node:assert/strict";
import test from "node:test";

import {
  createSceneLoweringHost,
  createSceneProject,
  evaluateSceneProgramAt,
  lowerScenePerformance,
} from "@hypit/scene";

import { sceneMotionPackage } from "../src/index.js";

const time = (ticks: number, denominator = 1) => ({
  ticks: String(ticks),
  timeBase: { numerator: 1, denominator },
});

test("semantic dolly parameters lower to one exact Camera-state control", () => {
  const project = createSceneProject({
    id: "dolly-stage",
    name: "Dolly Stage",
    environment: {
      using: { module: { name: "@test/environment", version: "1" }, name: "environment" },
      parameters: {},
    },
    cameras: [{
      id: "main-camera",
      name: "Main Camera",
      pose: {
        position: { x: 0, y: 0, z: 10 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      lens: { fov: 45, aspect: { numerator: 16, denominator: 9 } },
    }],
    performances: [{
      id: "main",
      name: "Main",
      duration: time(5),
      tracks: [{
        id: "camera-motion",
        name: "Camera Motion",
        subject: { kind: "camera", ref: "main-camera" },
        items: [{
          id: "dolly-in",
          name: "Dolly In",
          start: time(0),
          duration: time(5),
          enabled: true,
          using: { module: { name: "@hypit/scene-motion", version: "1" }, name: "camera-motion" },
          parameters: {
            kind: "dolly",
            distance: 4,
            aim: { kind: "point", position: { x: 0, y: 0, z: 0 } },
            easing: "ease-in-out",
          },
        }],
      }],
      shots: [{ id: "shot", name: "Shot", camera: "main-camera", start: time(0), duration: time(5) }],
    }],
  });
  const program = lowerScenePerformance(project, "main", createSceneLoweringHost([sceneMotionPackage]));
  const state = evaluateSceneProgramAt(program, time(5, 2));
  assert.equal(state.cameras["main-camera"]?.pose.position.z, 8);
  assert.equal(state.cameras["main-camera"]?.lens.fov, 45);
  assert.equal(state.activeCamera, "main-camera");
});

test("camera and object paths evaluate as one shared Performance", () => {
  const project = createSceneProject({
    id: "tracking-stage",
    name: "Tracking Stage",
    environment: {
      using: { module: { name: "@test/environment", version: "1" }, name: "environment" },
      parameters: {},
    },
    objects: [{
      id: "actor", name: "Actor",
      using: { module: { name: "@test/assets", version: "1" }, name: "person" },
      transform: {
        position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      enabled: true, parameters: {},
    }],
    cameras: [{
      id: "camera", name: "Camera",
      pose: { position: { x: 0, y: 2, z: -5 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      lens: { fov: 45, aspect: { numerator: 16, denominator: 9 } },
    }],
    performances: [{
      id: "main", name: "Main", duration: time(10),
      tracks: [{
        id: "actor-path", name: "Actor Path", subject: { kind: "object", ref: "actor" },
        items: [{
          id: "actor-move", name: "Actor Move", start: time(0), duration: time(10), enabled: true,
          using: { module: { name: "@hypit/scene-motion", version: "1" }, name: "object-path" },
          parameters: { kind: "object-path", curve: "linear", points: [
            { at: 0, position: { x: 0, y: 0, z: 0 } },
            { at: 1, position: { x: 0, y: 0, z: 10 } },
          ] },
        }],
      }, {
        id: "camera-path", name: "Camera Path", subject: { kind: "camera", ref: "camera" },
        items: [{
          id: "camera-move", name: "Camera Move", start: time(0), duration: time(10), enabled: true,
          using: { module: { name: "@hypit/scene-motion", version: "1" }, name: "camera-path" },
          parameters: { kind: "camera-path", curve: "linear", points: [
            { at: 0, position: { x: 0, y: 2, z: -5 }, aim: { x: 0, y: 1, z: 0 }, fov: 45 },
            { at: 1, position: { x: 2, y: 2, z: 5 }, aim: { x: 0, y: 1, z: 10 }, fov: 35 },
          ] },
        }],
      }],
      shots: [{ id: "shot", name: "Shot", camera: "camera", start: time(0), duration: time(10) }],
    }],
  });
  const program = lowerScenePerformance(project, "main", createSceneLoweringHost([sceneMotionPackage]));
  const state = evaluateSceneProgramAt(program, time(5));
  assert.equal(state.objects.actor?.transform.position.z, 5);
  assert.equal(state.cameras.camera?.pose.position.x, 1);
  assert.equal(state.cameras.camera?.lens.fov, 40);
  assert.equal(state.activeCamera, "camera");
});
