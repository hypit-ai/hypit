import assert from "node:assert/strict";
import test from "node:test";

import { EndpointRegistry, MemoryResourceStore } from "@hypit/driver-node";
import type { AsyncEndpoint } from "@hypit/endpoint-kit";
import { geminiCapabilities, sealGeminiRequest } from "@hypit/gemini";
import type { CanonicalValue, Need } from "@hypit/protocol";
import { mimoTtsEndpoints } from "@hypit/mimo-tts";
import { textTypes } from "@hypit/text";
import { sealSeedanceRequest, seedanceEndpoints } from "@hypit/seedance";
import { sealSpeechEvidenceAudio } from "@hypit/speech";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import { whisperXCapabilities, whisperXRequestForEvidenceAudio } from "@hypit/whisperx";

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

async function endpointFor(request: Need, fetch: typeof globalThis.fetch): Promise<AsyncEndpoint> {
  const registry = new EndpointRegistry();
  await createHypiHubProvider({ fetch, pollIntervalMs: 0, requestTimeoutMs: 1_000 }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "asynchronous");
  return resolution.registration.endpoint;
}

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
});

test("HypiHub quotes an exact generation Need from the authenticated model card", async () => {
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter turns toward camera."],
    resolution: ["720p"],
    aspectRatio: ["16:9"],
    duration: [5],
    generateAudio: [false],
    webSearch: [false],
  }) as unknown as CanonicalValue);
  const provider = createHypiHubProvider({ fetch: async (input) => {
    assert.match(String(input), /\/v1\/models\/bytedance%2Fseedance-2-mini$/u);
    return Response.json({
      endpoints: ["videos"],
      pricing: {
        mode: "per_second",
        resolution_ratio: { "480p": 1, "720p": 2.1579 },
        credits: { per_second: 5.648 },
      },
    });
  } });
  const offer = provider.offers.find((item) => item.capability.name === "seedance-2-mini");
  assert.ok(offer?.quote !== undefined);
  const quote = await offer.quote({ need: request, credentials: { apiKey: { secret: "test-key" } } });
  assert.deepEqual(quote, {
    status: "estimated",
    amount: 60.9391,
    currency: "credits",
    basis: { mode: "per_second", quantity: 5, rate: 5.648, multiplier: 2.1579 },
    source: "https://hypit.ai/v1/models/bytedance%2Fseedance-2-mini",
    observedAt: quote.status === "estimated" ? quote.observedAt : -1,
  });
});

test("HypiHub refuses to underquote an exact request whose price factor is absent", async () => {
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter turns toward camera."],
    resolution: ["720p"],
    aspectRatio: ["16:9"],
    duration: [5],
    generateAudio: [false],
    webSearch: [false],
  }) as unknown as CanonicalValue);
  const provider = createHypiHubProvider({ fetch: async () => Response.json({
    endpoints: ["videos"],
    pricing: {
      mode: "per_second",
      resolution_ratio: { "480p": 1 },
      credits: { per_second: 5.648 },
    },
  }) });
  const offer = provider.offers.find((item) => item.capability.name === "seedance-2-mini");
  assert.ok(offer?.quote !== undefined);
  assert.deepEqual(await offer.quote({ need: request, credentials: { apiKey: { secret: "test-key" } } }), {
    status: "unknown",
    reason: "HypiHub model card has no price factor for this exact request",
  });
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

test("HypiHub exposes VoiceDesign by default and permits an explicit alternate audio Provider", async () => {
  const registry = new EndpointRegistry();
  await createHypiHubProvider({ fetch: async () => { throw new Error("audio must not call fetch"); } }).install(registry);
  assert.equal(registry.resolve({
    id: "need:hypihub-audio-default",
    capability: mimoTtsEndpoints.voiceDesign.capability,
    returns: mimoTtsEndpoints.voiceDesign.returns,
    constraints: { ports: {} },
    result: "record:hypihub-audio-default",
  }).status, "resolved");

  const optedOut = new EndpointRegistry();
  await createHypiHubProvider({ audio: false, fetch: async () => { throw new Error("not reached"); } }).install(optedOut);
  assert.equal(optedOut.resolve({
    id: "need:hypihub-audio-opt-in",
    capability: mimoTtsEndpoints.voiceDesign.capability,
    returns: mimoTtsEndpoints.voiceDesign.returns,
    constraints: { ports: {} },
    result: "record:hypihub-audio-opt-in",
  }).status, "missing");
});

