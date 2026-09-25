import assert from "node:assert/strict";
import test from "node:test";
import { createElevenLabsProvider } from "../src/index.js";
import { catalog, models } from "@hypit/elevenlabs-models";
import {
  registrations,
  context,
  json,
  png,
} from "../../direct-model-kit/test/fixture.js";
import { requestFor } from "../src/requests.js";
import type { GenerationPortValue } from "@hypit/generation";
import type { EndpointCheckpoint } from "@hypit/endpoint-kit";

test("all published image/video models submit, checkpoint, poll and collect through ordinary Hypit endpoints", async () => {
  for (const model of catalog.filter((m) => !m.operation)) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, ...(init ? { init } : {}) });
      if (url.startsWith("https://assets.test/")) {
        assert(!new Headers(init?.headers).has("xi-api-key"));
        return new Response(png, {
          headers: { "content-type": model.result + "/test" },
        });
      }
      assert.equal(
        new Headers(init?.headers).get("xi-api-key"),
        "unit-test-key",
      );
      if (init?.method === "POST")
        return json({ id: "job-1", status: "pending" });
      return json({
        id: "job-1",
        status: "completed",
        content_url: "https://assets.test/result",
        content_mime_type: model.result + "/test",
      });
    };
    const reg = (
      await registrations(
        createElevenLabsProvider({ fetch: fetcher, allowGatedModels: true }),
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
        const role = port.value.accepts[0]!;
        const artifact = await c.resources.put(
          png,
          role === "image"
            ? "image/png"
            : role === "audio"
              ? "audio/wav"
              : "video/mp4",
        );
        ports[port.name] = [{ role, artifact }];
      } else ports[port.name] = ["A useful scene"];
    }
    const req = models.definition.endpoints[model.model]!.sealRequest(ports);
    const startContext = {
      ...c,
      need: {
        ...c.need,
        constraints: req as unknown as import("@hypit/protocol").CanonicalValue,
      },
      operation: "op-1",
    };
    const checkpoints: EndpointCheckpoint[] = [];
    const started = await reg.async!.start({
      ...startContext,
      checkpoint: async (p) => {
        checkpoints.push(p);
      },
    });
    assert.equal(started.status, "pending", model.model);
    assert.equal(checkpoints.length, 1);
    assert(!JSON.stringify(checkpoints).includes("unit-test-key"));
    if (started.status !== "pending") throw Error("start failed");
    const polled = await reg.async!.poll({
      ...startContext,
      handle: started.handle,
    });
    assert.equal(polled.status, "ready");
    if (polled.status !== "ready") throw Error("not ready");
    const done = await reg.async!.collect!({
      ...startContext,
      handle: polled.handle,
    });
    assert.equal(done.status, "completed");
    const postCalls = calls.filter((c) => c.init?.method === "POST");
    assert.equal(postCalls.length, 1);
    const body = JSON.parse(String(postCalls[0]!.init!.body));
    assert.equal(body.model_id, model.model);
    assert.equal(
      postCalls[0]!.url,
      `https://api.us.elevenlabs.io${model.path}`,
    );
  }
});

test("Veo preserves reference role, frame role and false audio setting", async () => {
  const reg = (await registrations(createElevenLabsProvider())).find(
    (r) => r.capability.name === "veo-3.1-generate-001",
  )!;
  const c = context(reg, {}),
    artifact = await c.resources.put(png, "image/png"),
    m = catalog.find((m) => m.model === "veo-3.1-generate-001")!;
  const request = models.definition.endpoints[m.model]!.sealRequest({
    prompt: ["Scene"],
    generateAudio: [false],
    images: [{ role: "image", artifact, fields: { referenceRole: "subject" } }],
  });
  const body = JSON.parse(String((await requestFor(m, request, c)).init.body));
  assert.equal(body.generate_audio, false);
  assert.throws(() =>
    models.definition.endpoints[m.model]!.sealRequest({
      ...request.ports,
      startFrame: [{ role: "image", artifact }],
    }),
  );
  assert.equal(body.images[0].role, "subject");
  assert.equal(body.images[0].image.type, "inline_base64");
});

