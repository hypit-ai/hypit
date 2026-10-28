import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  createFieldModelGenerationFragment,
  createFieldModelPrimaryFragment,
  defineFieldModelModule,
  sealModelArtifactBinding,
  sealModelFieldBuilder,
  defineModelFields,
  standardGenerationResults,
} from "@hypit/generation/model-fields";
import {
  defineModelModule,
  standardGenerationResultTypes,
} from "@hypit/generation/model";
import { sealText } from "@hypit/text";

test("a Model can own a structured request without the field helper", async () => {
  const model = defineModelModule({
    module: { name: "@test/structured-model", version: "1" },
    operations: [{
      key: "render",
      capabilityName: "structured-render",
      requestTypeName: "StructuredRequest",
      producerName: "request-structured-render",
      returns: standardGenerationResultTypes.image,
      validateRequest(value) {
        const request = value as { readonly regions?: unknown };
        assert.ok(Array.isArray(request.regions) && request.regions.length > 0,
          "structured request needs regions");
      },
    }],
  });
  assert.equal(model.operations.render.capability.name, "structured-render");
  assert.deepEqual(model.manifest.dependencies, [{ name: "@hypit/generation", version: "1" }]);
  const producer = model.component.producers.find((item) =>
    item.producer.name === model.operations.render.producer.name);
  assert.ok(producer);
  const result = await producer.handler({ inputs: {
    request: { value: ({ regions: [{ mask: "subject", weight: 0.8 }] }) },
  } } as never);
  assert.equal(result.kind, "need");
  assert.deepEqual(result.constraints, { regions: [{ mask: "subject", weight: 0.8 }] });
});

test("a custom Model result does not acquire Generation as a semantic Module dependency", () => {
  const module = { name: "@test/custom-product-model", version: "1" } as const;
  const model = defineModelModule({
    module,
    operations: [{
      key: "render",
      capabilityName: "custom-render",
      requestTypeName: "CustomRequest",
      producerName: "request-custom-render",
      returns: { module, name: "CustomProduct" },
      validateRequest() {},
    }],
  });
  assert.deepEqual(model.manifest.dependencies, []);
});

test("the optional field helper derives dependencies only from the fields and selectors it uses", () => {
  const scalarFields = defineModelFields({
    model: "scalar-image",
    fields: [{ name: "count", value: { kind: "number", integer: true }, minItems: 1, maxItems: 1 }],
    requires: [],
  });
  const scalarModel = defineFieldModelModule({
    module: { name: "@test/scalar-image", version: "1" },
    endpoints: [{
      key: "image",
      requestTypeName: "ScalarImageRequest",
      producerName: "request-scalar-image",
      fields: scalarFields,
      result: standardGenerationResults.image,
    }],
  });
  assert.deepEqual(scalarModel.manifest.dependencies, [{ name: "@hypit/generation", version: "1" }]);
});

const fields = defineModelFields({
  model: "graph-native-image",
  fields: [
    { name: "prompt", value: { kind: "text" }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 1, maxItems: 3 },
  ],
  requires: [],
});

const definition = defineFieldModelModule({
  module: { name: "@test/graph-native-image", version: "1" },
  endpoints: [{
    key: "image",
    requestTypeName: "GraphNativeImageRequest",
    producerName: "request-graph-native-image",
    fields,
    result: standardGenerationResults.image,
  }],
});

test("the field helper extends the opaque Model contract without duplicating its core declarations", () => {
  const endpoint = definition.endpoints.image;
  assert.equal(definition.manifest.capabilities.filter((item) => item.name === endpoint.capability.name).length, 1);
  assert.equal(definition.manifest.types.filter((item) => item === endpoint.requestType.name).length, 1);
  assert.equal(definition.manifest.producers.filter((item) => item.name === endpoint.producer.name).length, 1);
  assert.equal(definition.component.refinements.filter((item) => item.type.name === endpoint.requestType.name).length, 1);
  assert.equal(definition.component.producers.filter((item) => item.producer.name === endpoint.producer.name).length, 1);
  assert.deepEqual(endpoint.fragment.exports[0]?.type, standardGenerationResults.image.type);
});

test("media binding reaches the finalized exact-model request", async () => {
  const endpoint = definition.endpoints.image!;
  const artifact = {
    kind: "blob" as const,
    resource: fixtureResource("graph-native-image"),
    size: 4,
    mediaType: "image/png",
  };
  const draft = sealModelFieldBuilder(fields, { prompt: ["draw it"] });
  const mediaField = fields.fields.find((field) => field.name === "images");
  assert.ok(mediaField?.value.kind === "media");
  const binding = sealModelArtifactBinding(mediaField as never, { role: "image" });
  const bindFacet = definition.component.producers.find((facet) => facet.producer.name === endpoint.mediaBindings.images?.producer.name);
  assert.ok(bindFacet);
  const bound = await bindFacet.handler({ inputs: {
    draft: { value: (draft) },
    binding: { value: (binding) },
    artifact: { value: artifact },
  } } as never);
  assert.equal(bound.kind, "output");
  const finalizeFacet = definition.component.producers.find((facet) => facet.producer.name === endpoint.finalizeProducer.name);
  assert.ok(finalizeFacet);
  const finalized = await finalizeFacet.handler({ inputs: { draft: { value: bound.value } } } as never);
  assert.equal(finalized.kind, "output");
  assert.deepEqual(finalized.value, {
    fields: {
      images: [{ artifact, role: "image" }],
      prompt: ["draw it"],
    },
  });
});

