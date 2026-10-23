import assert from "node:assert/strict";
import test from "node:test";
import { sealModelFieldBuilder } from "@hypit/generation/model-fields";
import type { ModelFieldRequest } from "@hypit/generation/model-fields";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, ProducerRef, Value } from "@hypit/protocol";
import { fixtureResource } from "../../../test/fixture-resource.js";
import {
  seedanceComponent, seedanceDefinition, seedanceEndpointsByModel, sealSeedanceRequest,
} from "../src/index.js";

const audio = (mediaType: string): BlobRef => ({
  kind: "blob", resource: fixtureResource("reference-audio"), size: 4, mediaType,
});
const settings = {
  prompt: ["A presenter explains the scene"], resolution: ["720p"], aspectRatio: ["9:16"],
  duration: [5], generateAudio: [true], webSearch: [false],
  referenceImage: [{ role: "image" as const, fields: { personReference: true }, artifact: {
    kind: "blob" as const, resource: fixtureResource("reference-image"), size: 4, mediaType: "image/png",
  } }],
};
const valueOf = (value: unknown): Value => ((canonicalize(value)));
const input = (value: Value) => ({ value });
async function produce(producer: ProducerRef, inputs: Record<string, { value: Value }>) {
  const facet = seedanceDefinition.component.producers.find((item) => item.producer.name === producer.name);
  assert.ok(facet);
  return await facet.handler({ inputs } as never);
}

for (const [model, endpoint] of Object.entries(seedanceEndpointsByModel)) {
  test(`${model}: visual classification survives runtime binding, finalization and generation`, async () => {
    const { referenceImage, ...scalars } = settings;
    for (const port of ["referenceImage", "referenceVideo", "firstFrame", "lastFrame"] as const) {
      const role = port === "referenceVideo" ? "video" : "image";
      const artifact = { ...referenceImage[0]!.artifact, mediaType: role === "video" ? "video/mp4" : "image/png" };
      const initial = { ...scalars, ...(port === "lastFrame" ? { firstFrame: referenceImage } : {}) };
      for (const fields of [undefined, {}, { personReference: "true" }]) {
        const binding = { role, ...(fields === undefined ? {} : { fields }) };
        assert.throws(() => endpoint.sealRequest({ ...initial, [port]: [{ ...binding, artifact }] }), /personReference/);
        await assert.rejects(produce(endpoint.mediaBindings[port]!.producer, {
          draft: input(valueOf(sealModelFieldBuilder(endpoint.ports, initial))),
          binding: input(valueOf(binding)), artifact: input(artifact),
        }), /personReference/);
      }
      for (const flag of [true, false]) {
        const binding = { role, fields: { personReference: flag } };
        const bound = await produce(endpoint.mediaBindings[port]!.producer, {
          draft: input(valueOf(sealModelFieldBuilder(endpoint.ports, initial))),
          binding: input(valueOf(binding)), artifact: input(artifact),
        });
        assert.equal(bound.kind, "output");
        const finalized = await produce(endpoint.finalizeProducer, { draft: input(bound.value) });
        assert.equal(finalized.kind, "output");
        const generated = await produce(endpoint.producer, { request: input(finalized.value) });
        assert.equal(generated.kind, "need");
        const request = generated.constraints as unknown as ModelFieldRequest;
        assert.deepEqual(request.ports[port], [{ ...binding, artifact }]);
      }
    }
    assert.throws(() => endpoint.sealRequest({ ...settings,
      referenceAudio: [{ role: "audio", artifact: audio("audio/wav"), fields: { personReference: true } }],
    }));
  });

  test(`${model}: M4A is rejected through runtime binding and complete request entry points`, async () => {
    for (const mediaType of ["audio/mp4", "audio/x-m4a"]) {
      const artifact = audio(mediaType);
      const ports = { ...settings, referenceAudio: [{ role: "audio" as const, artifact }] };
      // The generic envelope can represent this media; the exact model owns its restriction.
      const request = sealModelFieldBuilder(endpoint.ports, ports);
      assert.throws(() => sealSeedanceRequest(endpoint.ports.model as keyof typeof seedanceEndpointsByModel, ports), /m4a/);
      assert.throws(() => endpoint.sealRequest(ports), /m4a/);
      const validator = seedanceComponent.refinements.find((item) => item.type.name === endpoint.requestType.name)!;
      await assert.rejects(async () => validator.handler({ value: valueOf(request) } as never), /m4a/);
      await assert.rejects(produce(endpoint.finalizeProducer, { draft: input(valueOf(request)) }), /m4a/);
      await assert.rejects(produce(endpoint.producer, { request: input(valueOf(request)) }), /m4a/);
      await assert.rejects(produce(endpoint.mediaBindings.referenceAudio!.producer, {
        draft: input(valueOf(sealModelFieldBuilder(endpoint.ports, settings))),
        binding: input(valueOf({ role: "audio" })), artifact: input(artifact),
      }), /m4a/);
    }
  });

  test(`${model}: supported audio still binds, finalizes and becomes a generation request`, async () => {
    for (const mediaType of ["audio/wav", "audio/mpeg"]) {
      const artifact = audio(mediaType);
      const bound = await produce(endpoint.mediaBindings.referenceAudio!.producer, {
        draft: input(valueOf(sealModelFieldBuilder(endpoint.ports, settings))),
        binding: input(valueOf({ role: "audio" })), artifact: input(artifact),
      });
      assert.equal(bound.kind, "output");
      const finalized = await produce(endpoint.finalizeProducer, { draft: input(bound.value) });
      assert.equal(finalized.kind, "output");
      const generated = await produce(endpoint.producer, { request: input(finalized.value) });
      assert.equal(generated.kind, "need");
      assert.deepEqual(generated.constraints, endpoint.sealRequest({
        ...settings, referenceAudio: [{ role: "audio", artifact }],
      }));
    }
  });

}
