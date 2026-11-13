import assert from "node:assert/strict";
import test from "node:test";

import { blobTypes } from "@hypit/blob";
import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";

import { mediaOperationsComponent } from "../src/component.js";
import { compositeMediaFragment } from "../src/fragment.js";
import { mediaOperationsProducers } from "../src/manifest.js";
import { decodeCompositeSurface } from "../src/surface.js";

const under: SurfaceResolvedReference = {
  path: "captioned",
  ref: { kind: "component-output", component: "captioned", output: "video" },
  type: blobTypes.blob,
  record: {
    id: "captioned.video",
    type: blobTypes.blob,
    value: { kind: "blob", mediaType: "video/mp4", resource: "res://captioned" },
  },
} as unknown as SurfaceResolvedReference;

const over: SurfaceResolvedReference = {
  path: "subject.mask",
  ref: { kind: "component-output", component: "subject", output: "person" },
  type: blobTypes.blob,
  record: {
    id: "subject.person",
    type: blobTypes.blob,
    value: { kind: "blob", mediaType: "video/webm", resource: "res://subject" },
  },
} as unknown as SurfaceResolvedReference;

const refs = new Map<string, SurfaceResolvedReference>([["captioned", under], ["subject.mask", over]]);

async function decode(source: string) {
  const element = parseStructuredElement({ name: "media.svml", text: source }, 0).element;
  return await decodeCompositeSurface({
    sourceName: "media.svml",
    element,
    resolveReference: (path) => refs.get(path),
    resolveAsset: () => { throw new Error("no asset"); },
  });
}

test("Composite surface wires the subject over the under layer", async () => {
  const result = await decode('<mediaop:Composite id="occluded" under={captioned} over={subject.mask}/>');
  assert.deepEqual(result.records, []);
  const component = result.components[0]!;
  assert.equal(component.fragment, compositeMediaFragment.id);
  assert.deepEqual(component.outputs, { video: "occluded.video" });
  assert.deepEqual(component.inputs, { under: under.ref, over: over.ref });
  assert.deepEqual(result.fragments[0]!.operations.map((operation) => operation.id), ["composite"]);
  assert.deepEqual(result.fragments[0]!.exports.map((entry) => entry.name), ["video"]);
});

test("Composite surface rejects missing operands and children", async () => {
  await assert.rejects(
    () => decode('<mediaop:Composite id="x" under={captioned}/>'),
    /requires id, under, over/u,
  );
  await assert.rejects(
    () => decode('<mediaop:Composite id="x" under={captioned} over={subject.mask}>text</mediaop:Composite>'),
    /must be empty/u,
  );
});

test("Composite producer turns the two Blobs into one media Need", () => {
  const producer = mediaOperationsComponent.producers.find(
    (item) => item.producer.name === mediaOperationsProducers.composite.name,
  )!;
  const need = producer.handler({
    inputs: {
      under: { value: { kind: "blob", resource: "res://captioned", size: 1, mediaType: "video/mp4" } },
      over: { value: { kind: "blob", resource: "res://subject", size: 1, mediaType: "video/webm" } },
    },
  } as never) as { needs: Record<string, { under: { resource: string }; over: { resource: string } }> };
  assert.deepEqual(Object.keys(need.needs), ["video"]);
  assert.equal(need.needs.video!.under.resource, "res://captioned");
  assert.equal(need.needs.video!.over.resource, "res://subject");
});
