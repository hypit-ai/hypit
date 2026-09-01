import assert from "node:assert/strict";
import test from "node:test";

import { EndpointRegistry, MemoryResourceStore } from "@hypit/driver-node";
import { generationTypes } from "@hypit/generation";
import { mimoTtsEndpoints, sealMimoTtsRequest } from "@hypit/mimo-tts";
import type { CanonicalValue, Need } from "@hypit/protocol";
import { createXiaomiMimoProvider } from "@hypit/provider-xiaomi-mimo";

function need(constraints: CanonicalValue): Need {
  return {
    id: "need:mimo-voicedesign",
    capability: mimoTtsEndpoints.voiceDesign.capability,
    returns: mimoTtsEndpoints.voiceDesign.returns,
    constraints,
    result: "record:mimo-voicedesign",
  };
}

test("the official Provider maps only the VoiceDesign contract", async () => {
  const resources = new MemoryResourceStore();
  const provider = createXiaomiMimoProvider({
    fetch: async (input, init) => {
      assert.equal(String(input), "https://api.xiaomimimo.com/v1/chat/completions");
      assert.equal(new Headers(init?.headers).get("api-key"), "test-key");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "mimo-v2.5-tts-voicedesign");
      assert.deepEqual(body.audio, { format: "wav" });
      assert.deepEqual(body.messages, [
        { role: "user", content: "A clear, grounded female voice." },
        { role: "assistant", content: "Keep every authored word." },
      ]);
      return Response.json({ choices: [{ message: { audio: { data: Buffer.from([9, 8, 7]).toString("base64") } } }] });
    },
  });
  const registry = new EndpointRegistry();
  await provider.install(registry);
  const request = need(sealMimoTtsRequest("mimo-v2.5-tts-voicedesign", {
    text: ["Keep every authored word."],
    voiceDescription: ["A clear, grounded female voice."],
  }) as unknown as CanonicalValue);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  const result = await resolution.registration.handler({
    command: { kind: "fulfill-need", id: "command:mimo-voicedesign", need: request },
    need: request,
    resources,
    credentials: { apiKey: { secret: "test-key" } },
  });
  assert.equal(result.value.kind, "inline");
  const set = result.value.kind === "inline" ? result.value.value as Record<string, unknown> : {};
  const audios = set.audios as Array<{ mediaType: string; resource: string }>;
  assert.equal(audios[0]?.mediaType, "audio/wav");
  assert.equal(await resources.has(audios[0]!.resource as `res_${string}`), true);
});

test("Provider configuration owns credentials and queue policy, not model semantics", () => {
  const provider = createXiaomiMimoProvider({ defaultConcurrency: 3 });
  assert.equal(provider.offers.length, 1);
  assert.equal(provider.offers[0]?.returns.name, generationTypes.audioSet.name);
});
