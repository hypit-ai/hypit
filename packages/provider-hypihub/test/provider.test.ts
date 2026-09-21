import assert from "node:assert/strict";
import test from "node:test";
import { encodeOAuth2Credential } from "@hypit/runtime";

import { EndpointRegistry, MemoryResourceStore } from "@hypit/driver-node";
import { defineEndpointPackage } from "@hypit/endpoint-kit";
import type { AsyncEndpoint } from "@hypit/endpoint-kit";
import type { CanonicalValue, Need } from "@hypit/protocol";
import { mimoSpeechEndpoints, sealMimoSpeechRequest } from "@hypit/mimo-speech";
import { fishAudioSpeechEndpoints, sealFishAudioSpeechRequest } from "@hypit/fishaudio-speech";
import { elevenLabsSpeechEndpoints, sealElevenLabsSpeechRequest } from "@hypit/elevenlabs-speech";
import { generationTypes } from "@hypit/generation";
import { gptImageEndpoints, sealGptImage2Request } from "@hypit/gpt-image";
import { sealSeedanceRequest, seedanceEndpoints } from "@hypit/seedance";
import { sealSpeechEvidenceAudio } from "@hypit/speech";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import { whisperXCapabilities, whisperXRequestForEvidenceAudio } from "@hypit/whisperx";
import { portraitMattingEndpoint, sealPortraitMattingRequest } from "@hypit/volcengine-matting";

import { createHypiHubProvider, diagnoseHypiHubProvider } from "../src/provider.js";

function need(constraints: CanonicalValue): Need {
  return {
    id: "need:hypihub-test",
    capability: seedanceEndpoints.mini!.capability,
    returns: seedanceEndpoints.mini!.returns,
    constraints,
    result: "record:hypihub-test",
  };
}

for (const operation of ["pricing", "generation"] as const) {
  test(`HypiHub ${operation} waits for separately bounded OAuth before starting the API deadline`, async () => {
    const request = need(sealSeedanceRequest("seedance-2-mini", {
      prompt: ["A presenter"], resolution: ["720p"], aspectRatio: ["9:16"],
      duration: [5], generateAudio: [true], webSearch: [false],
    }) as unknown as CanonicalValue);
    for (const stalls of [false, true]) {
      let saved = false;
      let apiCalls = 0;
      const credentials = { apiKey: {
        secret: encodeOAuth2Credential({ accessToken: "expired", refreshToken: "refresh", expiresAt: 1 }),
        replace: async () => { saved = true; },
      } };
      const provider = createHypiHubProvider({
        // A successful refresh intentionally outlasts the ordinary API deadline.
        requestTimeoutMs: stalls ? 1_000 : 5,
        pricingRequestTimeoutMs: stalls ? 1_000 : 5,
        oauthRequestTimeoutMs: stalls ? 15 : 1_000,
        fetch: async (input, init) => {
          if (String(input).endsWith("/oauth/token")) {
            if (stalls) return await new Promise<Response>((_resolve, reject) => {
              init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
            });
            await new Promise(resolve => setTimeout(resolve, 20));
            return Response.json({ access_token: "fresh", refresh_token: "rotated", expires_in: 3600 });
          }
          apiCalls += 1;
          assert.equal((init!.headers as Record<string, string>).authorization, "Bearer fresh");
          if (String(input).includes("/models/")) return Response.json({ endpoints: ["videos"] });
          if (String(input).endsWith("/videos")) return Response.json({ id: "job_oauth", status: "queued" });
          return Response.json({ pricing: {} });
        },
      });
      if (operation === "pricing") {
        const result = Promise.resolve(provider.readPricing!({ request, credentials: async () => credentials }));
        if (stalls) await assert.rejects(result, /HypiHub OAuth refresh timed out/u);
        else assert.equal((await result).length, 1);
      } else {
        const registry = new EndpointRegistry();
        await provider.install(registry);
        const resolution = registry.resolve(request);
        assert.equal(resolution.status, "resolved");
        assert.equal(resolution.registration.kind, "asynchronous");
        const result = await resolution.registration.endpoint.start({
          command: { kind: "fulfill-need", id: "command:oauth", need: request },
          need: request, resources: new MemoryResourceStore(), credentials, operation: "operation:oauth",
        });
        assert.equal(result.status, stalls ? "failed" : "pending");
        if (result.status === "failed") assert.match(result.failure.message, /HypiHub OAuth refresh timed out/u);
      }
      assert.equal(saved, !stalls);
      assert.equal(apiCalls, stalls ? 0 : operation === "pricing" ? 1 : 2);
    }
  });
}

async function endpointFor(request: Need, fetch: typeof globalThis.fetch): Promise<AsyncEndpoint> {
  const registry = new EndpointRegistry();
  await createHypiHubProvider({ fetch, pollIntervalMs: 0, requestTimeoutMs: 1_000 }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "asynchronous");
  return resolution.registration.endpoint;
}

test("HypiHub Seedance 2.5 resolves and submits 1080p without downgrading", async () => {
  const request: Need = {
    ...need(sealSeedanceRequest("seedance-2.5", {
      prompt: ["A presenter speaks to camera."], resolution: ["1080p"], aspectRatio: ["9:16"],
      duration: [5], generateAudio: [true], webSearch: [false],
    }) as unknown as CanonicalValue),
    capability: seedanceEndpoints.v25!.capability,
    returns: seedanceEndpoints.v25!.returns,
  };
  let submitted: unknown;
  const endpoint = await endpointFor(request, async (input, init) => {
    const url = String(input);
    if (url.endsWith("/models/seedance-2.5")) return Response.json({ endpoints: ["videos"] });
    if (url.endsWith("/videos")) {
      submitted = JSON.parse(String(init?.body));
      return Response.json({ id: "job_seedance25_1080p", status: "queued" });
    }
    throw new Error(`Unexpected request ${url}`);
  });
  const started = await endpoint.start({
    command: { kind: "fulfill-need", id: "command:seedance25", need: request },
    need: request, resources: new MemoryResourceStore(),
    credentials: { apiKey: { secret: "test-key" } }, operation: "operation:seedance25",
  });
  assert.equal(started.status, "pending");
  assert.deepEqual(submitted, {
    model: "seedance-2.5", prompt: "A presenter speaks to camera.",
    resolution: "1080p", aspect_ratio: "9:16", seconds: 5, generate_audio: true, web_search: false,
  });
});

