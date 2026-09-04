import assert from "node:assert/strict";
import test from "node:test";

import { EndpointRegistry, MemoryResourceStore } from "@hypit/driver-node";
import { defineEndpointPackage } from "@hypit/endpoint-kit";
import type { AsyncEndpoint } from "@hypit/endpoint-kit";
import { geminiCapabilities, geminiTypes, sealGeminiRequest } from "@hypit/gemini";
import type { CanonicalValue, Need } from "@hypit/protocol";
import { mimoTtsEndpoints } from "@hypit/mimo-tts";
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

test("HypiHub declares VoiceDesign like everything else it can do; who serves it is the Profile's binding", async () => {
  const registry = new EndpointRegistry();
  await createHypiHubProvider({ fetch: async () => { throw new Error("audio must not call fetch"); } }).install(registry);
  const need = {
    id: "need:hypihub-audio-default",
    capability: mimoTtsEndpoints.voiceDesign.capability,
    returns: mimoTtsEndpoints.voiceDesign.returns,
    constraints: { ports: {} },
    result: "record:hypihub-audio-default",
  };
  assert.equal(registry.resolve(need).status, "resolved");

  // A second Endpoint offering the same capability makes the choice the deployment's, not the Provider's.
  const other = defineEndpointPackage({
    module: { name: "example.tts", version: "1" },
    facet: "tts",
    instance: "mimo.official",
    pool: "mimo.official",
    capabilities: [{
      capability: mimoTtsEndpoints.voiceDesign.capability,
      returns: mimoTtsEndpoints.voiceDesign.returns,
      lifecycle: "immediate",
      handler: () => ({ value: { kind: "inline", value: null } }),
    }],
  });
  await other.install(registry);
  assert.equal(registry.resolve(need).status, "ambiguous");
  registry.bind(mimoTtsEndpoints.voiceDesign.capability, "mimo.official");
  const resolved = registry.resolve(need);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.status === "resolved" ? resolved.registration.id : undefined, "mimo.official");
});

test("HypiHub uploads one referenced Resource once and submits its HTTPS URL", async () => {
  const resources = new MemoryResourceStore();
  const referenceBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const reference = await resources.put(referenceBytes, "image/png");
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
  assert.equal(calls.filter((url) => url.endsWith("/v1/files/uploads")).length, 1);
  assert.deepEqual(signedBatches, [[1, 2, 3], [2]]);
  assert.deepEqual([...partAttempts.entries()].sort(), [[1, 1], [2, 2], [3, 1]]);
  if (started.status !== "pending") return;
  const completed = await endpoint.poll({ ...common, handle: started.handle });
  assert.equal(completed.status, "completed");
});

test("HypiHub stops before paid submission when a reference upload fails", async () => {
  const resources = new MemoryResourceStore();
  const reference = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter turns toward camera."],
    referenceImage: [{ role: "image", artifact: reference }],
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
  assert.doesNotMatch(outcome.status === "failed" ? outcome.failure.message : "", /must-not-leak/u);
});

test("HypiHub fulfills Gemini through the Runtime endpoint and uploads every media Resource", async () => {
  const resources = new MemoryResourceStore();
  const image = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const video = await resources.put(new Uint8Array([4, 5, 6]), "video/mp4");
  const request: Need = {
    id: "need:hypihub-gemini",
    capability: geminiCapabilities["gemini-3.1-pro"],
    returns: geminiTypes.visualObservation,
    constraints: sealGeminiRequest({
      instruction: "Answer briefly.", prompt: "Inspect both references.",
      media: [{ artifact: image }, { artifact: video }],
    }) as unknown as CanonicalValue,
    result: "record:hypihub-gemini",
  };
  let uploadSessions = 0;
  let completedUploads = 0;
  let generationBody: Record<string, unknown> | undefined;
  const registry = new EndpointRegistry();
  await createHypiHubProvider({ fetch: async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/files/uploads")) {
      uploadSessions += 1;
      return Response.json({
        upload_mode: "s3_multipart",
        upload_id: `up_gemini_${uploadSessions}`,
        part_size: 16,
        part_count: 1,
        concurrency: 2,
      });
    }
    const parts = /\/v1\/files\/uploads\/(up_gemini_\d+)\/parts$/u.exec(url);
    if (parts) {
      const body = JSON.parse(String(init?.body)) as {
        readonly parts: readonly { readonly checksum_sha256: string }[];
      };
      return Response.json({ parts: [{
        part_number: 1,
        url: `https://s3.example/${parts[1]}?signature=secret`,
        headers: {
          "content-length": "3",
          "x-amz-checksum-sha256": body.parts[0]?.checksum_sha256,
        },
      }] });
    }
    if (url.startsWith("https://s3.example/up_gemini_")) {
      return new Response(null, { headers: { etag: "part" } });
    }
    if (/\/v1\/files\/uploads\/up_gemini_\d+\/complete$/u.test(url)) {
      completedUploads += 1;
      return Response.json({ url: `https://hypit.ai/files/${completedUploads}` });
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
  assert.deepEqual(result.value, { kind: "inline", value: { text: "provider works" } });
  assert.equal(uploadSessions, 2);
  assert.equal(completedUploads, 2);
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
      assert.equal(body.language, "en");
      assert.equal(body.response_format, "verbose_json");
      assert.equal(body.url, "https://hypit.ai/files/alignment-evidence.wav");
      assert.deepEqual(body.timestamp_granularities, ["segment", "word"]);
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