test("gated models, unknown parameters and unsupported existing GPT Image fields fail before network", async () => {
  let calls = 0;
  const regs = await registrations(
    createElevenLabsProvider({
      fetch: async () => {
        calls++;
        throw Error("must not call");
      },
    }),
  );
  const gated = regs.find(
    (r) => r.capability.name === "bytedance-seedance-v2",
  )!;
  const g = await gated.async!.start({
    ...context(gated, { prompt: ["Test"] }),
    operation: "op",
  });
  assert.equal(g.status, "failed");
  const alias = regs.find(
    (r) => r.capability.module.name === "@hypit/gpt-image",
  )!;
  const a = await alias.async!.start({
    ...context(alias, {
      prompt: ["Test"],
      aspectRatio: ["1:1"],
      resolution: ["1K"],
      background: ["transparent"],
    }),
    operation: "op",
  });
  assert.equal(a.status, "failed");
  const native = regs.find(
    (r) =>
      r.capability.module.name === "@hypit/elevenlabs-models" &&
      r.capability.name === "gpt-image-2",
  )!;
  const n = await native.async!.start({
    ...context(native, { prompt: ["Test"], madeUp: [true] }),
    operation: "op",
  });
  assert.equal(n.status, "failed");
  assert.equal(calls, 0);
});

test("uncertain submission is never retried and errors redact key and signed URLs", async () => {
  let calls = 0;
  const regs = await registrations(
    createElevenLabsProvider({
      fetch: async () => {
        calls++;
        return json(
          {
            detail: {
              status: "bad",
              message:
                "unit-test-key https://assets.test/private?signature=secret",
            },
          },
          500,
        );
      },
    }),
  );
  const reg = regs.find((r) => r.capability.name === "gpt-image-2")!;
  const r = await reg.async!.start({
    ...context(reg, { prompt: ["Test"] }),
    operation: "op",
  });
  assert.equal(r.status, "failed");
  assert.equal(calls, 1);
  assert(!JSON.stringify(r).includes("unit-test-key"));
  assert(!JSON.stringify(r).includes("signature=secret"));
});

test("narration, dialogue and voice conversion preserve voice selection and settings", async () => {
  const regs = await registrations(createElevenLabsProvider());
  const tts = catalog.find((m) => m.model === "eleven_v3")!,
    reg = regs.find((r) => r.capability.name === tts.model)!;
  const c = context(reg, {});
  const req = models.definition.endpoints[tts.model]!.sealRequest({
    text: ["Hello"],
    voiceId: ["voice_123"],
    stability: [0],
    useSpeakerBoost: [false],
  });
  const wire = await requestFor(tts, req, c),
    body = JSON.parse(String(wire.init.body));
  assert.equal(wire.path, "/v1/text-to-speech/voice_123");
  assert.deepEqual(body.voice_settings, {
    stability: 0,
    use_speaker_boost: false,
  });
  assert(!("voice_id" in body));
  const d = catalog.find((m) => m.operation === "dialogue")!;
  const dialogue = models.definition.endpoints[d.model]!.sealRequest({
    texts: ["Hello", "Bye"],
    voiceIds: ["one", "two"],
  });
  const db = JSON.parse(String((await requestFor(d, dialogue, c)).init.body));
  assert.deepEqual(db.inputs, [
    { text: "Hello", voice_id: "one" },
    { text: "Bye", voice_id: "two" },
  ]);
  assert.equal(db.model_id, "eleven_v3");
  assert.throws(
    () =>
      models.definition.endpoints[d.model]!.sealRequest({
        texts: ["Hello"],
        voiceIds: ["one", "two"],
      }),
    /equal lengths/,
  );
});

test("planning counts future image references against the service limit", async () => {
  const reg = (await registrations(createElevenLabsProvider())).find(
    (r) => r.capability.module.name === "@hypit/gpt-image",
  )!;
  for (const count of [1, 11]) {
    const request = {
      capability: reg.capability,
      returns: reg.returns,
      constraints: {
        ports: {
          prompt: ["A scene"],
          aspectRatio: ["1:1"],
          resolution: ["1K"],
          images: Array.from({ length: count }, (_, i) => ({
            role: "image",
            slot: `future-${i}`,
          })),
        },
      } as unknown as import("@hypit/protocol").CanonicalValue,
      pendingInputs: Array.from({ length: count }, () => ({
        input: "images",
        role: "image",
      })),
    };
    assert.equal(
      (await reg.options.supports!(request)).status,
      count === 1 ? "supported" : "unsupported",
    );
  }
});
