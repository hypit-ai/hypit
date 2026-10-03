import assert from "node:assert/strict";
import test from "node:test";
import {
  createElevenLabsProvider,
  createElevenLabsVoiceLibrary,
} from "../src/index.js";
import { catalog, models } from "@hypit/elevenlabs-models";
import {
  registrations,
  context,
  json,
} from "../../direct-model-kit/test/fixture.js";
import type { GenerationPortValue } from "@hypit/generation";

test("all production voice endpoints return Hypit audio without submitting another request", async () => {
  for (const model of catalog.filter((m) => m.operation)) {
    let calls = 0;
    const reg = (
      await registrations(
        createElevenLabsProvider({
          fetch: async (url, init) => {
            calls++;
            assert.equal(
              new Headers(init?.headers).get("xi-api-key"),
              "unit-test-key",
            );
            if (model.operation === "design")
              return json({
                previews: [
                  {
                    audio_base_64: Buffer.from("audio").toString("base64"),
                    generated_voice_id: "preview",
                    media_type: "audio/mpeg",
                  },
                ],
              });
            if (model.operation === "sts" || model.operation === "isolation") {
              assert(init?.body instanceof FormData);
              assert(init.body.get("audio") instanceof Blob);
            }
            return new Response("audio", {
              headers: { "content-type": "audio/mpeg" },
            });
          },
        }),
      )
    ).find(
      (r) =>
        r.capability.module.name === "@hypit/elevenlabs-models" &&
        r.capability.name === model.model,
    )!;
    const c = context(reg, {}),
      ports: Record<string, GenerationPortValue[]> = {};
    for (const port of model.ports) {
      if (!port.minItems) continue;
      if (port.value.kind === "media") {
        const artifact = await c.resources.put(
          new Uint8Array([1, 2, 3]),
          "audio/wav",
        );
        ports[port.name] = [{ role: "audio", artifact }];
      } else
        ports[port.name] = [
          port.name === "voiceId" || port.name === "voiceIds"
            ? "voice_123"
            : port.value.kind === "token"
              ? "a".repeat(port.value.minLength)
              : "Hello",
        ];
    }
    const request =
      models.definition.endpoints[model.model]!.sealRequest(ports);
    const result = await reg.handler!({
      ...c,
      need: {
        ...c.need,
        constraints:
          request as unknown as import("@hypit/protocol").CanonicalValue,
      },
    });
    assert.equal(result.value.kind, "inline");
    assert.equal(calls, 1, model.model);
  }
});

test("voice library keeps creation explicit and returns verification requirement", async () => {
  const calls: string[] = [];
  const library = createElevenLabsVoiceLibrary({
    credential: async () => "private-test-key",
    fetch: async (input, init) => {
      const url = String(input);
      calls.push(url);
      assert.equal(
        new Headers(init?.headers).get("xi-api-key"),
        "private-test-key",
      );
      if (url.endsWith("/voices/add")) {
        assert(init?.body instanceof FormData);
        assert.equal(init.body.getAll("files").length, 1);
        return json({ voice_id: "clone-1", requires_verification: true });
      }
      if (url.endsWith("/text-to-voice")) {
        assert.equal(
          JSON.parse(String(init?.body)).generated_voice_id,
          "preview-1",
        );
        return json({ voice_id: "design-1" });
      }
      return json({ voices: [] });
    },
  });
  assert.equal(calls.length, 0);
  const clone = await library.cloneVoice({
    name: "My voice",
    samples: [
      {
        name: "sample.wav",
        mediaType: "audio/wav",
        bytes: new Uint8Array([1, 2]),
      },
    ],
  });
  assert.deepEqual(clone, { voiceId: "clone-1", requiresVerification: true });
  assert.equal(
    await library.saveDesignedVoice({
      name: "Narrator",
      description: "A clear and friendly narrator voice",
      generatedVoiceId: "preview-1",
    }),
    "design-1",
  );
  assert.equal(calls.length, 2);
});
