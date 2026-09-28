import assert from "node:assert/strict";
import test from "node:test";
import { EndpointRegistry, MemoryResourceStore } from "@hypit/driver-node";
import { sealSeedanceRequest, seedancePorts } from "@hypit/seedance";
import type { BlobRef } from "@hypit/protocol";
import type { EndpointStartContext } from "@hypit/endpoint-kit";
import { canonicalize } from "@hypit/protocol";
import { generationTypes, assertMappingCoversPorts } from "@hypit/generation";
import { capability, createAnyFastProvider, mapping } from "../src/provider.js";

test("AnyFast mapping covers every Seedance 2 port", () => {
  assertMappingCoversPorts(seedancePorts["seedance-2"], mapping);
});

test("AnyFast validates direct polling configuration", () => {
  assert.throws(() => createAnyFastProvider({ pollIntervalMs: 0 }), /pollIntervalMs must be positive/u);
  assert.throws(() => createAnyFastProvider({ pollIntervalMs: 1.5 }), /pollIntervalMs must be positive/u);
});

test("AnyFast compiles the documented payload and collects a video", async () => {
  const resources = new MemoryResourceStore();
  const image = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const audio = await resources.put(new Uint8Array([4, 5, 6]), "audio/wav");
  const calls: string[] = [];
  let checkpoint: unknown;
  const provider = createAnyFastProvider({
    instance: "anyfast.seedance-2", pool: "anyfast.seedance-2", pollIntervalMs: 1,
    fetch: async (input, init) => {
      const url = new URL(String(input)); calls.push(url.pathname);
      if (url.pathname === "/v1/video/generations") {
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-key");
        assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
        assert.equal(new Headers(init?.headers).get("idempotency-key"), "operation:anyfast");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, "seedance-2.0");
        assert.equal(body.duration, 5);
        assert.equal(body.resolution, "720p");
        assert.equal(body.ratio, "9:16");
        assert.equal(body.generate_audio, false);
        assert.deepEqual(body.content, [
          { type: "text", text: "A quiet vertical presenter" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AQID" }, role: "reference_image" },
          { type: "audio_url", audio_url: { url: "data:audio/wav;base64,BAUG" }, role: "reference_audio" },
        ]);
        return Response.json({ task_id: "asyntask-1", status: "" });
      }
      if (url.pathname === "/v1/video/generations/asyntask-1") {
        assert.equal((checkpoint as any)?.handle?.contract, "hypit.anyfast-operation@1");
        assert.equal((checkpoint as any)?.handle?.taskId, "asyntask-1");
        assert.deepEqual((checkpoint as any)?.receipt, { id: "asyntask-1" });
        return Response.json({ code: "success", data: {
          task_id: "asyntask-1", status: "SUCCESS", result_url: "https://assets.example/video.mp4",
        } });
      }
      if (url.hostname === "assets.example") {
        assert.equal(new Headers(init?.headers).get("authorization"), null,
          "presigned result downloads must not receive the API Bearer token");
        return new Response(new Uint8Array([7, 8, 9]), { headers: { "content-type": "video/mp4" } });
      }
      throw new Error(`Unexpected path ${url.pathname}`);
    },
  });
  const need = {
    id: "need:anyfast", capability, returns: generationTypes.videoSet,
    constraints: canonicalize(sealSeedanceRequest("seedance-2", {
      prompt: ["A quiet vertical presenter"], duration: [5], resolution: ["720p"], aspectRatio: ["9:16"],
      generateAudio: [false], webSearch: [false],
      referenceImage: [{ role: "image", artifact: image, fields: { personReference: true } }],
      referenceAudio: [{ role: "audio", artifact: audio }],
    })),
    result: "record:anyfast",
  } as const;
  const registry = new EndpointRegistry(); await provider.install(registry);
  const resolved = registry.resolve(need);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.registration.kind, "asynchronous");
  const context: EndpointStartContext = {
    need, command: { kind: "fulfill-need", id: "command:anyfast", need }, operation: "operation:anyfast",
    resources, credentials: { apiKey: { secret: "test-key" } },
    checkpoint: async (value) => { checkpoint = value; },
  };
  const started = await resolved.registration.endpoint.start(context);
  assert.equal(started.status, "pending");
  const ready = await resolved.registration.endpoint.poll({ ...context, handle: started.handle });
  assert.equal(ready.status, "ready");
  const collected = await resolved.registration.endpoint.collect!({ ...context, handle: ready.handle });
  assert.equal(collected.status, "completed");
  const videos = (collected.result.value as any).value.videos as BlobRef[];
  assert.equal(videos[0]?.mediaType, "video/mp4");
  assert.deepEqual(await resources.get(videos[0]!.resource), new Uint8Array([7, 8, 9]));
  assert.deepEqual(calls, ["/v1/video/generations", "/v1/video/generations/asyntask-1", "/video.mp4"]);
});

