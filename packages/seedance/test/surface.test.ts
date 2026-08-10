import assert from "node:assert/strict";
import test from "node:test";

import { artifactTypes } from "@narratage/artifact";
import { parseStructuredElement } from "@narratage/markup";
import type { SurfaceResolvedReference } from "@narratage/markup";
import { textTypes } from "@narratage/text";

import {
  decodeSeedanceVideoSurface,
} from "../src/index.js";

test("Seedance keeps upstream generated Text and image as graph edges", async () => {
  const element = parseStructuredElement({
    name: "dynamic-reference.svml",
    text: `<seedance:Video id="motion" model="mini" prompt={direction} duration="6" resolution="720p" aspect-ratio="9:16">
      <seedance:Reference image={generated.image}/>
    </seedance:Video>`,
  }, 0).element;
  const refs = new Map<string, SurfaceResolvedReference>([
    ["direction", {
      path: "direction",
      ref: { kind: "component-output", component: "assembled-direction", output: "text" },
      type: textTypes.text,
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
  assert.deepEqual(component.inputs["prompt:text"], {
    kind: "component-output", component: "assembled-direction", output: "text",
  });
  const draft = result.records.find((record) => record.id === "motion.draft");
  assert.ok(draft?.value.kind === "inline");
  assert.equal(JSON.stringify(draft.value).includes("referenceImage"), false);
});