test("HypiHub portrait matting uses the video job lifecycle and stores transparent output", async () => {
  const resources = new MemoryResourceStore();
  const source = await resources.put(new Uint8Array([1, 2, 3]), "video/mp4");
  const request: Need = {
    id: "need:portrait-matting", capability: portraitMattingEndpoint.capability, returns: portraitMattingEndpoint.returns,
    constraints: sealPortraitMattingRequest({ source: [{ role: "video", artifact: source }] }) as unknown as CanonicalValue,
    result: "record:cutout",
  };
  let submissions = 0;
  const registry = new EndpointRegistry();
  await createHypiHubProvider({
    publicAssetUrl: async (artifact) => { assert.equal(artifact.resource, source.resource); return "https://media.example.test/source.mp4"; },
    pollIntervalMs: 0,
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/models/matte-portrait-video")) return Response.json({ endpoints: ["videos"] });
      if (url.endsWith("/videos")) {
        submissions++;
        assert.deepEqual(JSON.parse(String(init?.body)), {
          model: "matte-portrait-video", ref_video_url: "https://media.example.test/source.mp4", format: "WEBM",
        });
        return Response.json({ id: "job_cutout", status: "queued" });
      }
      if (url.endsWith("/jobs/job_cutout")) return Response.json({ id: "job_cutout", status: "succeeded" });
      if (url.endsWith("/jobs/job_cutout/assets")) return Response.json({ items: [{ url: "https://media.example.test/cutout.webm" }] });
      if (url.endsWith("/cutout.webm")) return new Response(new Uint8Array([4, 5, 6]), { headers: { "content-type": "video/webm" } });
      throw new Error(`Unexpected request ${url}`);
    },
  }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "asynchronous");
  const endpoint = resolution.registration.endpoint;
  const context = { command: { kind: "fulfill-need" as const, id: "command:cutout", need: request },
    need: request, resources, credentials: { apiKey: { secret: "test-key" } }, operation: "operation:cutout" };
  const started = await endpoint.start(context);
  assert.equal(started.status, "pending");
  if (started.status !== "pending") return;
  const ready = await endpoint.poll({ ...context, handle: started.handle! });
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;
  const result = await endpoint.collect!({ ...context, handle: ready.handle });
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.result.value.kind, "inline");
  assert.equal(submissions, 1);
  const artifact = (result.result.value as unknown as { kind: "inline"; value: { videos: [typeof source] } }).value.videos[0];
  assert.equal(artifact.mediaType, "video/webm");
  assert.deepEqual(await resources.get(artifact.resource), new Uint8Array([4, 5, 6]));
});

function wav(sampleFrames: number): Uint8Array {
  const bytes = new Uint8Array(44 + sampleFrames * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  write(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, sampleFrames * 2, true);
  return bytes;
}

test("HypiHub declares its own credential acquisition flow", () => {
  const [credential] = createHypiHubProvider().credentials;
  assert.equal(credential?.acquisition?.kind, "oauth2-pkce");
  assert.equal(credential?.acquisition?.authorizationEndpoint, "https://hypit.ai/oauth/consent");
  assert.equal(credential?.acquisition?.tokenEndpoint, "https://hypit.ai/oauth/token");
  assert.equal(credential?.acquisition?.requestTimeoutMs, 30_000);
});

test("HypiHub publishes GPT Image request limits through its Endpoint offer", () => {
  const offer = createHypiHubProvider().offers.find((item) => item.capability.name === "gpt-image-2");
  assert.ok(offer);
  assert.deepEqual(offer.supports?.({
    capability: offer.capability,
    returns: offer.returns,
    constraints: {
      ports: {
        prompt: ["cutout"], aspectRatio: ["1:1"], resolution: ["2K"], background: ["opaque"],
      },
    },
  }), {
    status: "unsupported",
    reason: "HypiHub GPT Image 2 accepts the background option only at 1K; omit it at 2K",
  });
});

test("HypiHub derives credential acquisition from its configured service origin", () => {
  const [credential] = createHypiHubProvider({
    baseUrl: "https://gateway.example.test/v1",
    oauthRequestTimeoutMs: 12_000,
  }).credentials;
  assert.equal(credential?.acquisition?.authorizationEndpoint, "https://gateway.example.test/oauth/consent");
  assert.equal(credential?.acquisition?.tokenEndpoint, "https://gateway.example.test/oauth/token");
  assert.equal(credential?.acquisition?.requestTimeoutMs, 12_000);
});

test("HypiHub returns its current model-pricing document", async () => {
  const provider = createHypiHubProvider({
    pricingRequestTimeoutMs: 1_000,
    fetch: async (input, init) => {
      assert.equal(String(input), "https://hypit.ai/v1/pricing?model=seedance-2");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-key");
      return Response.json({
        object: "model_pricing",
        model: "seedance-2",
        pricing: { mode: "per_second", per_second_usd: 0.1045 },
      });
    },
  });
  const request = {
    capability: seedanceEndpoints.standard!.capability,
    returns: seedanceEndpoints.standard!.returns,
    constraints: sealSeedanceRequest("seedance-2", {
    prompt: ["A presenter speaks to camera."], resolution: ["720p"], aspectRatio: ["9:16"],
    duration: [5], generateAudio: [true], webSearch: [false],
    }) as unknown as CanonicalValue,
  };
  assert.deepEqual(await provider.readPricing!({
    request,
    credentials: async () => ({ apiKey: { secret: "test-key" } }),
  }), [{
    source: "https://hypit.ai/v1/pricing?model=seedance-2",
    data: {
      object: "model_pricing",
      model: "seedance-2",
      pricing: { mode: "per_second", per_second_usd: 0.1045 },
    },
  }]);
});

test("HypiHub retains operation prices when canonical-model references are still pending", async () => {
  const rateCard = {
    object: "model_pricing", model: "gpt-image-2",
    pricing: { mode: "per_image", per_image_usd: 0.03 },
    operations: [
      { operation: "text-to-image", pricing: { mode: "per_image", per_image_usd: 0.03 } },
      { operation: "image-to-image", pricing: { mode: "per_image", per_image_usd: 0.05 } },
    ],
  };
  const provider = createHypiHubProvider({
    pricingRequestTimeoutMs: 1_000,
    fetch: async (input) => {
      assert.equal(String(input), "https://hypit.ai/v1/pricing?model=gpt-image-2");
      return Response.json(rateCard);
    },
  });
  const request = {
    capability: { module: { name: "@hypit/gpt-image", version: "1" }, name: "gpt-image-2" },
    returns: generationTypes.imageSet,
    constraints: {
      ports: { prompt: ["A portrait."], aspectRatio: ["9:16"], resolution: ["1K"] },
    },
    pendingInputs: [{ input: "images", role: "image" }],
  } as const;
  const [document] = await provider.readPricing!({
    request,
    credentials: async () => ({ apiKey: { secret: "test-key" } }),
  });
  assert.deepEqual(document?.data, rateCard);
});

test("HypiHub doctor leaves expired OAuth refresh validity unknown without misidentifying the Store", async () => {
  const diagnostics = await diagnoseHypiHubProvider({ fetch: async () => {
    throw new Error("Read-only doctor must not rotate an expired credential");
  } }, {
    credentials: { apiKey: { secret: encodeOAuth2Credential({
      accessToken: "expired", refreshToken: "unverified-refresh", expiresAt: Date.now() - 1_000,
    }) } },
    capabilities: [whisperXCapabilities.alignment],
  });
  assert.equal(diagnostics[0]?.code, "HYPIHUB_OAUTH_REFRESH_UNCHECKED");
  assert.equal(diagnostics[0]?.severity, "warning");
  assert.doesNotMatch(diagnostics[0]!.message, /credential is read-only/u);
});

test("HypiHub doctor checks the authenticated catalogue only when actively invoked", async () => {
  let calls = 0;
  const diagnostics = await diagnoseHypiHubProvider({ fetch: async (input, init) => {
    calls += 1;
    assert.match(String(input), /\/v1\/models$/u);
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-key");
    return Response.json({ data: [{ id: "victor-upmeet/whisperx", endpoints: ["transcriptions"] }] });
  } }, {
    credentials: { apiKey: { secret: "test-key" } },
    capabilities: [whisperXCapabilities.alignment],
  });
  assert.equal(calls, 1);
  assert.deepEqual(diagnostics, []);
});

test("HypiHub doctor recognizes canonical cards without legacy aliases or substituting variants", async () => {
  const cards = [
    { id: "gpt-image-2", endpoints: ["images", "image_edits"] },
    { id: "seedream-5-lite", endpoints: ["images", "image_edits"] },
    { id: "minimax-h3", endpoints: ["videos"] },
    { id: "grok-imagine-video", endpoints: ["videos"] },
    { id: "seedance-2-mini", endpoints: ["videos"] },
  ];
  const capabilities = [
    { module: { name: "@hypit/gpt-image", version: "1" }, name: "gpt-image-2" },
    { module: { name: "@hypit/seedream", version: "1" }, name: "seedream-5-lite" },
    { module: { name: "@hypit/minimax-h3", version: "1" }, name: "minimax-h3" },
    { module: { name: "@hypit/grok-imagine", version: "1" }, name: "grok-imagine-video" },
    seedanceEndpoints.mini!.capability,
    { module: { name: "@hypit/grok-imagine", version: "1" }, name: "grok-imagine-video-1.5-preview" },
  ];
  const diagnostics = await diagnoseHypiHubProvider({
    fetch: async () => Response.json({ data: cards }),
  }, { credentials: { apiKey: { secret: "test-key" } }, capabilities });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "HYPIHUB_CAPABILITY_UNAVAILABLE");
  assert.match(diagnostics[0]!.message, /grok-imagine-video-1\.5-preview/u);
});

