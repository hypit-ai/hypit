import assert from "node:assert/strict";
import test from "node:test";

import { compositionTypes } from "@hypit/composition";
import { timelineTypes } from "@hypit/timeline";
import { blobTypes } from "@hypit/blob";
import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";

import pkg from "../src/activation.js";
import { htmlOccludedVideoFragment } from "../src/occluded-fragment.js";
import { decodeHtmlOccludedVideoSurface } from "../src/occluded-surface.js";

const composition = {
  path: "main.composition",
  ref: { kind: "component-output", component: "main", output: "composition" },
  type: compositionTypes.composition,
} as unknown as SurfaceResolvedReference;

const timeline = {
  path: "speech.timeline",
  ref: { kind: "component-output", component: "speech", output: "timeline" },
  type: timelineTypes.timeline,
} as unknown as SurfaceResolvedReference;

const subject = {
  path: "tracked.person",
  ref: { kind: "component-output", component: "tracked", output: "person" },
  type: blobTypes.blob,
  record: {
    id: "tracked.person",
    type: blobTypes.blob,
    value: { kind: "blob", mediaType: "video/webm", resource: "res://person" },
  },
} as unknown as SurfaceResolvedReference;

const still = {
  path: "still.image",
  ref: { kind: "component-output", component: "still", output: "image" },
  type: blobTypes.blob,
  record: {
    id: "still.image",
    type: blobTypes.blob,
    value: { kind: "blob", mediaType: "image/png", resource: "res://still" },
  },
} as unknown as SurfaceResolvedReference;

const refs = new Map<string, SurfaceResolvedReference>([
  ["main.composition", composition],
  ["speech.timeline", timeline],
  ["tracked.person", subject],
  ["still.image", still],
]);

async function decode(source: string) {
  const element = parseStructuredElement({ name: "video.svml", text: source }, 0).element;
  return await decodeHtmlOccludedVideoSurface({
    sourceName: "video.svml",
    element,
    resolveReference: (path) => refs.get(path),
    resolveAsset: () => { throw new Error("no asset"); },
  });
}

test("OccludedVideo renders below the subject's z and composites the mask over it", async () => {
  const result = await decode('<html:OccludedVideo id="behind" composition={main.composition} timeline={speech.timeline} subject={tracked.person} z="10"/>');
  const band = result.records.find((record) => record.id === "behind.band");
  assert.deepEqual((band?.value as { value: unknown }).value, {
    minInclusive: Number.MIN_SAFE_INTEGER,
    maxExclusive: 10,
  });
  const component = result.components[0]!;
  assert.equal(component.fragment, htmlOccludedVideoFragment.id);
  assert.deepEqual(component.outputs, { video: "behind.video" });
  assert.deepEqual(component.inputs, {
    composition: composition.ref,
    timeline: timeline.ref,
    band: { kind: "record", id: "behind.band" },
    subject: subject.ref,
  });
  // Fragments canonicalize operation order, so assert the graph by id and by what each step consumes.
  const operations = result.fragments[0]!.operations;
  assert.deepEqual(operations.map((operation) => operation.id).sort(), [
    "compile-program",
    "composite-subject",
    "project-visual-artifact",
    "request-visual",
  ]);
  const byId = new Map(operations.map((operation) => [operation.id, operation]));
  assert.deepEqual(byId.get("composite-subject")!.inputs, {
    under: { kind: "fragment-operation", operation: "project-visual-artifact" },
    over: { kind: "fragment-input", name: "subject" },
  });
  assert.deepEqual(byId.get("compile-program")!.inputs.band, { kind: "fragment-input", name: "band" });
  assert.deepEqual(result.fragments[0]!.exports.map((entry) => entry.name), ["video"]);
});

test("OccludedVideo rejects a missing z, a non-video subject and unknown attributes", async () => {
  await assert.rejects(
    () => decode('<html:OccludedVideo id="x" composition={main.composition} timeline={speech.timeline} subject={tracked.person}/>'),
    /z must be a string/u,
  );
  await assert.rejects(
    () => decode('<html:OccludedVideo id="x" composition={main.composition} timeline={speech.timeline} subject={still.image} z="0"/>'),
    /subject must be video media/u,
  );
  await assert.rejects(
    () => decode('<html:OccludedVideo id="x" composition={main.composition} timeline={speech.timeline} subject={tracked.person} z="0" depth="2"/>'),
    /does not accept depth/u,
  );
});

test("the package exposes both video surfaces", () => {
  const tags = pkg.facets
    .filter((facet) => facet.abi === "hypit.markup-surface@1")
    .map((facet) => (facet.implementation as { tag: string }).tag)
    .sort();
  assert.deepEqual(tags, ["OccludedVideo", "Video"]);
});
