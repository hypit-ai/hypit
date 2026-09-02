import assert from "node:assert/strict";
import test from "node:test";

import { artifactTypes } from "@hypit/artifact";
import { parseStructuredElement } from "@hypit/markup";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/markup";
import { textTypes } from "@hypit/text";

import {
  decodeCleanGptImageSurface,
  decodeGptImageSurface,
} from "../src/surface.js";

const refs = new Map<string, SurfaceResolvedReference>([
  ["prompt", {
    path: "prompt",
    ref: { kind: "component-output", component: "assembled-prompt", output: "text" },
    type: textTypes.text,
  }],
  ...["person.image", "product.image"].map((path) => [path, {
    path,
    ref: { kind: "component-output" as const, component: path.split(".")[0]!, output: "image" },
    type: artifactTypes.blob,
  }] as const),
]);

async function decode(source: string, handler: StructuredSurfaceHandler) {
  const element = parseStructuredElement({ name: "gpt-image.svml", text: source }, 0).element;
  return await handler({
    sourceName: "gpt-image.svml",
    element,
    resolveReference: (path) => refs.get(path),
    resolveAsset: () => { throw new Error("no asset"); },
  });
}

const authored = `<gpt:Image id="holding" prompt={prompt} aspect-ratio="21:9" resolution="2K">
  <gpt:Reference image={person.image}/>
  <gpt:Reference image={product.image}/>
</gpt:Image>`;

test("raw GPT Image Surface keeps Text and every reference image on explicit graph edges", async () => {
  const result = await decode(authored, decodeGptImageSurface);
  const component = result.components[0]!;
  assert.deepEqual(component.inputs["prompt:text"], {
    kind: "component-output", component: "assembled-prompt", output: "text",
  });
  assert.deepEqual(component.inputs["image-0001:artifact"], {
    kind: "component-output", component: "person", output: "image",
  });
  assert.deepEqual(component.inputs["image-0002:artifact"], {
    kind: "component-output", component: "product", output: "image",
  });
  assert.deepEqual(component.outputs, { image: "holding.image" });
  assert.equal(result.records.filter((record) => record.id.endsWith(".binding")).length, 2);
  assert.equal(result.records.some((record) => record.id.endsWith(".cleanup")), false);
  assert.deepEqual(result.fragments[0]?.operations.map((operation) => operation.id), [
    "bind-text:0001:prompt",
    "bind:0001:images",
    "bind:0002:images",
    "finalize-request",
    "generate",
    "select-primary-image",
  ]);
});

test("clean GPT Image Surface adds the official denoise as one visible downstream operation", async () => {
  const result = await decode(authored, decodeCleanGptImageSurface);
  const component = result.components[0]!;
  assert.deepEqual(component.inputs.cleanup, { kind: "record", id: "holding.cleanup" });
  assert.ok(result.records.some((record) => record.id === "holding.cleanup"));
  assert.deepEqual(result.fragments[0]?.operations.map((operation) => operation.id).toSorted(), [
    "bind-text:0001:prompt",
    "bind:0001:images",
    "bind:0002:images",
    "clean-image",
    "finalize-request",
    "generate",
    "select-primary-image",
  ].toSorted());
  const clean = result.fragments[0]?.operations.find((operation) => operation.id === "clean-image");
  assert.deepEqual(clean?.inputs.source, { kind: "fragment-operation", operation: "select-primary-image" });
  assert.deepEqual(clean?.inputs.program, { kind: "fragment-input", name: "cleanup" });
});

test("GPT Image Surface rejects hidden inline prompts and undeclared child shapes", async () => {
  await assert.rejects(
    decode('<gpt:Image id="bad" prompt="inline" aspect-ratio="9:16" resolution="2K"/>', decodeGptImageSurface),
    /whole-value reference/u,
  );
  await assert.rejects(
    decode('<gpt:Image id="bad" prompt={prompt} aspect-ratio="9:16" resolution="2K"><gpt:Audio audio={person.image}/></gpt:Image>', decodeGptImageSurface),
    /only Reference children/u,
  );
});