test("HypiHub declares both MiMo speech capabilities; who serves them is the Profile's binding", async () => {
  const registry = new EndpointRegistry();
  await createHypiHubProvider({ fetch: async () => { throw new Error("audio must not call fetch"); } }).install(registry);
  const needs = Object.values(mimoSpeechEndpoints).map((endpoint) => ({
    id: `need:hypihub-${endpoint.key}`,
    capability: endpoint.capability,
    returns: endpoint.returns,
    constraints: { ports: {} },
    result: `record:hypihub-${endpoint.key}`,
  }));
  assert.ok(needs.every((item) => registry.resolve(item).status === "resolved"));

  // A second Endpoint offering the same capability makes the choice the deployment's, not the Provider's.
  const other = defineEndpointPackage({
    module: { name: "example.tts", version: "1" },
    facet: "tts",
    instance: "mimo.official",
    pool: "mimo.official",
    capabilities: [{
      capability: mimoSpeechEndpoints.voiceDesign.capability,
      returns: mimoSpeechEndpoints.voiceDesign.returns,
      lifecycle: "immediate",
      handler: () => ({ value: { kind: "inline", value: null } }),
    }],
  });
  await other.install(registry);
  assert.equal(registry.resolve(needs[0]!).status, "ambiguous");
  registry.bind(mimoSpeechEndpoints.voiceDesign.capability, "mimo.official");
  const resolved = registry.resolve(needs[0]!);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.status === "resolved" ? resolved.registration.id : undefined, "mimo.official");
});

