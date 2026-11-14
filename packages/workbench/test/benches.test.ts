import assert from "node:assert/strict";
import test from "node:test";

import { createProjectBenchHostFromFacets } from "@hypit/bench";
import { generationWorkspaceFormat } from "@hypit/generation-canvas";
import { nleProjectFormat } from "@hypit/nle";
import { projectObjectRef } from "@hypit/project";
import { sceneProjectFormat } from "@hypit/scene";

import {
  commentsProjectBenchId,
  createWorkbenchProjectBenchFacets,
  generationCanvasProjectBenchId,
  nleProjectBenchId,
  sceneProjectBenchId,
} from "../src/node/benches.js";

test("each Project Object exposes only its independent Workbench surfaces", async () => {
  const opened: string[] = [];
  const closed: string[] = [];
  const facets = createWorkbenchProjectBenchFacets({
    openNle: async ({ object }) => {
      opened.push(`nle:${object.path}`);
      return {
        nleUrl: "http://127.0.0.1:5101/nle",
        commentsUrl: "http://127.0.0.1:5101/comments",
        close: () => { closed.push(`nle:${object.path}`); },
      };
    },
    openScene: async ({ object }) => {
      opened.push(`scene:${object.path}`);
      return {
        sceneUrl: "http://127.0.0.1:5102/3d",
        close: () => { closed.push(`scene:${object.path}`); },
      };
    },
    openCanvas: async ({ object }) => {
      opened.push(`canvas:${object.path}`);
      return {
        canvasUrl: "http://127.0.0.1:5103/canvas",
        close: () => { closed.push(`canvas:${object.path}`); },
      };
    },
  });
  const host = createProjectBenchHostFromFacets(facets);
  const nle = projectObjectRef("edits/main.nle.json", nleProjectFormat);
  const scene = projectObjectRef("shots/opening.scene.json", sceneProjectFormat);
  const canvas = projectObjectRef("generation/main.workspace.json", generationWorkspaceFormat);

  assert.deepEqual(host.available(nle), [
    { id: nleProjectBenchId, label: "Timeline" },
    { id: commentsProjectBenchId, label: "Comments" },
  ]);
  assert.deepEqual(host.available(scene), [{ id: sceneProjectBenchId, label: "Scene" }]);
  assert.deepEqual(host.available(canvas), [{ id: generationCanvasProjectBenchId, label: "Canvas" }]);

  const sessions = await Promise.all([
    host.open(nleProjectBenchId, { projectRoot: "/project", object: nle }),
    host.open(commentsProjectBenchId, { projectRoot: "/project", object: nle }),
    host.open(sceneProjectBenchId, { projectRoot: "/project", object: scene }),
    host.open(generationCanvasProjectBenchId, { projectRoot: "/project", object: canvas }),
  ]);
  assert.deepEqual(sessions.map((session) => session.surface.url), [
    "http://127.0.0.1:5101/nle",
    "http://127.0.0.1:5101/comments",
    "http://127.0.0.1:5102/3d",
    "http://127.0.0.1:5103/canvas",
  ]);
  await Promise.all(sessions.map(async (session) => await session.close()));
  assert.deepEqual(opened, [
    "nle:edits/main.nle.json",
    "nle:edits/main.nle.json",
    "scene:shots/opening.scene.json",
    "canvas:generation/main.workspace.json",
  ]);
  assert.deepEqual(closed, opened);
});