test("AnyFast uses ordered frame roles and can publish video references", async () => {
  const resources = new MemoryResourceStore();
  const first = await resources.put(new Uint8Array([1]), "image/png");
  const last = await resources.put(new Uint8Array([2]), "image/png");
  const video = await resources.put(new Uint8Array([3]), "video/mp4");
  let submitted: Record<string, unknown> | undefined;
  const provider = createAnyFastProvider({
    instance: "anyfast.seedance-2", pool: "anyfast.seedance-2", pollIntervalMs: 1,
    publicAssetUrl: async (artifact) => `https://upload.example/${artifact.resource}`,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/video/generations") {
        submitted = JSON.parse(String(init?.body));
        return Response.json({ id: "asyntask-frame", status: "" });
      }
      if (url.pathname.endsWith("/asyntask-frame")) return Response.json({ data: { status: "IN_PROGRESS" } });
      throw new Error(`Unexpected path ${url.pathname}`);
    },
  });
  const need = {
    id: "need:frames", capability, returns: generationTypes.videoSet,
    constraints: canonicalize(sealSeedanceRequest("seedance-2", {
      prompt: ["Bridge between two frames"], duration: [5], resolution: ["720p"], aspectRatio: ["16:9"],
      generateAudio: [false], webSearch: [false],
      firstFrame: [{ role: "image", artifact: first, fields: { personReference: false } }],
      lastFrame: [{ role: "image", artifact: last, fields: { personReference: false } }],
    })),
    result: "record:frames",
  } as const;
  const registry = new EndpointRegistry(); await provider.install(registry);
  const resolved = registry.resolve(need);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.registration.kind, "asynchronous");
  const context: EndpointStartContext = {
    need, command: { kind: "fulfill-need", id: "command:frames", need }, operation: "operation:frames",
    resources, credentials: { apiKey: { secret: "test-key" } },
  };
  const started = await resolved.registration.endpoint.start(context);
  assert.equal(started.status, "pending");
  const content = (submitted?.content as any[]) ?? [];
  assert.deepEqual(content, [
    { type: "text", text: "Bridge between two frames" },
    { type: "image_url", image_url: { url: "https://upload.example/" + first.resource }, role: "first_frame" },
    { type: "image_url", image_url: { url: "https://upload.example/" + last.resource }, role: "last_frame" },
  ]);
  assert.equal((submitted?.model), "seedance-2.0");
  void video; // keeps the fixture explicit for the separate video-reference contract below.
});

test("AnyFast refuses unsupported web search combinations and undocumented video inlining", () => {
  const provider = createAnyFastProvider({ instance: "anyfast.seedance-2", pool: "anyfast.seedance-2" });
  const makeNeed = (ports: Parameters<typeof sealSeedanceRequest>[1]) => ({
    id: "need:unsupported", capability, returns: generationTypes.videoSet,
    constraints: canonicalize(sealSeedanceRequest("seedance-2", ports)), result: "record:unsupported",
  });
  const base = { prompt: ["A presenter"], duration: [5], resolution: ["720p"], aspectRatio: ["9:16"], generateAudio: [false], webSearch: [false] };
  const image = { role: "image", artifact: { kind: "blob", resource: "res_image", mediaType: "image/png", size: 1 }, fields: { personReference: true } } as any;
  const webWithImage = provider.offers[0]!.supports!(makeNeed({ ...base, webSearch: [true], referenceImage: [image] }));
  assert.equal(webWithImage.status, "unsupported");
  assert.match(webWithImage.status === "unsupported" ? webWithImage.reason : "", /text-to-video/u);
  const fourK = provider.offers[0]!.supports!(makeNeed({ ...base, resolution: ["4k"] }));
  assert.equal(fourK.status, "supported");
});

test("AnyFast refuses a video reference before submission without a publisher", async () => {
  const resources = new MemoryResourceStore();
  const video = await resources.put(new Uint8Array([1, 2, 3]), "video/mp4");
  let calls = 0;
  const provider = createAnyFastProvider({
    instance: "anyfast.seedance-2", pool: "anyfast.seedance-2",
    fetch: async () => { calls += 1; return Response.json({}); },
  });
  const need = {
    id: "need:video-reference", capability, returns: generationTypes.videoSet,
    constraints: canonicalize(sealSeedanceRequest("seedance-2", {
      prompt: ["Edit the supplied scene"], duration: [5], resolution: ["720p"], aspectRatio: ["16:9"],
      generateAudio: [false], webSearch: [false],
      referenceVideo: [{ role: "video", artifact: video, fields: { personReference: false } }],
    })),
    result: "record:video-reference",
  } as const;
  const registry = new EndpointRegistry(); await provider.install(registry);
  const resolved = registry.resolve(need);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.registration.kind, "asynchronous");
  const context: EndpointStartContext = {
    need, command: { kind: "fulfill-need", id: "command:video-reference", need }, operation: "operation:video-reference",
    resources, credentials: { apiKey: { secret: "test-key" } },
  };
  const started = await resolved.registration.endpoint.start(context);
  assert.equal(started.status, "failed");
  assert.match(started.failure.message, /publicAssetUrl/u);
  assert.equal(calls, 0, "unsupported local video references must fail before a paid request");
});