test("HypiHub stores both preview JSON and ordinary speech JSON as audio Resources", async () => {
  const resources = new MemoryResourceStore();
  const voiceReference = await resources.put(new Uint8Array([1, 2, 3, 4]), "audio/wav");
  const submitted: Record<string, unknown>[] = [];
  const provider = createHypiHubProvider({
    publicAssetUrl: async (artifact) => {
      assert.equal(artifact.resource, voiceReference.resource);
      return "https://hypit.ai/assets/voice.wav";
    },
    fetch: async (input, init) => {
      const url = String(input);
      if (url.includes("/models/")) return Response.json({ endpoints: ["audio_speech"] });
      assert.match(url, /\/audio\/speech$/u);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      submitted.push(body);
      const data = Buffer.from([9, 8, 7, submitted.length]).toString("base64");
      return cases[submitted.length - 1]!.previews
        ? Response.json({ object: "audio.voice_previews", previews: [
          { b64_json: data, mime_type: "audio/wav" },
          { b64_json: Buffer.from([6, 5, 4]).toString("base64"), mime_type: "audio/wav" },
        ] })
        : Response.json({ object: "audio.speech", b64_json: data, mime_type: "audio/wav" });
    },
  });
  const registry = new EndpointRegistry();
  await provider.install(registry);
  const cases = [
    {
      endpoint: mimoSpeechEndpoints.voiceDesign,
      constraints: sealMimoSpeechRequest("mimo-v2.5-tts-voicedesign", {
        text: ["A short voice sample."], voiceDescription: ["Warm and confident."],
      }),
      previews: true,
      wire: { model: "mimo-v2.5-tts-voicedesign", input: "A short voice sample.", voice_description: "Warm and confident." },
    },
    {
      endpoint: mimoSpeechEndpoints.voiceClone,
      constraints: sealMimoSpeechRequest("mimo-v2.5-tts-voiceclone", {
        text: ["Independent narration."], instruction: ["Quietly direct."],
        voiceReference: [{ role: "audio", artifact: voiceReference }],
      }),
      previews: false,
      wire: { model: "mimo-v2.5-tts-voiceclone", input: "Independent narration.", prompt: "Quietly direct.",
        reference_audio: ["https://hypit.ai/assets/voice.wav"] },
    },
    {
      endpoint: fishAudioSpeechEndpoints.voiceDesign,
      constraints: sealFishAudioSpeechRequest("voice-design-1", {
        text: ["A Fish Audio voice sample."], voiceDescription: ["A bright, playful young woman."],
      }),
      previews: true,
      wire: { model: "fishaudio/voice-design-1", input: "A Fish Audio voice sample.", voice_description: "A bright, playful young woman." },
    },
    {
      endpoint: fishAudioSpeechEndpoints.voiceClone,
      constraints: sealFishAudioSpeechRequest("voice-clone", {
        text: ["Fish Audio narration."], voiceReference: [{ role: "audio", artifact: voiceReference }],
      }),
      previews: false,
      wire: { model: "fishaudio/voice-clone", input: "Fish Audio narration.", voice_description: "reference",
        reference_audio: ["https://hypit.ai/assets/voice.wav"] },
    },
    {
      endpoint: elevenLabsSpeechEndpoints.voiceDesign,
      constraints: sealElevenLabsSpeechRequest("eleven_ttv_v3", {
        text: ["This is a clear conversational voice sample, with enough room to hear the speaker's warmth, energy and natural rhythm."],
        voiceDescription: ["A warm young woman with bright conversational delivery."],
      }),
      previews: true,
      wire: { model: "eleven_ttv_v3",
        input: "This is a clear conversational voice sample, with enough room to hear the speaker's warmth, energy and natural rhythm.",
        voice_description: "A warm young woman with bright conversational delivery." },
    },
  ];
  for (const [index, item] of cases.entries()) {
    const request = {
      id: `need:hypihub-speech-${index}`,
      capability: item.endpoint.capability,
      returns: item.endpoint.returns,
      constraints: item.constraints as unknown as CanonicalValue,
      result: `record:hypihub-speech-${index}`,
    };
    const resolution = registry.resolve(request);
    assert.equal(resolution.status, "resolved");
    assert.equal(resolution.registration.kind, "immediate");
    const result = await resolution.registration.handler({
      command: { kind: "fulfill-need", id: `command:hypihub-speech-${index}`, need: request },
      need: request,
      resources,
      credentials: { apiKey: { secret: "test-key" } },
    });
    assert.equal(result.value.kind, "inline");
    const set = result.value.kind === "inline" ? result.value.value as Record<string, unknown> : {};
    const audios = set.audios as Array<{ resource: `res_${string}` }>;
    assert.equal(audios.length, item.previews ? 2 : 1);
    for (const audio of audios) assert.equal(await resources.has(audio.resource), true);
    assert.deepEqual(submitted[index], { ...item.wire, output: "b64_json" });
  }
});

test("HypiHub uploads one referenced Resource once and submits its HTTPS URL", async () => {
  const resources = new MemoryResourceStore();
  const referenceBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const reference = await resources.put(referenceBytes, "image/png");
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter turns toward camera."],
    referenceImage: [
      { role: "image", artifact: reference, fields: { personReference: true } },
      { role: "image", artifact: reference, fields: { personReference: true } },
    ],
    resolution: ["720p"], aspectRatio: ["16:9"], duration: [5],
    generateAudio: [false], webSearch: [false],
  }) as unknown as CanonicalValue);
  const calls: string[] = [];
  const signedBatches: number[][] = [];
  const partAttempts = new Map<number, number>();
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/v1/files/uploads")) {
      assert.equal(init?.method, "POST");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-key");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.bytes, referenceBytes.byteLength);
      assert.equal(body.mime_type, "image/png");
      assert.equal(body.filename, "reference.png");
      assert.equal(body.is_person_reference, true);
      return Response.json({
        upload_mode: "s3_multipart",
        upload_id: "up_reference",
        part_size: 5,
        part_count: 3,
        concurrency: 2,
      });
    }
    if (url.endsWith("/v1/files/uploads/up_reference/parts")) {
      const body = JSON.parse(String(init?.body)) as {
        readonly parts: readonly {
          readonly part_number: number;
          readonly bytes: number;
          readonly checksum_sha256: string;
        }[];
      };
      signedBatches.push(body.parts.map((part) => part.part_number));
      return Response.json({ parts: body.parts.map((part) => ({
        part_number: part.part_number,
        url: `https://s3.example/reference-${part.part_number}?signature=secret`,
        headers: {
          "content-length": String(part.bytes),
          "x-amz-checksum-sha256": part.checksum_sha256,
        },
      })) });
    }
    if (url.startsWith("https://s3.example/reference")) {
      assert.equal(init?.method, "PUT");
      const match = /reference-(\d+)/u.exec(url);
      assert.ok(match);
      const part = Number(match[1]);
      const attempt = (partAttempts.get(part) ?? 0) + 1;
      partAttempts.set(part, attempt);
      if (part === 2 && attempt === 1) return new Response("retry", { status: 503 });
      return new Response(null, {
        headers: {
          etag: `part-${part}`,
          "x-amz-checksum-sha256": (init?.headers as Record<string, string>)["x-amz-checksum-sha256"] ?? "",
        },
      });
    }
    if (url.endsWith("/v1/files/uploads/up_reference/complete")) {
      const body = JSON.parse(String(init?.body)) as { readonly parts: readonly unknown[] };
      assert.equal(body.parts.length, 3);
      return Response.json({ url: "https://hypit.ai/files/as_reference.png" });
    }
    if (url.endsWith("/v1/models/seedance-2-mini")) {
      return Response.json({ endpoints: ["videos"] });
    }
    if (url.endsWith("/v1/videos")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "seedance-2-mini");
      assert.deepEqual(body.reference_image_urls, [
        "https://hypit.ai/files/as_reference.png",
        "https://hypit.ai/files/as_reference.png",
      ]);
      return Response.json({ id: "job_hypihub_test", status: "queued" });
    }
    if (url.endsWith("/v1/jobs/job_hypihub_test")) {
      return Response.json({ id: "job_hypihub_test", status: "succeeded" });
    }
    if (url.endsWith("/v1/jobs/job_hypihub_test/assets")) {
      return Response.json({ items: [{ url: "https://download.hypit.test/result.mp4" }] });
    }
    if (url === "https://download.hypit.test/result.mp4") {
      return new Response(new Uint8Array([9, 8, 7]), { headers: { "content-type": "video/mp4" } });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const endpoint = await endpointFor(request, fakeFetch);
  const common = {
    command: { kind: "fulfill-need", id: "command:hypihub-test", need: request } as const,
    need: request, resources, credentials: { apiKey: { secret: "test-key" } },
    operation: "operation:hypihub-test",
  };
  const started = await endpoint.start(common);
  assert.equal(started.status, "pending");
  assert.equal(calls.filter((url) => url.endsWith("/v1/files/uploads")).length, 1);
  assert.deepEqual(signedBatches, [[1, 2, 3], [2]]);
  assert.deepEqual([...partAttempts.entries()].sort(), [[1, 1], [2, 2], [3, 1]]);
  if (started.status !== "pending") return;
  const ready = await endpoint.poll({ ...common, handle: started.handle! });
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;
  const completed = await endpoint.collect!({ ...common, handle: ready.handle });
  assert.equal(completed.status, "completed");
});

