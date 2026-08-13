import assert from "node:assert/strict";
import test from "node:test";

import {
  sealGenerationMediaBinding,
  sealGenerationRequestDraft,
  sealGenerationPortTable,
} from "@narratage/generation";
import {
  createExactModelPrimaryGenerationFragment,
  defineExactModelModule,
} from "@narratage/model-kit";
import { digestOf } from "@narratage/protocol";
import { sealText } from "@narratage/text";

const ports = sealGenerationPortTable({
  model: "graph-native-image",
  result: "image",
  ports: [
    { name: "prompt", value: { kind: "text" }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 1, maxItems: 3 },
  ],
  requires: [],
});

const definition = defineExactModelModule({
  module: { name: "@test/graph-native-image", version: "1" },
  endpoints: [{
    key: "image",
    requestTypeName: "GraphNativeImageRequest",
    producerName: "request-graph-native-image",
    ports,
  }],
});

test("one exact model definition owns draft, media binding, finalization and generation contracts", async () => {
  const endpoint = definition.endpoints.image!;
  assert.equal(endpoint.draftType.name, "GraphNativeImageRequestDraft");
  assert.equal(endpoint.mediaBindings.images?.type.name, "GraphNativeImageRequestImagesBinding");
  assert.equal(endpoint.textBindings.prompt?.producer.name, "bind-request-graph-native-image-prompt-text");
  assert.ok(definition.manifest.producers.some((producer) => producer.name === endpoint.finalizeProducer.name));

  const artifact = {
    kind: "blob" as const,
    digest: digestOf("graph-native-image"),
    size: 4,
    mediaType: "image/png",
  };
  const draft = sealGenerationRequestDraft(ports, { prompt: ["draw it"] });
  const mediaPort = ports.ports.find((port) => port.name === "images");
  assert.ok(mediaPort?.value.kind === "media");
  const binding = sealGenerationMediaBinding(mediaPort as never, { role: "image" });
  const bindFacet = definition.component.producers.find((facet) => facet.producer.name === endpoint.mediaBindings.images?.producer.name);
  assert.ok(bindFacet);
  const bound = await bindFacet.handler({ inputs: {
    draft: { value: { kind: "inline", value: draft } },
    binding: { value: { kind: "inline", value: binding } },
    artifact: { value: artifact },
  } } as never);
  const finalizeFacet = definition.component.producers.find((facet) => facet.producer.name === endpoint.finalizeProducer.name);
  assert.ok(finalizeFacet);
  const finalized = await finalizeFacet.handler({ inputs: { draft: { value: bound.outputs.draft! } } } as never);
  assert.equal(finalized.outputs.request?.kind, "inline");
  if (finalized.outputs.request?.kind !== "inline") return;
  const request = finalized.outputs.request.value as Record<string, unknown>;
});

test("one graph Text edge fills the exact model prompt before finalization", async () => {
  const endpoint = definition.endpoints.image!;
  const textFacet = definition.component.producers.find((facet) =>
    facet.producer.name === endpoint.textBindings.prompt?.producer.name);
  assert.ok(textFacet);
  const draft = sealGenerationRequestDraft(ports, {});
  const bound = await textFacet.handler({ inputs: {
    draft: { value: { kind: "inline", value: draft } },
    text: { value: { kind: "inline", value: sealText("draw it") } },
  } } as never);
  assert.equal(bound.outputs.draft?.kind, "inline");
  if (bound.outputs.draft?.kind !== "inline") return;
  assert.deepEqual((bound.outputs.draft.value as { ports: unknown }).ports, { prompt: ["draw it"] });
});

test("the dynamic Fragment exposes every Text and media edge as an explicit semantic input", () => {
  const fragment = createExactModelPrimaryGenerationFragment(definition.endpoints.image!, [
    { name: "first", port: "images" },
    { name: "second", port: "images" },
  ], [{ name: "prompt", port: "prompt" }]);
  assert.deepEqual(fragment.inputs.map((input) => input.name), [
    "draft", "first:artifact", "first:binding", "prompt:text", "second:artifact", "second:binding",
  ]);
  assert.deepEqual(fragment.operations.map((operation) => operation.producer.name), [
    "bind-request-graph-native-image-prompt-text",
    "bind-request-graph-native-image-images",
    "bind-request-graph-native-image-images",
    "finalize-request-graph-native-image",
    "request-graph-native-image",
    "select-primary-image",
  ]);
  assert.deepEqual(fragment.inputs.map((input) => input.name), [
    "draft", "first:artifact", "first:binding", "prompt:text", "second:artifact", "second:binding",
  ]);
});
