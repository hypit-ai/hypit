import assert from "node:assert/strict";
import test from "node:test";

import { EndpointRegistry, MemoryArtifactStore } from "@hypit/driver-node";
import type { AsyncEndpoint } from "@hypit/endpoint-kit";
import { geminiCapabilities, sealGeminiRequest } from "@hypit/gemini";
import type { CanonicalValue, Need } from "@hypit/protocol";
import { mimoTtsEndpoints } from "@hypit/mimo-tts";
import { textTypes } from "@hypit/text";
import { sealSeedanceRequest, seedanceEndpoints } from "@hypit/seedance";

import { createHypiHubProvider } from "../src/provider.js";

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
  const artifacts = new MemoryArtifactStore();
  const reference = await artifacts.put(new Uint8Array([1, 2, 3]), "image/png");
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
    if (url.endsWith("/v1/files/uploads")) {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.bytes, 3);
      assert.equal(typeof body.sha256, "string");
      return Response.json({ upload_mode: "api_multipart" });
    }
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
    need: request, artifacts, credentials: { apiKey: { secret: "test-key" } },
    operation: "operation:hypihub-test",
  };
  const started = await endpoint.start(common);
  assert.equal(started.status, "pending");
  assert.equal(calls.filter((url) => url.endsWith("/v1/files")).length, 1);
  if (started.status !== "pending") return;
  const completed = await endpoint.poll({ ...common, handle: started.handle });
  assert.equal(completed.status, "completed");
  assert.equal(calls.length, 7);
});

test("HypiHub fulfills Gemini through the Runtime endpoint and uploads every media Artifact", async () => {
  const artifacts = new MemoryArtifactStore();
  const image = await artifacts.put(new Uint8Array([1, 2, 3]), "image/png");
  const video = await artifacts.put(new Uint8Array([4, 5, 6]), "video/mp4");
  const request: Need = {
    id: "need:hypihub-gemini",
    capability: geminiCapabilities["gemini-3.1-pro"],
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
    if (url.endsWith("/v1/files/uploads")) {
      return Response.json({ upload_mode: "api_multipart" });
    }
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
    need: request, artifacts, credentials: { apiKey: { secret: "test-key" } },
  });
  assert.deepEqual(result.value, { kind: "inline", value: { value: "provider works" } });
  assert.deepEqual(uploads, ["image/png", "video/mp4"]);
  assert.deepEqual((generationBody?.contents as readonly unknown[]), [{ role: "user", parts: [
    { text: "Inspect both references." },
    { fileData: { mimeType: "image/png", fileUri: "https://hypit.ai/files/1" } },
    { fileData: { mimeType: "video/mp4", fileUri: "https://hypit.ai/files/2" } },
  ] }]);
});

test("HypiHub splits an Artifact across regional S3 parts and retries only the failed part", async () => {
  const artifacts = new MemoryArtifactStore();
  const reference = await artifacts.put(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), "video/mp4");
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["Continue the motion."], referenceVideo: [{ role: "video", artifact: reference }],
    resolution: ["720p"], aspectRatio: ["16:9"], duration: [5], generateAudio: [false], webSearch: [false],
  }) as unknown as CanonicalValue);
  const signedBatches: number[][] = [];
  const putAttempts = new Map<number, number>();
  let completedParts: unknown;
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/files/uploads")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.bytes, 12);
      assert.equal(body.mime_type, "video/mp4");
      assert.equal(Buffer.from(String(body.head_base64), "base64").byteLength, 12);
      return Response.json({
        upload_mode: "s3_multipart", upload_id: "up_test", asset_id: "as_test",
        part_size: 5, part_count: 3, concurrency: 2,
      }, { status: 201 });
    }
    if (url.endsWith("/v1/files/uploads/up_test/parts")) {
      const body = JSON.parse(String(init?.body)) as { parts: Array<{ part_number: number; checksum_sha256: string }> };
      signedBatches.push(body.parts.map((part) => part.part_number));
      return Response.json({ parts: body.parts.map((part) => ({
        part_number: part.part_number,
        url: `https://private.s3.ap-east-1.amazonaws.com/opaque-part-${part.part_number}?signature=secret`,
        headers: { "content-length": part.part_number === 3 ? "2" : "5", "x-amz-checksum-sha256": part.checksum_sha256 },
      })) });
    }
    if (url.startsWith("https://private.s3.ap-east-1.amazonaws.com/")) {
      const match = /opaque-part-(\d+)/u.exec(url); assert.ok(match);
      const partNumber = Number(match[1]); const attempt = (putAttempts.get(partNumber) ?? 0) + 1;
      putAttempts.set(partNumber, attempt);
      if (partNumber === 2 && attempt === 1) return new Response("retry", { status: 503 });
      const headers = init?.headers as Record<string, string>;
      return new Response(null, { status: 200, headers: { etag: `\"part-${partNumber}\"`, "x-amz-checksum-sha256": headers["x-amz-checksum-sha256"] ?? "" } });
    }
    if (url.endsWith("/v1/files/uploads/up_test/complete")) {
      completedParts = (JSON.parse(String(init?.body)) as Record<string, unknown>).parts;
      return Response.json({ url: "https://hypit.ai/files/as_reference.mp4" });
    }
    if (url.endsWith("/v1/models/bytedance%2Fseedance-2-mini")) return Response.json({ endpoints: ["videos"] });
    if (url.endsWith("/v1/videos")) return Response.json({ id: "job_direct_upload", status: "queued" });
    throw new Error(`Unexpected URL ${url}`);
  };
  const endpoint = await endpointFor(request, fakeFetch);
  const started = await endpoint.start({
    command: { kind: "fulfill-need", id: "command:direct-upload", need: request },
    need: request, artifacts, credentials: { apiKey: { secret: "test-key" } }, operation: "operation:direct-upload",
  });
  assert.equal(started.status, "pending");
  assert.deepEqual(signedBatches, [[1, 2, 3], [2]]);
  assert.deepEqual([...putAttempts.entries()].sort(), [[1, 1], [2, 2], [3, 1]]);
  assert.ok(Array.isArray(completedParts));
  assert.equal(completedParts.length, 3);
});