test("HypiHub stops before paid submission when a reference upload fails", async () => {
  const resources = new MemoryResourceStore();
  const reference = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter turns toward camera."],
    referenceImage: [{ role: "image", artifact: reference, fields: { personReference: true } }],
    resolution: ["720p"], aspectRatio: ["16:9"], duration: [5],
    generateAudio: [false], webSearch: [false],
  }) as unknown as CanonicalValue);
  let signingCalls = 0;
  let uploadAttempts = 0;
  let cancelled = false;
  let paidSubmissions = 0;
  const registry = new EndpointRegistry();
  await createHypiHubProvider({
    uploadPartAttempts: 2,
    requestTimeoutMs: 1_000,
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/models/seedance-2-mini")) {
        return Response.json({ endpoints: ["videos"] });
      }
      if (url.endsWith("/v1/files/uploads")) {
        return Response.json({
          upload_mode: "s3_multipart",
          upload_id: "up_failure",
          part_size: 16,
          part_count: 1,
          concurrency: 1,
        });
      }
      if (url.endsWith("/v1/files/uploads/up_failure/parts")) {
        signingCalls += 1;
        const body = JSON.parse(String(init?.body)) as {
          readonly parts: readonly { readonly checksum_sha256: string }[];
        };
        return Response.json({ parts: [{
          part_number: 1,
          url: "https://private.s3.example/reference?signature=must-not-leak",
          headers: {
            "content-length": "3",
            "x-amz-checksum-sha256": body.parts[0]?.checksum_sha256,
          },
        }] });
      }
      if (url.startsWith("https://private.s3.example/")) {
        uploadAttempts += 1;
        throw new Error(`network failure at ${url}`);
      }
      if (url.endsWith("/v1/files/uploads/up_failure") && init?.method === "DELETE") {
        cancelled = true;
        return Response.json({});
      }
      if (url.endsWith("/v1/videos")) {
        paidSubmissions += 1;
        return Response.json({ id: "must-not-exist", status: "queued" });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "asynchronous");
  const outcome = await resolution.registration.endpoint.start({
    command: { kind: "fulfill-need", id: "command:hypihub-upload-failure", need: request },
    need: request,
    resources,
    credentials: { apiKey: { secret: "test-key" } },
    operation: "operation:hypihub-upload-failure",
  });
  assert.equal(outcome.status, "failed");
  assert.equal(signingCalls, 2);
  assert.equal(uploadAttempts, 2);
  assert.equal(cancelled, true);
  assert.equal(paidSubmissions, 0);
  assert.match(outcome.status === "failed" ? outcome.failure.message : "", /request preparation failed.*generation not submitted/u);
  assert.doesNotMatch(outcome.status === "failed" ? outcome.failure.message : "", /must-not-leak/u);
});

