import assert from "node:assert/strict";
import test from "node:test";
import type { BlobRef } from "@hypit/protocol";

import {
  bindModelArtifact,
  finalizeModelFieldBuilder,
  modelFieldRequestSchema,
  sealModelArtifactBinding,
  sealModelFieldRequest,
  sealModelFieldBuilder,
  defineModelFields,
  verifyModelFieldRequest,
} from "@hypit/generation/model-fields";
import type { ModelFieldTable } from "@hypit/generation/model-fields";
import {
  materializeWireRequest,
  planWireRequest,
  assertMappingCoversFields,
  selectWireModel,
  selectWireModelForRequest,
} from "@hypit/generation/provider";
import type { GenerationWireMapping } from "@hypit/generation/provider";

const table: ModelFieldTable = defineModelFields({
  model: "demo-video",
  fields: [
    { name: "prompt", value: { kind: "text", maxChars: 200 }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "number", integer: true, minimum: 4, maximum: 15 }, minItems: 1, maxItems: 1 },
    { name: "resolution", value: { kind: "enum", values: ["480p", "720p"] }, minItems: 1, maxItems: 1 },
    { name: "referenceImage", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 9 },
    { name: "referenceAudio", value: { kind: "media", accepts: ["audio"] }, minItems: 0, maxItems: 3 },
    { name: "firstFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
    { name: "lastFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
    { name: "voiceId", value: { kind: "token", minLength: 1, maxLength: 64 }, minItems: 0, maxItems: 4 },
    {
      name: "excerpt",
      value: {
        kind: "media",
        accepts: ["video"],
        itemFields: [
          { name: "startSec", value: { kind: "number", minimum: 0 } },
          { name: "endSec", value: { kind: "number", minimum: 0 } },
        ],
      },
      minItems: 0,
      maxItems: 3,
    },
  ],
  requires: [
    { kind: "atMostOneOf", fields: ["referenceImage", "firstFrame"] },
    { kind: "requiresPresent", field: "lastFrame", needs: ["firstFrame"] },
    { kind: "requiresAnyOf", field: "referenceAudio", anyOf: ["referenceImage"] },
    { kind: "weightedTotal", weights: { referenceImage: 1, referenceAudio: 1 }, maximum: 10 },
  ],
});

const mapping: GenerationWireMapping = {
  capability: { module: { name: "@hypit/demo", version: "0.0.0-dev" }, name: "demo-video" },
  routes: [
    { model: "demo/image-to-video", whenPresent: ["firstFrame"] },
    { model: "demo/reference-to-video", whenPresent: ["referenceImage"] },
    { model: "demo/text-to-video" },
  ],
  fields: {
    prompt: { as: "value", field: "prompt" },
    duration: { as: "string", field: "duration" },
    resolution: { as: "value", field: "resolution" },
    referenceImage: { as: "urlArray", field: "reference_image_urls" },
    referenceAudio: { as: "urlArray", field: "reference_audio_urls" },
    firstFrame: { as: "url", field: "first_frame_url" },
    lastFrame: { as: "url", field: "last_frame_url" },
    voiceId: { as: "valueArray", field: "voice_ids" },
    excerpt: {
      as: "itemObject",
      field: "video_list",
      urlKey: "url",
      fieldKeys: { startSec: "start", endSec: "ends" },
    },
  },
  constants: { return_last_frame: false },
};

const artifact = (name: string, mediaType: string): BlobRef => ({
  kind: "blob",
  resource: `res_generation_${name}`,
  size: 1,
  mediaType,
});

function artifacts() {
  return {
    image: artifact("image", "image/png"),
    video: artifact("video", "video/mp4"),
    audio: artifact("audio", "audio/wav"),
  };
}

const resolve = async (artifact: { readonly resource: string }) => `https://cdn.test/${artifact.resource}`;

test("a field table derives the request Schema and rejects undeclared fields", () => {
  const schema = modelFieldRequestSchema(table);
  assert.equal(schema.kind, "object");
  const fields = (schema as { fields: Record<string, { schema: { kind: string } }> }).fields;
  assert.deepEqual(Object.keys(fields), ["fields"]);
  const modelFields = fields.fields!.schema as { kind: string; fields: Record<string, { optional?: boolean }> };
  assert.equal(modelFields.kind, "object");
  assert.equal(modelFields.fields.prompt!.optional, undefined);
  assert.equal(modelFields.fields.referenceImage!.optional, true);
  assert.throws(
    () => verifyModelFieldRequest(table, {
      fields: { prompt: ["hi"], duration: [8], resolution: ["720p"], unknownField: ["x"] },
    }),
    /undeclared field unknownField/u,
  );
});

test("Model defaults are explicit in complete requests and absent from Provider mappings", () => {
  const defaulted = defineModelFields({
    model: "defaulted-image",
    fields: [
      { name: "prompt", value: { kind: "text" }, minItems: 1, maxItems: 1 },
      { name: "quality", value: { kind: "enum", values: ["standard", "high"] },
        minItems: 1, maxItems: 1, defaultItems: ["high"] },
    ],
    requires: [],
  });
  const draft = sealModelFieldBuilder(defaulted, {});
  assert.deepEqual(draft, { fields: {} });
  assert.deepEqual(finalizeModelFieldBuilder(defaulted, { fields: { prompt: ["draw"] } }), {
    fields: { prompt: ["draw"], quality: ["high"] },
  });
  assert.deepEqual(sealModelFieldRequest(defaulted, { prompt: ["draw"] }), {
    fields: { prompt: ["draw"], quality: ["high"] },
  });
  assert.throws(() => verifyModelFieldRequest(defaulted, { fields: { prompt: ["draw"] } }), /quality is required/u);
  assert.throws(() => defineModelFields({
    model: "bad-default",
    fields: [{ name: "quality", value: { kind: "enum", values: ["standard", "high"] },
      minItems: 1, maxItems: 1, defaultItems: ["ultra"] }],
    requires: [],
  }), /defaultItems/u);
});

test("an artifact field enforces the media type its role demands", () => {
  const { image, audio } = artifacts();
  assert.throws(
    () => sealModelFieldRequest(table, {
      prompt: ["hi"],
      duration: [8],
      resolution: ["720p"],
      firstFrame: [{ role: "image", artifact: audio }],
    }),
    /image\//u,
  );
  const ok = sealModelFieldRequest(table, {
    prompt: ["hi"],
    duration: [8],
    resolution: ["720p"],
    firstFrame: [{ role: "image", artifact: image }],
  });
  assert.equal("model" in ok, false);
});

test("field combination rules enforce mutually exclusive input modes", () => {
  const { image } = artifacts();
  const base = { prompt: ["hi"], duration: [8], resolution: ["720p"] } as const;
  assert.throws(
    () => sealModelFieldRequest(table, {
      ...base,
      referenceImage: [{ role: "image", artifact: image }],
      firstFrame: [{ role: "image", artifact: image }],
    }),
    /at most one of referenceImage, firstFrame/u,
  );
  assert.throws(
    () => sealModelFieldRequest(table, { ...base, lastFrame: [{ role: "image", artifact: image }] }),
    /lastFrame also requires firstFrame/u,
  );
  assert.throws(
    () => sealModelFieldRequest(table, { ...base, resolution: ["1080p"] }),
    /must be one of 480p, 720p/u,
  );
});

test("one mapping compiles every field shape and routes by field presence", async () => {
  const { image, video, audio } = artifacts();
  const request = sealModelFieldRequest(table, {
    prompt: ["hello"],
    duration: [8],
    resolution: ["720p"],
    referenceImage: [{ role: "image", artifact: image }],
    referenceAudio: [{ role: "audio", artifact: audio }],
    voiceId: ["alpha", "beta"],
    excerpt: [{ role: "video", artifact: video, fields: { startSec: 1, endSec: 4 } }],
  });
  const wire = await materializeWireRequest(planWireRequest(mapping, request), resolve);
  assert.equal(wire.model, "demo/reference-to-video");
  assert.deepEqual(wire.input, {
    duration: "8",
    prompt: "hello",
    reference_audio_urls: [`https://cdn.test/${audio.resource}`],
    reference_image_urls: [`https://cdn.test/${image.resource}`],
    resolution: "720p",
    return_last_frame: false,
    video_list: [{ ends: 4, start: 1, url: `https://cdn.test/${video.resource}` }],
    voice_ids: ["alpha", "beta"],
  });

  const textOnly = sealModelFieldRequest(table, { prompt: ["hi"], duration: [8], resolution: ["720p"] });
  assert.equal(selectWireModel(mapping, new Set(Object.keys(textOnly.fields))), "demo/text-to-video");
  assert.equal(selectWireModelForRequest(mapping, textOnly), "demo/text-to-video");
  const framed = sealModelFieldRequest(table, {
    prompt: ["hi"],
    duration: [8],
    resolution: ["720p"],
    firstFrame: [{ role: "image", artifact: image }],
  });
  assert.equal((await materializeWireRequest(planWireRequest(mapping, framed), resolve)).model, "demo/image-to-video");
});

test("coverage rejects a mapping that forgets a field the model declares", () => {
  assertMappingCoversFields(table, mapping);
  const { referenceAudio: _audio, ...withoutAudio } = mapping.fields;
  assert.throws(
    () => assertMappingCoversFields(table, { ...mapping, fields: withoutAudio }),
    /does not cover field referenceAudio/u,
  );

  const { excerpt: _excerpt, ...missingPort } = mapping.fields;
  assert.throws(
    () => assertMappingCoversFields(table, { ...mapping, fields: missingPort }),
    /does not cover field excerpt/u,
  );

  const wrongShape: GenerationWireMapping = {
    ...mapping,
    fields: { ...mapping.fields, voiceId: { as: "value", field: "voice_ids" } },
  };
  assert.throws(() => assertMappingCoversFields(table, wrongShape), /must use valueArray/u);
});

test("runtime media stays on graph edges until a model-owned draft is finalized", async () => {
  const { image, video, audio } = artifacts();
  const base = sealModelFieldBuilder(table, {
    prompt: ["hello"], duration: [8], resolution: ["720p"],
  });
  const audioField = table.fields.find((field) => field.name === "referenceAudio");
  const imageField = table.fields.find((field) => field.name === "referenceImage");
  const excerptField = table.fields.find((field) => field.name === "excerpt");
  assert.ok(audioField?.value.kind === "media");
  assert.ok(imageField?.value.kind === "media");
  assert.ok(excerptField?.value.kind === "media");

  // An intermediate draft may receive audio first; the exact cross-field rule
  // is enforced only once all explicitly connected edges have been attached.
  const withAudio = bindModelArtifact(table, base, "referenceAudio",
    sealModelArtifactBinding(audioField as never, { role: "audio" }), audio);
  assert.throws(() => finalizeModelFieldBuilder(table, withAudio), /needs at least one of referenceImage/u);
  const withImage = bindModelArtifact(table, withAudio, "referenceImage",
    sealModelArtifactBinding(imageField as never, { role: "image" }), image);
  const withExcerpt = bindModelArtifact(table, withImage, "excerpt",
    sealModelArtifactBinding(excerptField as never, {
      role: "video", fields: { startSec: 1, endSec: 3 },
    }), video);
  const exact = finalizeModelFieldBuilder(table, withExcerpt);
  assert.deepEqual(exact.fields.referenceAudio?.[0], { role: "audio", artifact: audio });
  assert.deepEqual(exact.fields.excerpt?.[0], {
    role: "video", artifact: video, fields: { startSec: 1, endSec: 3 },
  });
  assert.throws(() => bindModelArtifact(table, base, "referenceImage",
    sealModelArtifactBinding(imageField as never, { role: "image" }), audio), /image\//u);
});

test("media item fields can belong to URL preparation separately from the request body", async () => {
  const { video } = artifacts();
  const transportMapping: GenerationWireMapping = { ...mapping, fields: { ...mapping.fields,
    excerpt: { as: "itemObject", field: "video_list", urlKey: "url", resourceFields: ["startSec"], fieldKeys: { endSec: "ends" } },
  } };
  assertMappingCoversFields(table, transportMapping);
  assert.throws(() => assertMappingCoversFields(table, { ...mapping, fields: { ...mapping.fields,
    excerpt: { as: "urlArray", field: "video_list", resourceFields: ["startSec"] },
  } }), /required item field endSec/);
  const seen: unknown[] = [];
  const request = sealModelFieldRequest(table, { prompt: ["motion"], duration: [8], resolution: ["720p"],
    excerpt: [{ role: "video", artifact: video, fields: { startSec: 0, endSec: 4 } }],
  });
  const result = await materializeWireRequest(planWireRequest(transportMapping, request), async (_artifact, fields) => { seen.push(fields); return "https://media.test/prepared"; });
  assert.deepEqual(seen, [{ startSec: 0 }]);
  assert.deepEqual((result.input as Record<string, unknown>).video_list, [{ url: "https://media.test/prepared", ends: 4 }]);
});