test("HypiHub uploads referenced Artifacts once, submits their HTTPS URLs, and persists the result", async () => {
  const resources = new MemoryResourceStore();
  const reference = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter turns toward camera."],
    referenceImage: [
      { role: "image", artifact: reference },
      { role: "image", artifact: reference },
    ],
    resolution: ["720p"], aspectRatio: ["16:9"], duration: [5],
    generateAudio: [false], webSearch: [false],
  }) as unknown as CanonicalValue);
  const calls: string[] = [];
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/v1/files")) {
      assert.equal(init?.method, "POST");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-key");
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get("purpose"), "reference");
      const file = init.body.get("file");
      assert.ok(file instanceof File);
      assert.equal(file.type, "image/png");
      assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([1, 2, 3]));
      return Response.json({ url: "https://hypit.ai/files/as_reference.png" });
    }
    if (url.endsWith("/v1/models/bytedance%2Fseedance-2-mini")) {
      return Response.json({ endpoints: ["videos"] });
    }
    if (url.endsWith("/v1/videos")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "bytedance/seedance-2-mini");
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
  assert.equal(calls.filter((url) => url.endsWith("/v1/files")).length, 1);
  if (started.status !== "pending") return;
  const completed = await endpoint.poll({ ...common, handle: started.handle });
  assert.equal(completed.status, "completed");
  assert.equal(calls.length, 6);
});

test("HypiHub fulfills Gemini through the Runtime endpoint and uploads every media Artifact", async () => {
  const resources = new MemoryResourceStore();
  const image = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const video = await resources.put(new Uint8Array([4, 5, 6]), "video/mp4");
  const request: Need = {
    id: "need:hypihub-gemini",
    capability: geminiCapabilities["gemini-3.7-flash-openai"],
    returns: textTypes.text,
    constraints: sealGeminiRequest({
      instruction: "Answer briefly.", prompt: "Inspect both references.",
      media: [{ artifact: image }, { artifact: video }],
    }) as unknown as CanonicalValue,
    result: "record:hypihub-gemini",
  };
  const uploads: string[] = [];
  let generationBody: Record<string, unknown> | undefined;
  const registry = new EndpointRegistry();
  await createHypiHubProvider({ fetch: async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/files")) {
      assert.ok(init?.body instanceof FormData);
      const file = init.body.get("file");
      assert.ok(file instanceof File);
      uploads.push(file.type);
      return Response.json({ url: `https://hypit.ai/files/${uploads.length}` });
    }
    if (url.includes(":generateContent")) {
      generationBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ candidates: [{ content: { parts: [{ text: "provider works" }] } }] });
    }
    throw new Error(`Unexpected URL ${url}`);
  } }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  const result = await resolution.registration.handler({
    command: { kind: "fulfill-need", id: "command:hypihub-gemini", need: request },
    need: request, resources, credentials: { apiKey: { secret: "test-key" } },
  });
  assert.deepEqual(result.value, { kind: "inline", value: { value: "provider works" } });
  assert.deepEqual(uploads, ["image/png", "video/mp4"]);
  assert.deepEqual((generationBody?.contents as readonly unknown[]), [{ role: "user", parts: [
    { text: "Inspect both references." },
    { fileData: { mimeType: "image/png", fileUri: "https://hypit.ai/files/1" } },
    { fileData: { mimeType: "video/mp4", fileUri: "https://hypit.ai/files/2" } },
  ] }]);
});

test("HypiHub fulfills the Provider-neutral WhisperX alignment capability", async () => {
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
    }), { language: "en" }) as unknown as CanonicalValue,
    result: "record:hypihub-whisperx",
  };
  let submitted = false;
  const registry = new EndpointRegistry();
  await createHypiHubProvider({ fetch: async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/models/victor-upmeet%2Fwhisperx")) {
      return Response.json({ endpoints: ["transcriptions"] });
    }
    if (url.endsWith("/v1/audio/transcriptions")) {
      submitted = true;
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get("model"), "victor-upmeet/whisperx");
      assert.equal(init.body.get("language"), "en");
      assert.equal(init.body.get("response_format"), "verbose_json");
      assert.deepEqual(init.body.getAll("timestamp_granularities[]"), ["segment", "word"]);
      const file = init.body.get("file");
      assert.ok(file instanceof File);
      assert.equal(file.type, "audio/wav");
      assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
      return Response.json({
        language: "en",
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