for (const language of ["en", "ko"]) test(`HypiHub forwards ${language} for the Provider-neutral WhisperX alignment capability`, async () => {
  const resources = new MemoryResourceStore();
  const bytes = wav(32_000);
  const artifact = await resources.put(bytes, "audio/wav");
  const request: Need = {
    id: "need:hypihub-whisperx",
    capability: whisperXCapabilities.alignment,
    returns: speechEvidenceTypes.alignedTranscript,
    constraints: whisperXRequestForEvidenceAudio(sealSpeechEvidenceAudio({
      artifact,
      sampleFrames: 32_000,
    }), { language }) as unknown as CanonicalValue,
    result: "record:hypihub-whisperx",
  };
  let submitted = false;
  const registry = new EndpointRegistry();
  await createHypiHubProvider({ fetch: async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/models/victor-upmeet%2Fwhisperx")) {
      return Response.json({ endpoints: ["transcriptions"] });
    }
    if (url.endsWith("/v1/files/uploads")) {
      return Response.json({
        upload_mode: "s3_multipart",
        upload_id: "up_whisperx",
        part_size: 100_000,
        part_count: 1,
        concurrency: 1,
      });
    }
    if (url.endsWith("/v1/files/uploads/up_whisperx/parts")) {
      const body = JSON.parse(String(init?.body)) as {
        readonly parts: readonly { readonly checksum_sha256: string }[];
      };
      return Response.json({ parts: [{
        part_number: 1,
        url: "https://s3.example/whisperx?signature=secret",
        headers: {
          "content-length": String(bytes.byteLength),
          "x-amz-checksum-sha256": body.parts[0]?.checksum_sha256,
        },
      }] });
    }
    if (url.startsWith("https://s3.example/whisperx")) {
      assert.deepEqual(new Uint8Array(await new Response(init?.body).arrayBuffer()), bytes);
      return new Response(null, { headers: { etag: "whisperx" } });
    }
    if (url.endsWith("/v1/files/uploads/up_whisperx/complete")) {
      return Response.json({ url: "https://hypit.ai/files/alignment-evidence.wav" });
    }
    if (url.endsWith("/v1/audio/transcriptions")) {
      submitted = true;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "victor-upmeet/whisperx");
      assert.equal(body.language, language);
      assert.equal(body.response_format, "verbose_json");
      assert.equal(body.url, "https://hypit.ai/files/alignment-evidence.wav");
      assert.deepEqual(body.timestamp_granularities, ["segment", "word"]);
      return Response.json({
        language,
        words: [
          { word: "hello", start: 0.1, end: 0.4 },
          { word: "world", start: 1.2, end: 1.6 },
        ],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  } }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  const result = await resolution.registration.handler({
    command: { kind: "fulfill-need", id: "command:hypihub-whisperx", need: request },
    need: request,
    resources,
    credentials: { apiKey: { secret: "test-key" } },
  });
  assert.equal(submitted, true);
  assert.deepEqual(result.value, { kind: "inline", value: { passages: [{
    startSample: 1_600,
    endSampleExclusive: 25_600,
    words: [
      { text: "hello", startSample: 1_600, endSampleExclusive: 6_400 },
      { text: "world", startSample: 19_200, endSampleExclusive: 25_600 },
    ],
    chars: [],
  }] } });
});

test("HypiHub exposes model groups beneath its own total capacity", async () => {
  const registry = new EndpointRegistry();
  await createHypiHubProvider({ pool: "hub-account", defaultConcurrency: 8,
    capabilityConcurrency: { "seedance-2-mini": 2, transcription: 1 } }).install(registry);
  const requests = [
    need({}),
    { ...need({}), capability: whisperXCapabilities.alignment, returns: speechEvidenceTypes.alignedTranscript },
  ];
  for (const [index, request] of requests.entries()) {
    const selected = registry.resolve(request);
    assert.equal(selected.status, "resolved");
    assert.deepEqual(selected.registration.scheduling?.resources, [
      { id: "pool:hub-account", limit: 8 },
      { id: `capacity:hub-account/${["seedance-2-mini", "transcription"][index]}`, limit: [2, 1][index] },
    ]);
  }
  assert.throws(() => createHypiHubProvider({ capabilityConcurrency: { invented: 1 } }), /unknown HypiHub capacity/);
});

test("HypiHub operation deadlines fail while polling transport errors keep the job pending", async () => {
  const request = need({});
  let requests = 0;
  const registry = new EndpointRegistry();
  await createHypiHubProvider({ pollIntervalMs: 0, operationTimeoutMs: 60_000,
    fetch: async (url) => {
      requests++; assert.match(String(url), /\/jobs\/test$/);
      throw new Error("offline");
    } }).install(registry);
  const selected = registry.resolve(request);
  assert.equal(selected.status, "resolved"); assert.equal(selected.registration.kind, "asynchronous");
  const endpoint = selected.registration.endpoint;
  const common = { command: { kind: "fulfill-need", id: "need:test", need: request } as const,
    need: request, resources: new MemoryResourceStore(), credentials: { apiKey: { secret: "test" } }, operation: "op:test",
    handle: { contract: "hypit.hypihub-operation@1", jobId: "test",
      route: `${request.capability.module.name}@${request.capability.module.version}#${request.capability.name}`, startedAt: 0 } };
  const timedOut = await endpoint.poll(common);
  assert.equal(timedOut.status, "failed");
  assert.equal(timedOut.status === "failed" && timedOut.failure.code, "HYPIHUB_OPERATION_TIMEOUT");
  assert.equal(requests, 0);
  const offline = await endpoint.poll({ ...common, handle: { ...common.handle, startedAt: Date.now() } });
  assert.equal(offline.status, "pending");
  assert.equal(offline.status === "pending" && offline.progress?.phase, "retrying");
  assert.equal(requests, 1);
});

test("reference URL reuse includes its authored classification and forwards it to custom transport", async () => {
  const resources = new MemoryResourceStore();
  const reference = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const flags = [true, false, true];
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A person waves."], resolution: ["720p"], aspectRatio: ["9:16"],
    duration: [5], generateAudio: [false], webSearch: [false],
    referenceImage: flags.map((flag) => ({ role: "image", artifact: reference,
      fields: { personReference: flag } })),
  }) as unknown as CanonicalValue);
  const seen: unknown[] = [];
  const provider = createHypiHubProvider({
    publicAssetUrl: async (_artifact, _resources, fields) => {
      seen.push(fields);
      return `https://media.test/${String(fields?.personReference)}`;
    },
    fetch: async (input, init) => {
      if (String(input).includes("/models/")) return Response.json({ endpoints: ["videos"] });
      assert.deepEqual(JSON.parse(String(init?.body)).reference_image_urls, flags.map((flag) => `https://media.test/${String(flag)}`));
      return Response.json({ id: "classified-inputs", status: "queued" });
    },
  });
  const registry = new EndpointRegistry();
  await provider.install(registry);
  const resolved = registry.resolve(request);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.registration.kind, "asynchronous");
  const started = await resolved.registration.endpoint.start({ command: { kind: "fulfill-need", id: "classified", need: request }, need: request, resources,
    credentials: { apiKey: { secret: "test-key" } }, operation: "classified" });
  assert.equal(started.status, "pending");
  assert.deepEqual(seen, [{ personReference: true }, { personReference: false }]);
});

