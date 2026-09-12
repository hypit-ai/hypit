import assert from "node:assert/strict";
import test from "node:test";

import { EndpointRegistry, MemoryResourceStore } from "@hypit/driver-node";
import { ttsEndpoints, sealTtsRequest } from "@hypit/tts";
import type { CanonicalValue, Need } from "@hypit/protocol";
import { createXiaomiMimoProvider } from "@hypit/provider-xiaomi-mimo";

function need(
  endpoint: (typeof ttsEndpoints)[keyof typeof ttsEndpoints],
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

async function invoke(request: Need, resources: MemoryResourceStore, fetch: typeof globalThis.fetch) {
  const provider = createXiaomiMimoProvider({ fetch });
  const registry = new EndpointRegistry();
  await provider.install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  return await resolution.registration.handler({
    command: { kind: "fulfill-need", id: `command:${request.id}`, need: request },
    need: request,
    resources,
    credentials: { apiKey: { secret: "test-key" } },
  });
}

function audioResponse(bytes: Uint8Array) {
  return Response.json({ choices: [{ message: { audio: { data: Buffer.from(bytes).toString("base64") } } }] });
}

test("the official Provider maps Voice Design and Voice Clone to Xiaomi's wire", async () => {
  const resources = new MemoryResourceStore();
  const voiceReference = await resources.put(new Uint8Array([1, 2, 3, 4]), "audio/wav");
  const cases = [
    {
      endpoint: ttsEndpoints.voiceDesign,
      request: sealTtsRequest("mimo-v2.5-tts-voicedesign", {
        text: ["Keep every authored word."],
        voiceDescription: ["A clear, grounded female voice."],
      }),
      assertBody(body: Record<string, unknown>) {
        assert.deepEqual(body.audio, { format: "wav" });
        assert.deepEqual(body.messages, [
          { role: "user", content: "A clear, grounded female voice." },
          { role: "assistant", content: "Keep every authored word." },
        ]);
      },
    },
    {
      endpoint: ttsEndpoints.voiceClone,
      request: sealTtsRequest("mimo-v2.5-tts-voiceclone", {
        text: ["Keep every authored word."],
        instruction: ["Calm and restrained."],
        voiceReference: [{ role: "audio", artifact: voiceReference }],
      }),
      assertBody(body: Record<string, unknown>) {
        const audio = body.audio as Record<string, string>;
        assert.equal(audio.format, "wav");
        assert.match(audio.voice!, /^data:audio\/wav;base64,/u);
        assert.deepEqual(body.messages, [
          { role: "user", content: "Calm and restrained." },
          { role: "assistant", content: "Keep every authored word." },
        ]);
      },
    },
  ];

  for (const [index, item] of cases.entries()) {
    const result = await invoke(
      need(item.endpoint, item.request as unknown as CanonicalValue, String(index)),
      resources,
      async (input, init) => {
        assert.equal(String(input), "https://api.xiaomimimo.com/v1/chat/completions");
        assert.equal(new Headers(init?.headers).get("api-key"), "test-key");
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.equal(body.model, item.endpoint.capability.name);
        item.assertBody(body);
        return audioResponse(new Uint8Array([9, 8, 7, index]));
      },
    );
    assert.equal(result.value.kind, "inline");
    const set = result.value.kind === "inline" ? result.value.value as Record<string, unknown> : {};
    const audios = set.audios as Array<{ mediaType: string; resource: string }>;
    assert.equal(audios[0]?.mediaType, "audio/wav");
    assert.equal(await resources.has(audios[0]!.resource as `res_${string}`), true);
  }
});
