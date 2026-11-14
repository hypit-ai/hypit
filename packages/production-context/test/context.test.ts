import assert from "node:assert/strict";
import test from "node:test";

import { projectObjectRef } from "@hypit/project";

import {
  createProductionContextHostFromFacets,
  createProjectObjectOwnerFacet,
} from "../src/index.js";

test("independent owners compose one context through explicit object references", async () => {
  const media = projectObjectRef("media/interview/interview.media.json", "hypit.media-asset@1");
  const edit = projectObjectRef("episode-01/final.nle.json", "hypit.nle@1");
  const host = createProductionContextHostFromFacets([
    createProjectObjectOwnerFacet({
      format: media.format,
      discover: () => [media],
      observe: ref => ({ ref, label: "Interview", references: [] }),
    }),
    createProjectObjectOwnerFacet({
      format: edit.format,
      discover: () => [edit],
      observe: ref => ({ ref, label: "Final edit", references: [media] }),
    }),
  ]);

  const context = await host.project("/project");
  assert.deepEqual(context.objects.map((value) => value.ref), [media, edit]);
  assert.deepEqual(context.unresolved, []);
});

test("a reference with no selected owner stays unresolved instead of choosing a fallback", async () => {
  const script = projectObjectRef("documents/story.script", "hypit.script@1");
  const edit = projectObjectRef("film.nle.json", "hypit.nle@1");
  const host = createProductionContextHostFromFacets([createProjectObjectOwnerFacet({
    format: edit.format,
    discover: () => [edit],
    observe: ref => ({ ref, label: "Film", references: [script] }),
  })]);
  const context = await host.project("/project");
  assert.deepEqual(context.objects.map((value) => value.ref), [edit]);
  assert.deepEqual(context.unresolved, [script]);
});