test("generation and voice cloning check their exact catalogue operation before resolving references", async () => {
  const resources = new MemoryResourceStore();
  const image = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const voice = await resources.put(wav(100), "audio/wav");
  const cases = [
    {
      endpoint: seedanceEndpoints.mini!, model: "seedance-2-mini", operation: "videos", path: "/videos",
      constraints: sealSeedanceRequest("seedance-2-mini", {
        prompt: ["A presenter speaks."], referenceImage: [{ role: "image", artifact: image, fields: { personReference: true } }],
        resolution: ["720p"], aspectRatio: ["9:16"], duration: [5], generateAudio: [true], webSearch: [false],
      }),
      references: true,
    },
    {
      endpoint: gptImageEndpoints.image!, model: "gpt-image-2", operation: "image_edits", path: "/images/edits",
      constraints: sealGptImage2Request({ prompt: ["Edit this portrait."], aspectRatio: ["1:1"], resolution: ["1K"],
        images: [{ role: "image", artifact: image }],
      }),
      references: true,
    },
    {
      endpoint: gptImageEndpoints.image!, model: "gpt-image-2", operation: "images", path: "/images/generations",
      constraints: sealGptImage2Request({ prompt: ["A portrait."], aspectRatio: ["1:1"], resolution: ["1K"] }),
      references: false,
    },
    {
      endpoint: mimoSpeechEndpoints.voiceClone, model: "mimo-v2.5-tts-voiceclone", operation: "audio_speech", path: "/audio/speech",
      constraints: sealMimoSpeechRequest("mimo-v2.5-tts-voiceclone", {
        text: ["Continue speaking."], voiceReference: [{ role: "audio", artifact: voice }],
      }),
      references: true,
    },
  ];
  for (const item of cases) for (const availability of ["missing", "different-operation", "undeclared", "unknown", "available"] as const) {
    const events: string[] = [];
    const progress: string[] = [];
    const registry = new EndpointRegistry();
    await createHypiHubProvider({
      publicAssetUrl: async (artifact) => {
        events.push("reference");
        return `https://media.test/${artifact.resource}`;
      },
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === `/v1/models/${encodeURIComponent(item.model)}`) {
          events.push("catalogue");
          if (availability === "missing") return Response.json({ error: { code: "model_not_found", message: "No route for this account." } }, {
            status: 404, headers: { "x-request-id": "catalogue-request" },
          });
          if (availability === "unknown") throw new Error("Connection closed before catalogue response");
          if (availability === "undeclared") return Response.json({ id: item.model });
          return Response.json({ endpoints: availability === "different-operation" ? ["transcriptions"] : [item.operation] });
        }
        assert.equal(url.pathname, `/v1${item.path}`);
        events.push("submit");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, item.model);
        if (item.operation === "image_edits") assert.equal(body.reference_images.length, 1);
        if (item.operation === "images") assert.equal(body.reference_images, undefined);
        if (item.operation === "audio_speech") return new Response(new Uint8Array(wav(100)), { headers: { "content-type": "audio/wav" } });
        return Response.json({ id: "selected-job", status: "queued" });
      },
    }).install(registry);
    const request: Need = {
      id: "need:catalogue", capability: item.endpoint.capability, returns: item.endpoint.returns,
      constraints: item.constraints as unknown as CanonicalValue, result: "result:catalogue",
    };
    const selected = registry.resolve(request);
    assert.equal(selected.status, "resolved");
    const context = {
      command: { kind: "fulfill-need" as const, id: "command:catalogue", need: request }, need: request, resources,
      credentials: { apiKey: { secret: "test-key" } }, operation: "operation:catalogue",
      reportProgress: async (value: { readonly phase?: string }) => { progress.push(value.phase!); },
    };
    let failed: { code?: string; message: string } | undefined;
    if (selected.registration.kind === "asynchronous") {
      const outcome = await selected.registration.endpoint.start(context);
      if (outcome.status === "failed") failed = outcome.failure;
      else assert.equal(outcome.status, "pending");
    } else {
      assert.equal(selected.registration.kind, "immediate");
      try { await selected.registration.handler(context); }
      catch (error) { failed = error as Error & { code?: string }; }
    }
    if (availability === "available") {
      assert.equal(failed, undefined);
      assert.deepEqual(events, item.references ? ["catalogue", "reference", "submit"] : ["catalogue", "submit"]);
      assert.match(progress.at(-1)!, /Submitting HypiHub request/u);
    } else {
      assert.ok(failed);
      assert.deepEqual(events, ["catalogue"], "neither a reference nor another model is tried");
      assert.match(failed.message, /model catalogue check failed.*references uploaded=0; generation not submitted/u);
      assert.ok(failed.message.includes(`model=${item.model}; operation=${item.operation}`));
      if (availability === "missing") {
        assert.equal(failed.code, "model_not_found");
        assert.match(failed.message, /HTTP 404.*request=catalogue-request.*No route for this account/u);
      } else if (availability === "different-operation") {
        assert.match(failed.message, /does not list operation.*listed operations: transcriptions/u);
      } else if (availability === "undeclared") {
        assert.match(failed.message, /returned no valid operation list.*is unknown/u);
        assert.doesNotMatch(failed.message, /does not list operation|model_not_found/u);
      } else {
        assert.match(failed.message, /Connection closed before catalogue response/u);
        assert.doesNotMatch(failed.message, /model_not_found/u);
      }
      assert.equal(progress.length, 1);
      assert.match(progress[0]!, /Reading HypiHub model catalogue/u);
    }
  }
});

test("an unavailable model reports availability without prescribing another login", async () => {
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter speaks."], resolution: ["720p"], aspectRatio: ["9:16"],
    duration: [5], generateAudio: [true], webSearch: [false],
  }) as unknown as CanonicalValue);
  const endpoint = await endpointFor(request, async () => Response.json({ error: "model_not_found" }, { status: 404 }));
  const outcome = await endpoint.start({
    command: { kind: "fulfill-need", id: "command:unavailable", need: request },
    need: request, resources: new MemoryResourceStore(),
    credentials: { apiKey: { secret: "test-key" } }, operation: "operation:unavailable",
  });
  assert.equal(outcome.status, "failed");
  if (outcome.status !== "failed") return;
  assert.match(outcome.failure.message, /404.*model_not_found/u);
  assert.doesNotMatch(outcome.failure.message, /sign in|auth login/iu);
});

test("HTTP evidence keeps model, request id and the complete public reason without inferring account action", async () => {
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter speaks."], resolution: ["720p"], aspectRatio: ["9:16"],
    duration: [5], generateAudio: [true], webSearch: [false],
  }) as unknown as CanonicalValue);
  for (const [status, code] of [[404, "model_not_found"], [401, "account_disabled"], [402, "insufficient_credits"]] as const) {
    let calls = 0;
    const reason = `A detailed public reason. ${"detail ".repeat(70)}End of reason.`;
    const endpoint = await endpointFor(request, async (url) => {
      calls++;
      if (String(url).includes("/models/")) return Response.json({ endpoints: ["videos"] });
      return Response.json({ error: { code, message: reason }, internal: "not-public-evidence" }, {
        status, headers: { "x-request-id": "req-evidence" },
      });
    });
    const outcome = await endpoint.start({
      command: { kind: "fulfill-need", id: "command:evidence", need: request }, need: request,
      resources: new MemoryResourceStore(), credentials: { apiKey: { secret: "private-key" } }, operation: "evidence",
    });
    assert.equal(calls, 2);
    assert.equal(outcome.status, "failed");
    if (outcome.status !== "failed") continue;
    assert.equal(outcome.failure.code, code);
    assert.match(outcome.failure.message, new RegExp(`HTTP ${status}`));
    assert.match(outcome.failure.message, /POST https:\/\/hypit.ai\/v1\/videos; model=seedance-2-mini; request=req-evidence/u);
    assert.ok(outcome.failure.message.endsWith(reason));
    assert.doesNotMatch(outcome.failure.message, /auth login|Sign in|private-key|not-public-evidence/u);
  }
});

