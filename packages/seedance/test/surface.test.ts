import assert from "node:assert/strict";
import test from "node:test";

import { artifactTypes } from "@narratage/artifact";
import { digestOf } from "@narratage/protocol";
import { parseStructuredElement } from "@narratage/text";
import type { SurfaceResolvedReference } from "@narratage/text";

import {
  decodeSeedanceVideoSurface,
  sealSeedancePrompt,
  seedanceTypes,
} from "../src/index.js";

test("Seedance keeps an upstream generated image as a graph edge", async () => {
  const element = parseStructuredElement({
    name: "dynamic-reference.svml",
    text: `<seedance:Video id="motion" model="mini" prompt={direction} duration="6" resolution="720p" aspect-ratio="9:16">
      <seedance:Reference image={generated.image} role="montage reference"/>
    </seedance:Video>`,
  }, 0).element;
  const prompt = sealSeedancePrompt("Create a coherent montage.");
  const refs = new Map<string, SurfaceResolvedReference>([
    ["direction", {
      path: "direction",
      ref: { kind: "record", id: "direction" },
      type: seedanceTypes.prompt,
      record: {
        id: "direction",
        type: seedanceTypes.prompt,
        value: { kind: "inline", value: prompt },
        digest: digestOf(prompt),
        conformance: "exact",
        origin: { kind: "authored", sourceDigest: digestOf("source"), frontendClosureDigest: digestOf("frontend") },
      },
    }],
    ["generated.image", {
      path: "generated.image",
      ref: { kind: "component-output", component: "generated", output: "image" },
      type: artifactTypes.blob,
    }],
  ]);
  const result = await decodeSeedanceVideoSurface({
    sourceName: "dynamic-reference.svml",
    element,
    resolveReference: (path) => refs.get(path),
    resolveAsset: () => { throw new Error("no asset"); },
  });
  const component = result.components[0]!;
  assert.deepEqual(component.inputs["media-0001:artifact"], {
    kind: "component-output", component: "generated", output: "image",
  });
  assert.equal(component.inputs["media-0001:binding"]?.kind, "record");
  const draft = result.records.find((record) => record.id === "motion.draft");
  assert.ok(draft?.value.kind === "inline");
  assert.equal(JSON.stringify(draft.value).includes("referenceImage"), false);
});
