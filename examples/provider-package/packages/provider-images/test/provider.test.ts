import assert from "node:assert/strict";
import test from "node:test";
import { EndpointRegistry, MemoryResourceStore } from "@hypit/executor";
import { sealGptImage2Request } from "@hypit/gpt-image";
import type { BlobRef, EndpointStartContext } from "@hypit/hypit/endpoint";
import { canonicalize, endpointOffers, installEndpoint } from "@hypit/hypit/endpoint";
import { generationTypes } from "@hypit/generation";
import { capability, createImageProvider } from "../src/provider.js";

test("project Provider maps a reference, retains its receipt and collects through the public resource port", async () => {
  const resources = new MemoryResourceStore();
  const source = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const calls: string[] = [];
  const progress: string[] = [];
  let checkpoint: unknown;
  const provider = createImageProvider({
    instance: "images.personal", pool: "images.personal", baseUrl: "https://images.example",
    apiKey: { store: "local", key: "images.personal" }, pollIntervalMs: 0,
    fetch: async (input, init) => {
      const url = new URL(String(input)); calls.push(url.pathname);
      if (url.hostname === "assets.example") {
        assert.equal(init?.headers, undefined);
        assert.equal(progress.at(-1), "Receiving generated image");
        return new Response(new Uint8Array([4, 5, 6]), { headers: { "content-type": "image/webp" } });
      }
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-key");
      if (url.pathname === "/rates") return Response.json({ description: "$0.05 per 1K image", unit: "image", usd: 0.05 });
      if (url.pathname === "/uploads") {
        assert.equal(progress.at(-1), "Preparing image request: gpt-image-2");
        assert.deepEqual(new Uint8Array(await (init?.body as Blob).arrayBuffer()), new Uint8Array([1, 2, 3]));
        return Response.json({ url: "https://assets.example/reference.png" });
      }
      if (url.pathname === "/tasks") {
        assert.equal(progress.at(-1), "Submitting image request: gpt-image-2");
        assert.deepEqual(JSON.parse(String(init?.body)), {
          model: "gpt-image-2", input: { prompt: "A portrait", ratio: "9:16", size: "1K", references: ["https://assets.example/reference.png"] },
        });
        return Response.json({ id: "received-task" });
      }
      if (url.pathname === "/tasks/received-task") {
        assert.deepEqual(checkpoint, {
          status: "accepted", handle: { id: "received-task" }, receipt: { id: "received-task" },
        });
        return Response.json({ state: "succeeded", url: "https://assets.example/output.webp" });
      }
      throw new Error(`Unexpected path ${url.pathname}`);
    },
  });
  const constraints = canonicalize(sealGptImage2Request({
    prompt: ["A portrait"], aspectRatio: ["9:16"], resolution: ["1K"], images: [{ role: "image", artifact: source }],
  }));
  const need = { id: "need:example", capability, returns: generationTypes.imageSet, constraints, result: "record:example" } as const;
  const registry = new EndpointRegistry(); await installEndpoint(provider, registry);
  const resolution = registry.select(need);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "asynchronous");
  const endpoint = resolution.registration.endpoint;
  const context: EndpointStartContext = {
    need, operation: "operation:example",
    resources, credentials: { apiKey: { secret: "test-key" } },
    checkpoint: async (value) => { checkpoint = value; },
    reportProgress: async (value) => { progress.push(value.phase); },
  };
  const pricing = await provider.readPricing!({ request: need, credentials: async () => context.credentials });
  assert.equal(pricing[0]?.summary, "$0.05 per 1K image");
  const start = await endpoint.start(context); assert.equal(start.status, "pending");
  const ready = await endpoint.poll({ ...context, handle: start.handle }); assert.equal(ready.status, "ready");
  const collected = await endpoint.collect!({ ...context, handle: ready.handle }); assert.equal(collected.status, "completed");
  const images = (collected.result.value as unknown as { images: BlobRef[] }).images;
  assert.equal(images[0]?.mediaType, "image/webp");
  assert.deepEqual(await resources.get(images[0]!.resource), new Uint8Array([4, 5, 6]));
  assert.deepEqual(calls, ["/rates", "/uploads", "/tasks", "/tasks/received-task", "/output.webp"]);
  assert.deepEqual(progress, ["Preparing image request: gpt-image-2", "Submitting image request: gpt-image-2", "Receiving generated image"]);
  assert.equal(endpointOffers(provider)[0]!.supports!({ ...need, constraints: canonicalize(sealGptImage2Request({
    prompt: ["A portrait"], aspectRatio: ["9:16"], resolution: ["2K"],
  })) }).status, "unsupported");
});

test("project Provider retains public submission and task errors without suggesting a different account", async () => {
  for (const failureAt of ["submission", "task"] as const) {
    const calls: string[] = [];
    let checkpointed = false;
    const provider = createImageProvider({
      instance: "images.personal", pool: "images.personal", baseUrl: "https://images.example",
      apiKey: { store: "local", key: "images.personal" }, pollIntervalMs: 0,
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        calls.push(path);
        const error = { code: "request_rejected", message: "This request is unavailable; resource https://assets.example/private?token=hidden" };
        if (failureAt === "submission") return Response.json({ error, debug: { secret: "not-public" } }, {
          status: 403, headers: { "x-request-id": "request-one" },
        });
        if (path === "/tasks") return Response.json({ id: "task-one" });
        return Response.json({ state: "failed", error, debug: { secret: "not-public" } });
      },
    });
    const need = { id: "need:failure", capability, returns: generationTypes.imageSet,
      constraints: canonicalize(sealGptImage2Request({ prompt: ["A portrait"], aspectRatio: ["1:1"], resolution: ["1K"] })),
      result: "result:failure" };
    const registry = new EndpointRegistry();
    await installEndpoint(provider, registry);
    const resolved = registry.select(need);
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.registration.kind, "asynchronous");
    const endpoint = resolved.registration.endpoint;
    const context: EndpointStartContext = {
      need, operation: "operation:failure",
      resources: new MemoryResourceStore(), credentials: { apiKey: { secret: "test-key" } },
      checkpoint: async () => { checkpointed = true; },
    };
    if (failureAt === "submission") {
      await assert.rejects(async () => await endpoint.start(context), (error: Error & { code?: string }) => {
        assert.equal(error.code, "request_rejected");
        assert.match(error.message, /POST \/tasks returned HTTP 403; request=request-one; request_rejected: This request is unavailable/u);
        assert.doesNotMatch(error.message, /not-public|token=hidden|test-key/u);
        return true;
      });
      assert.equal(checkpointed, false);
      assert.deepEqual(calls, ["/tasks"]);
    } else {
      const started = await endpoint.start(context);
      assert.equal(started.status, "pending");
      const failed = await endpoint.poll({ ...context, handle: started.handle });
      assert.equal(failed.status, "failed");
      assert.equal(failed.failure.code, "request_rejected");
      assert.match(failed.failure.message, /task task-one failed: This request is unavailable/u);
      assert.doesNotMatch(failed.failure.message, /not-public|token=hidden|test-key/u);
      assert.deepEqual(failed.receipt, { id: "task-one" });
      assert.equal(checkpointed, true);
      assert.deepEqual(calls, ["/tasks", "/tasks/task-one"]);
    }
  }
});