test("terminal jobs preserve service error codes and receipts on both submission and polling", async () => {
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter speaks."], resolution: ["720p"], aspectRatio: ["9:16"],
    duration: [5], generateAudio: [true], webSearch: [false],
  }) as unknown as CanonicalValue);
  for (const phase of ["start", "poll"] as const) {
    const endpoint = await endpointFor(request, async (url) => String(url).includes("/models/")
      ? Response.json({ endpoints: ["videos"] })
      : Response.json({ id: "job-rejected", status: "failed", model: "seedance-2-mini",
        error_code: "upstream_rejected", error: "Reference could not be processed" }));
    const context = {
      command: { kind: "fulfill-need", id: "command:job", need: request } as const, need: request,
      resources: new MemoryResourceStore(), credentials: { apiKey: { secret: "test-key" } }, operation: "job",
    };
    const outcome = phase === "start" ? await endpoint.start(context) : await endpoint.poll({ ...context,
      handle: { contract: "hypit.hypihub-operation@1", jobId: "job-rejected", startedAt: Date.now(),
        route: `${request.capability.module.name}@${request.capability.module.version}#${request.capability.name}` },
    });
    assert.equal(outcome.status, "failed");
    if (outcome.status !== "failed") continue;
    assert.equal(outcome.failure.code, "upstream_rejected");
    assert.deepEqual(outcome.receipt, { id: "job-rejected" });
    assert.match(outcome.failure.message, /job-rejected failed; upstream_rejected; model=seedance-2-mini: Reference could not be processed/u);
  }
});

for (const kind of ["pricing", "speech"] as const) {
  test(`${kind} failures retain service evidence across their throwing boundary`, async () => {
    const request: Need = kind === "pricing" ? need(sealSeedanceRequest("seedance-2-mini", {
      prompt: ["A presenter."], resolution: ["720p"], aspectRatio: ["9:16"],
      duration: [5], generateAudio: [true], webSearch: [false],
    }) as unknown as CanonicalValue) : {
      id: "need:voice", ...mimoSpeechEndpoints.voiceDesign,
      constraints: sealMimoSpeechRequest("mimo-v2.5-tts-voicedesign", {
        text: ["A short sample."], voiceDescription: ["Warm and confident."],
      }) as unknown as CanonicalValue, result: "voice",
    };
    let calls = 0;
    const provider = createHypiHubProvider({ fetch: async (url) => {
      calls++;
      if (String(url).includes("/models/")) return Response.json({ endpoints: ["audio_speech"] });
      return Response.json({ error: { code: "no_available_provider", message: "No route is ready" } }, {
        status: 503, headers: { "x-request-id": `req-${kind}` },
      });
    } });
    const credentials = { apiKey: { secret: "private-credential" } };
    const invoke = async () => {
      if (kind === "pricing") return await provider.readPricing!({ request, credentials: async () => credentials });
      const registry = new EndpointRegistry();
      await provider.install(registry);
      const selected = registry.resolve(request);
      assert.equal(selected.status, "resolved");
      assert.equal(selected.registration.kind, "immediate");
      return await selected.registration.handler({ need: request, credentials, resources: new MemoryResourceStore(),
        command: { kind: "fulfill-need", id: "voice", need: request },
      });
    };
    await assert.rejects(invoke, (error: Error) => {
      assert.match(error.message, /HTTP 503; no_available_provider/u);
      assert.ok(error.message.includes(`request=req-${kind}`));
      assert.ok(error.message.includes(kind === "pricing" ? "model=seedance-2-mini" : "model=mimo-v2.5-tts-voicedesign"));
      assert.ok(error.message.endsWith("No route is ready"));
      assert.doesNotMatch(error.message, /private-credential|auth login/u);
      return true;
    });
    assert.equal(calls, kind === "pricing" ? 1 : 2);
  });
}

for (const mode of ['success', 'error', 'body-timeout'] as const) {
  test(`hosted transcription keeps its receipt on ${mode} without resubmitting`, async () => {
    const resources = new MemoryResourceStore();
    const artifact = await resources.put(wav(32_000), 'audio/wav');
    const request: Need = {
      id: 'need:transcription-receipt', capability: whisperXCapabilities.alignment,
      returns: speechEvidenceTypes.alignedTranscript,
      constraints: whisperXRequestForEvidenceAudio(sealSpeechEvidenceAudio({ artifact, sampleFrames: 32_000 }), { language: 'en' }) as unknown as CanonicalValue,
      result: 'record:transcription-receipt',
    };
    const messages: string[] = [];
    let submissions = 0;
    const registry = new EndpointRegistry();
    await createHypiHubProvider({
      requestTimeoutMs: 40,
      publicAssetUrl: async () => 'https://assets.test/evidence.wav',
      fetch: async (input) => {
        if (String(input).includes('/models/')) return Response.json({ endpoints: ['transcriptions'] });
        submissions++;
        const headers = { 'x-request-id': 'req_example', location: '/v1/audio/transcriptions/req_example' };
        if (mode === 'body-timeout') return new Response(new ReadableStream({ start() {} }), { headers });
        return Response.json(mode === 'success' ? { words: [{ word: 'hello', start: 0.1, end: 0.4 }] } : { error: 'upstream unavailable' }, { status: mode === 'success' ? 200 : 502, headers });
      },
    }).install(registry);
    const resolution = registry.resolve(request);
    assert.equal(resolution.status, 'resolved');
    assert.equal(resolution.registration.kind, 'immediate');
    const work = resolution.registration.handler({
      command: { kind: 'fulfill-need', id: 'command:receipt', need: request },
      need: request, resources, credentials: { apiKey: { secret: 'test-key' } },
      reportDiagnostic: async (entry) => { messages.push(entry.message); },
    });
    if (mode === 'success') await work;
    else await assert.rejects(Promise.resolve(work), mode === 'error' ? /502/ : /timed out/);
    assert.equal(submissions, 1);
    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /request req_example/);
    assert.match(messages[0]!, /https:\/\/hypit.ai\/v1\/audio\/transcriptions\/req_example/);
  });
}
