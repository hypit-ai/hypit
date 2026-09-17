import assert from "node:assert/strict";
import test from "node:test";
import { EndpointRegistry, MemoryResourceStore } from "@hypit/driver-node";
import { sealSeedanceRequest } from "@hypit/seedance";
import type { BlobRef, EndpointStartContext } from "@hypit/hypit/endpoint-kit";
import { canonicalize } from "@hypit/hypit/endpoint-kit";
import { generationTypes } from "@hypit/hypit/generation";
import { assertMappingCoversPorts } from "@hypit/hypit/generation";
import { seedancePorts } from "@hypit/seedance";
import { capability, createVideoProvider, mapping } from "../src/provider.js";

test("project video Provider accounts for every port the Seedance Model declares", () => {
  // The check that turns a forgotten reference role or item field into a load-time failure
  // instead of a paid generation returning the wrong video.
  assertMappingCoversPorts(seedancePorts["seedance-2-mini"], mapping);
});

test("project video Provider uploads a reference, retains its receipt and collects the generated video", async () => {
  const resources = new MemoryResourceStore();
  const source = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const calls: string[] = [];
  const progress: string[] = [];
  let checkpoint: unknown;
  const provider = createVideoProvider({
    instance: "videos.personal", pool: "videos.personal", baseUrl: "https://videos.example",
    apiKey: { store: "os", key: "videos.personal" }, pollIntervalMs: 0,
    fetch: async (input, init) => {
      const url = new URL(String(input)); calls.push(url.pathname);
      if (url.hostname === "assets.example") {
        assert.equal(init?.signal === undefined, false);
        assert.equal(progress.at(-1), "Receiving generated video");
        return new Response(new Uint8Array([4, 5, 6]), { headers: { "content-type": "video/mp4" } });
      }
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-key");
      if (url.pathname === "/rates") return Response.json({ description: "$0.40 per second of video", unit: "second", usd: 0.4 });
      if (url.pathname === "/uploads") {
        assert.equal(progress.at(-1), "Preparing video request: seedance-2-mini");
        assert.deepEqual(new Uint8Array(await (init?.body as Blob).arrayBuffer()), new Uint8Array([1, 2, 3]));
        return Response.json({ url: "https://assets.example/reference.png" });
      }
      if (url.pathname === "/videos") {
        assert.equal(progress.at(-1), "Submitting video request: seedance-2-mini");
        assert.deepEqual(JSON.parse(String(init?.body)), {
          model: "seedance-2-mini",
          input: {
            prompt: "A slow push-in", duration: 5, resolution: "720p", ratio: "9:16",
            audio: true, search: false,
            references: [{ url: "https://assets.example/reference.png", person: true }],
          },
        });
        return Response.json({ id: "received-job" });
      }
      if (url.pathname === "/videos/received-job") {
        assert.deepEqual(checkpoint, { handle: { id: "received-job" }, receipt: { id: "received-job" } });
        return Response.json({ status: "succeeded", output: "https://assets.example/output.mp4" });
      }
      throw new Error(`Unexpected path ${url.pathname}`);
    },
  });
  const constraints = canonicalize(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A slow push-in"],
    duration: [5],
    resolution: ["720p"],
    aspectRatio: ["9:16"],
    generateAudio: [true],
    webSearch: [false],
    referenceImage: [{ role: "image", artifact: source, fields: { personReference: true } }],
  }));
  const need = { id: "need:example", capability, returns: generationTypes.videoSet, constraints, result: "record:example" } as const;
  const registry = new EndpointRegistry(); await provider.install(registry);
  const resolution = registry.resolve(need);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "asynchronous");
  const endpoint = resolution.registration.endpoint;
  const context: EndpointStartContext = {
    need, command: { kind: "fulfill-need", id: "command:example", need }, operation: "operation:example",
    resources, credentials: { apiKey: { secret: "test-key" } },
    checkpoint: async (value) => { checkpoint = value; },
    reportProgress: async (value) => { progress.push(value.phase); },
  };
  const pricing = await provider.readPricing!({ request: need, credentials: async () => context.credentials });
  assert.equal(pricing[0]?.summary, "$0.40 per second of video");
  const start = await endpoint.start(context); assert.equal(start.status, "pending");
  const ready = await endpoint.poll({ ...context, handle: start.handle }); assert.equal(ready.status, "ready");
  const collected = await endpoint.collect!({ ...context, handle: ready.handle }); assert.equal(collected.status, "completed");
  assert.equal(collected.result.value.kind, "inline");
  const videos = (collected.result.value.value as unknown as { videos: BlobRef[] }).videos;
  assert.equal(videos[0]?.mediaType, "video/mp4");
  assert.deepEqual(await resources.get(videos[0]!.resource), new Uint8Array([4, 5, 6]));
  assert.deepEqual(calls, ["/rates", "/uploads", "/videos", "/videos/received-job", "/output.mp4"]);
  assert.deepEqual(progress, ["Preparing video request: seedance-2-mini", "Submitting video request: seedance-2-mini", "Receiving generated video"]);
});

