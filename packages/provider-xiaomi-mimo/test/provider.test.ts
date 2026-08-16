import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import { EndpointRegistry, MemoryArtifactStore } from "@narratage/driver-node";
import { generationTypes } from "@narratage/generation";
import { mimoTtsEndpoints, sealMimoTtsRequest } from "@narratage/mimo-tts";
import type { CanonicalValue, Need } from "@narratage/protocol";
import { createXiaomiMimoProvider } from "@narratage/provider-xiaomi-mimo";

function need(
  endpoint: (typeof mimoTtsEndpoints)[keyof typeof mimoTtsEndpoints],
  constraints: CanonicalValue,
  id: string,
): Need {
  return {
    id: `need:${id}`,
    capability: endpoint.capability,
    returns: endpoint.returns,
    constraints,
    result: `record:${id}`,
  };
}

async function invoke(request: Need, artifacts: MemoryArtifactStore, fetch: typeof globalThis.fetch) {
  const provider = createXiaomiMimoProvider({
    fetch,
  });
  const registry = new EndpointRegistry();
  await provider.install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  return await resolution.registration.handler({
    command: { kind: "fulfill-need", id: `command:${request.id}`, need: request },
    need: request,
    artifacts,
    credentials: { apiKey: { secret: "test-key" } },
  });
}

function audioResponse(bytes: Uint8Array) {
  return Response.json({ choices: [{ message: { audio: { data: Buffer.from(bytes).toString("base64") } } }] });
}

test("the official Provider maps all three model contracts without owning them", async () => {
  const artifacts = new MemoryArtifactStore();
  const sample = await artifacts.put(new Uint8Array([1, 2, 3, 4]), "audio/wav");
  const cases = [
    {
      endpoint: mimoTtsEndpoints.preset,
      request: sealMimoTtsRequest("mimo-v2.5-tts", {
        text: ["Keep every authored word."], instruction: ["Warm and concise."], voice: ["Chloe"],
      }),
      assertBody(body: Record<string, unknown>) {
        assert.deepEqual(body.audio, { format: "wav", voice: "Chloe" });
        assert.equal((body.messages as unknown[]).length, 2);
      },
    },
    {
      endpoint: mimoTtsEndpoints.voiceDesign,
      request: sealMimoTtsRequest("mimo-v2.5-tts-voicedesign", {
        text: ["Keep every authored word."], voiceDescription: ["A clear, grounded female voice."],
      }),
      assertBody(body: Record<string, unknown>) {
        assert.deepEqual(body.audio, { format: "wav" });
        assert.equal((body.messages as unknown[]).length, 2);
      },
    },
    {
      endpoint: mimoTtsEndpoints.voiceClone,
      request: sealMimoTtsRequest("mimo-v2.5-tts-voiceclone", {
        text: ["Keep every authored word."], sample: [{ role: "audio", artifact: sample }],
      }),
      assertBody(body: Record<string, unknown>) {
        assert.match((body.audio as Record<string, string>).voice!, /^data:audio\/wav;base64,/u);
        assert.equal((body.messages as unknown[]).length, 1);
      },
    },
  ];
  for (const [index, item] of cases.entries()) {
    let calls = 0;
    const result = await invoke(
      need(item.endpoint, item.request as unknown as CanonicalValue, String(index)),
      artifacts,
      async (input, init) => {
        calls += 1;
        assert.equal(String(input), "https://api.xiaomimimo.com/v1/chat/completions");
        assert.equal(new Headers(init?.headers).get("api-key"), "test-key");
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.equal(body.model, item.endpoint.capability.name);
        assert.equal((body.messages as Array<Record<string, unknown>>).at(-1)?.role, "assistant");
        assert.equal((body.messages as Array<Record<string, unknown>>).at(-1)?.content, "Keep every authored word.");
        assert.equal("optimize_text_preview" in (body.audio as Record<string, unknown>), false);
        item.assertBody(body);
        return audioResponse(new Uint8Array([9, 8, 7, index]));
      },
    );
    assert.equal(calls, 1);
    assert.equal(result.value.kind, "inline");
    const set = result.value.kind === "inline" ? result.value.value as Record<string, unknown> : {};
    const audios = set.audios as Array<{ mediaType: string; digest: string }>;
    assert.equal(audios[0]?.mediaType, "audio/wav");
    assert.equal(await artifacts.has(audios[0]!.digest as `sha256:${string}`), true);
  }
});

test("Provider configuration owns credentials and queue policy, not model semantics", () => {
  const provider = createXiaomiMimoProvider({ defaultConcurrency: 3 });
  assert.equal(provider.offers.length, 3);
  assert.ok(provider.offers.every((binding) => binding.returns.name === generationTypes.audioSet.name));
});
