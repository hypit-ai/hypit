import assert from "node:assert/strict";
import test from "node:test";

import { MemoryResourceStore } from "@hypit/driver-node";
import {
  assertMappingCoversPorts,
  bindGenerationMedia,
  compileWireRequest,
  finalizeGenerationRequestDraft,
  requestSchemaFromPorts,
  sealGenerationMediaBinding,
  sealGenerationPortRequest,
  sealGenerationRequestDraft,
  sealGenerationPortTable,
  selectWireModel,
  verifyRequestAgainstPorts,
} from "@hypit/generation";
import type { GenerationPortTable, GenerationWireMapping } from "@hypit/generation";

const table: GenerationPortTable = sealGenerationPortTable({
  model: "demo-video",
  result: "video",
  ports: [
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
    { kind: "atMostOneOf", ports: ["referenceImage", "firstFrame"] },
    { kind: "requiresPresent", port: "lastFrame", needs: ["firstFrame"] },
    { kind: "requiresAnyOf", port: "referenceAudio", anyOf: ["referenceImage"] },
    { kind: "weightedTotal", weights: { referenceImage: 1, referenceAudio: 1 }, maximum: 10 },
  ],
});

const mapping: GenerationWireMapping = {
  capability: { module: { name: "@hypit/demo", version: "0.0.0-dev" }, name: "demo-video" },
  result: "video",
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

async function artifacts() {
  const store = new MemoryResourceStore();
  return {
    image: await store.put(new Uint8Array([1]), "image/png"),
    video: await store.put(new Uint8Array([2]), "video/mp4"),
    audio: await store.put(new Uint8Array([3]), "audio/wav"),
  };
}

const resolve = async (artifact: { readonly resource: string }) => `https://cdn.test/${artifact.resource}`;

test("a port table derives the request Schema and rejects undeclared ports", () => {
  const schema = requestSchemaFromPorts(table);
  assert.equal(schema.kind, "object");
  const fields = (schema as { fields: Record<string, { schema: { kind: string } }> }).fields;
  assert.deepEqual(Object.keys(fields), ["ports"]);
  const ports = fields.ports!.schema as { kind: string; fields: Record<string, { optional?: boolean }> };
  assert.equal(ports.kind, "object");
  assert.equal(ports.fields.prompt!.optional, undefined);
  assert.equal(ports.fields.referenceImage!.optional, true);
  assert.throws(
    () => verifyRequestAgainstPorts(table, {
      ports: { prompt: ["hi"], duration: [8], resolution: ["720p"], unknownPort: ["x"] },
    }),
    /undeclared port unknownPort/u,
  );
});

test("a media port enforces the media type its role demands", async () => {
  const { image, audio } = await artifacts();
  assert.throws(
    () => sealGenerationPortRequest(table, {
      prompt: ["hi"],
      duration: [8],
      resolution: ["720p"],
      firstFrame: [{ role: "image", artifact: audio }],
    }),
    /image\//u,
  );
  const ok = sealGenerationPortRequest(table, {
    prompt: ["hi"],
    duration: [8],
    resolution: ["720p"],
    firstFrame: [{ role: "image", artifact: image }],
  });
  assert.equal("model" in ok, false);
});

test("port combination rules enforce mutually exclusive input modes", async () => {
  const { image } = await artifacts();
  const base = { prompt: ["hi"], duration: [8], resolution: ["720p"] } as const;
  assert.throws(
    () => sealGenerationPortRequest(table, {
      ...base,
      referenceImage: [{ role: "image", artifact: image }],
      firstFrame: [{ role: "image", artifact: image }],
    }),
    /at most one of referenceImage, firstFrame/u,
  );
  assert.throws(
    () => sealGenerationPortRequest(table, { ...base, lastFrame: [{ role: "image", artifact: image }] }),
    /lastFrame also requires firstFrame/u,
  );
  assert.throws(
    () => sealGenerationPortRequest(table, { ...base, resolution: ["1080p"] }),
    /must be one of 480p, 720p/u,
  );
});

test("one mapping compiles every port shape and routes by port presence", async () => {
  const { image, video, audio } = await artifacts();
  const request = sealGenerationPortRequest(table, {
    prompt: ["hello"],
    duration: [8],
    resolution: ["720p"],
    referenceImage: [{ role: "image", artifact: image }],
    referenceAudio: [{ role: "audio", artifact: audio }],
    voiceId: ["alpha", "beta"],
    excerpt: [{ role: "video", artifact: video, fields: { startSec: 1, endSec: 4 } }],
  });
  const wire = await compileWireRequest(mapping, request, resolve);
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

  const textOnly = sealGenerationPortRequest(table, { prompt: ["hi"], duration: [8], resolution: ["720p"] });
  assert.equal(selectWireModel(mapping, new Set(Object.keys(textOnly.ports))), "demo/text-to-video");
  const framed = sealGenerationPortRequest(table, {
    prompt: ["hi"],
    duration: [8],
    resolution: ["720p"],
    firstFrame: [{ role: "image", artifact: image }],
  });
  assert.equal((await compileWireRequest(mapping, framed, resolve)).model, "demo/image-to-video");
});

test("coverage rejects a mapping that forgets a port the model declares", () => {
  assertMappingCoversPorts(table, mapping);
  const { referenceAudio: _audio, ...withoutAudio } = mapping.fields;
  assert.throws(
    () => assertMappingCoversPorts(table, { ...mapping, fields: withoutAudio }),
    /does not cover port referenceAudio/u,
  );

  const { excerpt: _excerpt, ...missingPort } = mapping.fields;
  assert.throws(
    () => assertMappingCoversPorts(table, { ...mapping, fields: missingPort }),
    /does not cover port excerpt/u,
  );

  const wrongShape: GenerationWireMapping = {
    ...mapping,
    fields: { ...mapping.fields, voiceId: { as: "value", field: "voice_ids" } },
  };
  assert.throws(() => assertMappingCoversPorts(table, wrongShape), /must use valueArray/u);
});

test("runtime media stays on graph edges until a model-owned draft is finalized", async () => {
  const { image, video, audio } = await artifacts();
  const base = sealGenerationRequestDraft(table, {
    prompt: ["hello"], duration: [8], resolution: ["720p"],
  });
  const audioPort = table.ports.find((port) => port.name === "referenceAudio");
  const imagePort = table.ports.find((port) => port.name === "referenceImage");
  const excerptPort = table.ports.find((port) => port.name === "excerpt");
  assert.ok(audioPort?.value.kind === "media");
  assert.ok(imagePort?.value.kind === "media");
  assert.ok(excerptPort?.value.kind === "media");

  // An intermediate draft may receive audio first; the exact cross-port rule
  // is enforced only once all explicitly connected edges have been attached.
  const withAudio = bindGenerationMedia(table, base, "referenceAudio",
    sealGenerationMediaBinding(audioPort as never, { role: "audio" }), audio);
  assert.throws(() => finalizeGenerationRequestDraft(table, withAudio), /needs at least one of referenceImage/u);
  const withImage = bindGenerationMedia(table, withAudio, "referenceImage",
    sealGenerationMediaBinding(imagePort as never, { role: "image" }), image);
  const withExcerpt = bindGenerationMedia(table, withImage, "excerpt",
    sealGenerationMediaBinding(excerptPort as never, {
      role: "video", fields: { startSec: 1, endSec: 3 },
    }), video);
  const exact = finalizeGenerationRequestDraft(table, withExcerpt);
  assert.deepEqual(exact.ports.referenceAudio?.[0], { role: "audio", artifact: audio });
  assert.deepEqual(exact.ports.excerpt?.[0], {
    role: "video", artifact: video, fields: { startSec: 1, endSec: 3 },
  });
  assert.throws(() => bindGenerationMedia(table, base, "referenceImage",
    sealGenerationMediaBinding(imagePort as never, { role: "image" }), audio), /image\//u);
});