test("project video Provider reports its narrower service range without changing the model", async () => {
  const provider = createVideoProvider({
    instance: "videos.personal", pool: "videos.personal", baseUrl: "https://videos.example",
    apiKey: { store: "os", key: "videos.personal" },
  });
  const need = (ports: Parameters<typeof sealSeedanceRequest>[1]) => ({
    id: "need:range", capability, returns: generationTypes.videoSet,
    constraints: canonicalize(sealSeedanceRequest("seedance-2-mini", ports)), result: "record:range",
  });
  const prompted = { prompt: ["A slow push-in"], generateAudio: [true], webSearch: [false] };
  const supported = provider.offers[0]!.supports!(
    need({ ...prompted, duration: [5], resolution: ["720p"], aspectRatio: ["9:16"] }));
  assert.equal(supported.status, "supported");
  // The Model admits both of these; this Endpoint is what narrows them.
  const tooLong = provider.offers[0]!.supports!(need({ ...prompted, duration: [12], resolution: ["720p"], aspectRatio: ["9:16"] }));
  assert.equal(tooLong.status, "unsupported");
  assert.match(tooLong.status === "unsupported" ? tooLong.reason : "", /at most 10 seconds, not 12/u);
  const tooSmall = provider.offers[0]!.supports!(need({ ...prompted, duration: [5], resolution: ["480p"], aspectRatio: ["9:16"] }));
  assert.equal(tooSmall.status, "unsupported");
  assert.match(tooSmall.status === "unsupported" ? tooSmall.reason : "", /renders at 720p, not 480p/u);
});

test("project video Provider keeps the received task id when the render fails remotely", async () => {
  const calls: string[] = [];
  let checkpointed = false;
  const provider = createVideoProvider({
    instance: "videos.personal", pool: "videos.personal", baseUrl: "https://videos.example",
    apiKey: { store: "os", key: "videos.personal" }, pollIntervalMs: 0,
    fetch: async (input) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      if (path === "/videos") return Response.json({ id: "job-one" });
      return Response.json({
        status: "failed",
        error: { code: "content_filtered", message: "Rejected; see https://videos.example/private?token=hidden" },
        debug: { secret: "not-public" },
      });
    },
  });
  const need = {
    id: "need:failure", capability, returns: generationTypes.videoSet,
    constraints: canonicalize(sealSeedanceRequest("seedance-2-mini", {
      prompt: ["A slow push-in"], duration: [5], resolution: ["720p"], aspectRatio: ["9:16"],
      generateAudio: [true], webSearch: [false],
    })),
    result: "record:failure",
  };
  const registry = new EndpointRegistry();
  await provider.install(registry);
  const resolved = registry.resolve(need);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.registration.kind, "asynchronous");
  const endpoint = resolved.registration.endpoint;
  const context: EndpointStartContext = {
    command: { kind: "fulfill-need", id: "command:failure", need }, need, operation: "operation:failure",
    resources: new MemoryResourceStore(), credentials: { apiKey: { secret: "test-key" } },
    checkpoint: async () => { checkpointed = true; },
  };
  const started = await endpoint.start(context);
  assert.equal(started.status, "pending");
  const failed = await endpoint.poll({ ...context, handle: started.handle });
  assert.equal(failed.status, "failed");
  assert.equal(failed.status === "failed" ? failed.failure.code : "", "content_filtered");
  assert.match(failed.status === "failed" ? failed.failure.message : "", /task job-one failed/u);
  // Public evidence is preserved and the redacted URL is not republished.
  assert.doesNotMatch(failed.status === "failed" ? failed.failure.message : "", /not-public|token=hidden|test-key/u);
  assert.deepEqual(failed.receipt, { id: "job-one" });
  assert.equal(checkpointed, true);
  assert.deepEqual(calls, ["/videos", "/videos/job-one"]);
});

test("first and last frame person flags reach the upload API, including false", async () => {
  const resources = new MemoryResourceStore();
  const image = await resources.put(new Uint8Array([1]), "image/png");
  const flags: (string | null)[] = [];
  const provider = createVideoProvider({
    instance: "videos.personal", pool: "videos.personal", baseUrl: "https://videos.example",
    apiKey: { store: "os", key: "example" },
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === "/uploads") {
        flags.push(new Headers(init?.headers).get("x-person-reference"));
        return Response.json({ url: `https://assets.example/frame-${flags.length}.png` });
      }
      assert.equal(path, "/videos");
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.input.firstFrame, "https://assets.example/frame-1.png");
      assert.equal(sent.input.lastFrame, "https://assets.example/frame-2.png");
      return Response.json({ id: "frames" });
    },
  });
  const need = { id: "need:frames", capability, returns: generationTypes.videoSet, result: "record:frames",
    constraints: canonicalize(sealSeedanceRequest("seedance-2-mini", {
      prompt: ["A presenter"], duration: [5], resolution: ["720p"], aspectRatio: ["9:16"],
      generateAudio: [true], webSearch: [false],
      firstFrame: [{ role: "image", artifact: image, fields: { personReference: true } }],
      lastFrame: [{ role: "image", artifact: image, fields: { personReference: false } }],
    })),
  };
  const registry = new EndpointRegistry(); await provider.install(registry);
  const selected = registry.resolve(need);
  assert.equal(selected.status, "resolved");
  assert.equal(selected.registration.kind, "asynchronous");
  await selected.registration.endpoint.start({ need, command: { kind: "fulfill-need", id: "frames", need },
    operation: "frames", resources, credentials: { apiKey: { secret: "test" } },
  });
  assert.deepEqual(flags, ["true", "false"]);
});