test("one authored Text edge fills the exact model prompt before finalization", async () => {
  const endpoint = definition.endpoints.image!;
  const textFacet = definition.component.producers.find((facet) =>
    facet.producer.name === endpoint.textBindings.prompt?.producer.name);
  assert.ok(textFacet);
  const draft = sealModelFieldBuilder(fields, {});
  const bound = await textFacet.handler({ inputs: {
    draft: { value: (draft) },
    text: { value: (sealText("draw it")) },
  } } as never);
  assert.equal(bound.kind, "output");
  assert.deepEqual((bound.value as { fields: unknown }).fields, { prompt: ["draw it"] });
});

test("the dynamic Fragment exposes every Text and media edge as an explicit semantic input", () => {
  const fragment = createFieldModelPrimaryFragment(definition.endpoints.image!, [
    { name: "first", field: "images" },
    { name: "second", field: "images" },
  ], [{ name: "prompt", field: "prompt" }]);
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
});

test("a Model Fragment may publish the complete result and an explicit primary independently", () => {
  const endpoint = definition.endpoints.image!;
  const fragment = createFieldModelGenerationFragment(endpoint, [], [{ name: "prompt", field: "prompt" }], {
    result: "images",
    primary: "image",
  });
  assert.deepEqual(fragment.exports.map((item) => ({ name: item.name, type: item.type, root: item.root })), [
    { name: "image", type: { module: { name: "@hypit/blob", version: "1" }, name: "Blob" },
      root: { kind: "fragment-operation", operation: "select-primary-image" } },
    { name: "images", type: standardGenerationResults.image.type,
      root: { kind: "fragment-operation", operation: "generate" } },
  ]);
  assert.throws(() => createFieldModelGenerationFragment(endpoint, [], [], {}), /neither its result nor its primary/u);
  assert.throws(() => createFieldModelGenerationFragment(endpoint, [], [], { result: "image", primary: "image" }),
    /must differ/u);
});

test("model input rules run during assembly while complete-request rules wait for all inputs", async () => {
  const checked = defineFieldModelModule({
    module: { name: "@test/compare-images", version: "1" },
    endpoints: [{
      key: "compare", requestTypeName: "CompareRequest", producerName: "compare", fields,
      result: standardGenerationResults.image,
      validateInputs(request) {
        for (const value of request.fields.images ?? []) {
          if (typeof value === "object" && value.artifact.mediaType === "image/gif") {
            throw new Error("comparison references must be still images");
          }
        }
      },
      validateRequest(request) {
        if (request.fields.prompt?.[0] === "compare" && request.fields.images?.length !== 2) {
          throw new Error("compare requires two reference images");
        }
      },
    }],
  });
  const endpoint = checked.endpoints.compare;
  const bind = checked.component.producers.find((item) => item.producer.name === endpoint.mediaBindings.images!.producer.name)!;
  const finalize = checked.component.producers.find((item) => item.producer.name === endpoint.finalizeProducer.name)!;
  const artifact = { kind: "blob" as const, resource: fixtureResource("compare-image"), size: 4, mediaType: "image/png" };
  const initial = (sealModelFieldBuilder(fields, { prompt: ["compare"] }));
  const bindImage = async (draft: unknown, mediaType: string) => await bind.handler({ inputs: {
    draft: { value: draft }, binding: { value: ({ role: "image" }) },
    artifact: { value: { ...artifact, mediaType } },
  } } as never);

  const first = await bindImage(initial, "image/png");
  assert.equal(first.kind, "output");
  await assert.rejects(async () => finalize.handler({ inputs: { draft: { value: first.value } } } as never), /two reference images/);
  await assert.rejects(bindImage(initial, "image/gif"), /must be still images/);
  assert.throws(() => endpoint.sealRequest({ prompt: ["compare"], images: [{ role: "image", artifact }] }), /two reference images/);
  assert.throws(() => endpoint.sealRequest({ prompt: ["draw"], images: [{ role: "image", artifact: { ...artifact, mediaType: "image/gif" } }] }), /must be still images/);

  const second = await bindImage(first.value, "image/jpeg");
  assert.equal(second.kind, "output");
  const complete = await finalize.handler({ inputs: { draft: { value: second.value } } } as never);
  assert.equal(complete.kind, "output");
  const requestValidator = checked.component.refinements.find((item) => item.type.name === endpoint.requestType.name)!;
  await requestValidator.handler({ value: complete.value } as never);

  // Another Model using the same common field vocabulary has not acquired this Model's GIF rule.
  assert.doesNotThrow(() => definition.endpoints.image.sealRequest({
    prompt: ["draw"], images: [{ role: "image", artifact: { ...artifact, mediaType: "image/gif" } }],
  }));
});
