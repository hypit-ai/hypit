import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  MemoryResourceStore,
  EndpointRegistry,
} from "@hypit/driver-node";
import type { EndpointRegistration } from "@hypit/driver-node";
import type { AsyncEndpoint } from "@hypit/endpoint-kit";
import { artifactTypes } from "@hypit/artifact";
import { backgroundRemovalCapabilities, backgroundRemovalRequest } from "@hypit/background-removal";
import { seedanceEndpoints, sealSeedanceRequest } from "@hypit/seedance";
import { generationTypes } from "@hypit/generation";
import type { CanonicalValue, Need } from "@hypit/protocol";
import { createKieProvider } from "@hypit/provider-kie";

function need(constraints: CanonicalValue): Need {
  return {
    id: "need:kie-test",
    capability: seedanceEndpoints.mini!.capability,
    returns: seedanceEndpoints.mini!.returns,
    constraints,
    result: "record:kie-test",
  };
}

function removeBackgroundNeed(constraints: CanonicalValue): Need {
  return {
    id: "need:remove-background", capability: backgroundRemovalCapabilities.remove, returns: artifactTypes.blob,
    constraints, result: "record:remove-background",
  };
}

async function endpointFor(
  request: Need,
  fetch: typeof globalThis.fetch,
  now = () => 1_000,
  requestTimeoutMs = 1_000,
): Promise<{ endpoint: AsyncEndpoint; registration: EndpointRegistration }> {
  const registry = new EndpointRegistry();
  const provider = createKieProvider({
    fetch,
    now,
    pollIntervalMs: 0,
    requestTimeoutMs,
    maxOperationMs: 60_000,
  });
  await provider.install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "asynchronous");
  return { endpoint: resolution.registration.endpoint, registration: resolution.registration };
}

function operation(_request: Need): string {
  return "operation:kie-test";
}

test("all KIE capabilities share one asynchronous task engine and use exact-model capacity", async () => {
  const provider = createKieProvider({
    fetch: async () => { throw new Error("no request expected"); },
    defaultConcurrency: 8,
    capabilityConcurrency: { "seedance-2-mini": 4 },
  });
  const registry = new EndpointRegistry();
  await provider.install(registry);
  const seed = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A clean studio shot."], resolution: ["720p"], aspectRatio: ["16:9"],
    duration: [5], generateAudio: [false], webSearch: [false],
  }) as unknown as CanonicalValue);
  const source = { kind: "blob" as const, resource: fixtureResource("lane-source"), size: 1, mediaType: "image/png" };
  const removal = removeBackgroundNeed(backgroundRemovalRequest(source) as unknown as CanonicalValue);
  const seedResolution = registry.resolve(seed);
  const removalResolution = registry.resolve(removal);
  assert.equal(seedResolution.status, "resolved");
  assert.equal(removalResolution.status, "resolved");
  assert.equal(seedResolution.registration.kind, "asynchronous");
  assert.equal(removalResolution.registration.kind, "asynchronous");
  assert.equal(seedResolution.registration.endpoint, removalResolution.registration.endpoint);
  assert.deepEqual(seedResolution.registration.scheduling, {
    resources: [
      { id: "pool:kie.default", limit: 8 },
      { id: "capacity:kie.default/seedance-2-mini", limit: 4 },
    ],
  });
});

test("KIE exposes the rate-card records returned for the request's wire model", async () => {
  const provider = createKieProvider({
    fetch: async (input, init) => {
      assert.equal(String(input), "https://api.kie.ai/client/v1/model-pricing/page");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        pageNum: 1,
        pageSize: 100,
        modelDescription: "bytedance/seedance-2-mini",
        interfaceType: "",
      });
      return Response.json({ code: 200, data: {
        records: [{
          modelDescription: "bytedance/seedance-2-mini, 720P no video",
          creditPrice: "8.2",
          creditUnit: "per second",
          usdPrice: "0.041",
        }],
        pages: 1,
      } });
    },
  });
  const request = {
    capability: seedanceEndpoints.mini!.capability,
    returns: seedanceEndpoints.mini!.returns,
    constraints: sealSeedanceRequest("seedance-2-mini", {
      prompt: ["A presenter speaks to camera."], resolution: ["720p"], aspectRatio: ["9:16"],
      duration: [5], generateAudio: [true], webSearch: [false],
    }) as unknown as CanonicalValue,
  };
  assert.deepEqual(await provider.readPricing!({
    request,
    credentials: async () => { throw new Error("public pricing must not require credentials"); },
  }), [{
    source: "https://api.kie.ai/client/v1/model-pricing/page",
    summary: "bytedance/seedance-2-mini, 720P no video: USD 0.041; 8.2 credits (per second)",
    data: {
      model: "bytedance/seedance-2-mini",
      records: [{
        modelDescription: "bytedance/seedance-2-mini, 720P no video",
        creditPrice: "8.2",
        creditUnit: "per second",
        usdPrice: "0.041",
      }],
    },
  }]);
});

test("KIE prices the wire route selected by an authored future input", async () => {
  const provider = createKieProvider({
    fetch: async () => Response.json({ code: 200, data: {
      records: [{
        modelDescription: "gpt-image-2-image-to-image, 1K",
        creditPrice: "8",
        creditUnit: "per image",
      }],
      pages: 1,
    } }),
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
    credentials: async () => { throw new Error("public pricing must not require credentials"); },
  });
  assert.deepEqual(document?.data, {
    model: "gpt-image-2-image-to-image",
    records: [{
      modelDescription: "gpt-image-2-image-to-image, 1K",
      creditPrice: "8",
      creditUnit: "per image",
    }],
  });
});

test("KIE uploads referenced resources, polls one task, and persists generated bytes", async () => {
  const resources = new MemoryResourceStore();
  const firstFrame = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const requestValue = sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter turns toward camera."],
    firstFrame: [{ role: "image", artifact: firstFrame }],
    resolution: ["720p"],
    aspectRatio: ["16:9"],
    duration: [6],
    generateAudio: [false],
    webSearch: [false],
  });
  const request = need(requestValue as unknown as CanonicalValue);
  const calls: string[] = [];
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/file-stream-upload")) {
      assert.equal(init?.method, "POST");
      assert.match(String((init?.headers as Record<string, string>)["content-type"]), /^multipart\/form-data; boundary=/u);
      const chunks: Uint8Array[] = [];
      for await (const chunk of init?.body as unknown as AsyncIterable<Uint8Array>) chunks.push(chunk);
      const multipart = Buffer.concat(chunks).toString("latin1");
      assert.match(multipart, /name="fileName"\r\n\r\nres_[a-zA-Z0-9-]+\.png/u);
      assert.match(multipart, /name="uploadPath"\r\n\r\nhypit\/resources/u);
      assert.doesNotMatch(multipart, /svml\/resources/u);
      assert.ok(Buffer.concat(chunks).includes(Buffer.from([1, 2, 3])));
      return Response.json({
        success: true,
        code: 200,
        data: { downloadUrl: "https://tempfile.redpandaai.co/reference.png" },
      });
    }
    if (url.endsWith("/api/v1/jobs/createTask")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "bytedance/seedance-2-mini");
      const modelInput = body.input as Record<string, unknown>;
      assert.equal(modelInput.first_frame_url, "https://tempfile.redpandaai.co/reference.png");
      return Response.json({ code: 200, msg: "success", data: { taskId: "task_seedance_test" } });
    }
    if (url.includes("/api/v1/jobs/recordInfo")) {
      return Response.json({
        code: 200,
        data: {
          taskId: "task_seedance_test",
          model: "bytedance/seedance-2-mini",
          state: "success",
          resultJson: JSON.stringify({ resultUrls: ["https://tempfile.aiquickdraw.com/result.mp4"] }),
        },
      });
    }
    if (url.endsWith("/api/v1/common/download-url")) {
      return Response.json({ code: 200, data: "https://download.kie.test/result.mp4" });
    }
    if (url === "https://download.kie.test/result.mp4") {
      return new Response(new Uint8Array([9, 8, 7, 6]), {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "4" },
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const { endpoint } = await endpointFor(request, fakeFetch);
  const common = {
    command: { kind: "fulfill-need", id: "command:kie-test", need: request } as const,
    need: request,
    resources,
    credentials: { apiKey: { secret: "test-key" } },
    operation: operation(request),
  };
  const started = await endpoint.start(common);
  assert.equal(started.status, "pending");
  if (started.status !== "pending") return;
  assert.deepEqual(started.status === "pending" && started.progress, { phase: "submitted" });
  assert.equal(calls.length, 2);
  assert.equal(started.status === "pending" && (started.handle as Record<string, unknown>).taskId, "task_seedance_test");
  const ready = await endpoint.poll({
    ...common,
    handle: started.handle!,
  });
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;
  const completed = await endpoint.collect!({ ...common, handle: ready.handle });
  assert.equal(completed.status, "completed");
  assert.equal(calls.length, 5);
  if (completed.status !== "completed") return;
  assert.equal(completed.result.value.kind, "inline");
  const result = completed.result.value.kind === "inline"
    ? completed.result.value.value as Record<string, unknown> : {};
  assert.equal("model" in result, false, "model choice belongs to the request graph");
  const videos = result.videos as Array<{ resource: string }>;
  assert.equal(videos.length, 1);
  assert.equal(await resources.has(videos[0]!.resource as `res_${string}`), true);
});

test("KIE fulfills generic Background Removal with the documented Recraft wire mapping", async () => {
  const resources = new MemoryResourceStore();
  const source = await resources.put(new Uint8Array([1, 2, 3, 4]), "image/png");
  const request = removeBackgroundNeed(backgroundRemovalRequest(source) as unknown as CanonicalValue);
  const calls: string[] = [];
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    if (url.endsWith("/api/file-stream-upload")) {
      return Response.json({ code: 200, data: { downloadUrl: "https://tempfile.redpandaai.co/source.png" } });
    }
    if (url.endsWith("/api/v1/jobs/createTask")) {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "recraft/remove-background", input: { image: "https://tempfile.redpandaai.co/source.png" },
      });
      return Response.json({ code: 200, data: { taskId: "task_remove_background" } });
    }
    if (url.includes("/api/v1/jobs/recordInfo")) {
      return Response.json({ code: 200, data: {
        taskId: "task_remove_background", model: "recraft/remove-background", state: "success",
        resultJson: JSON.stringify({ resultUrls: ["https://tempfile.aiquickdraw.com/cutout.png"] }),
      } });
    }
    if (url.endsWith("/api/v1/common/download-url")) {
      return Response.json({ code: 200, data: "https://download.kie.test/cutout.png" });
    }
    if (url === "https://download.kie.test/cutout.png") {
      return new Response(new Uint8Array([9, 8, 7]), { status: 200, headers: { "content-type": "image/png" } });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const { endpoint } = await endpointFor(request, fakeFetch);
  const common = {
    command: { kind: "fulfill-need", id: "command:remove-background", need: request } as const,
    need: request, resources, credentials: { apiKey: { secret: "test-key" } }, operation: operation(request),
  };
  const started = await endpoint.start(common);
  assert.equal(started.status, "pending");
  if (started.status !== "pending") return;
  const ready = await endpoint.poll({
    ...common, handle: started.handle!,
  });
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;
  const completed = await endpoint.collect!({ ...common, handle: ready.handle });
  assert.equal(completed.status, "completed");
  if (completed.status !== "completed") return;
  assert.equal(completed.result.value.kind, "blob");
  assert.equal(completed.result.value.kind === "blob" && completed.result.value.mediaType, "image/png");
  assert.equal(calls.length, 5);
});

test("KIE polling errors and operation deadlines are terminal request failures", async () => {
  const request = need({});
  let now = 0, requests = 0;
  const { endpoint } = await endpointFor(request, async () => {
    requests++; throw new Error("offline");
  }, () => now);
  const { kieRouteForCapability } = await import("../src/routes.js");
  const common = { command: { kind: "fulfill-need", id: "need:test", need: request } as const,
    need: request, resources: new MemoryResourceStore(), credentials: { apiKey: { secret: "test" } }, operation: "op:test",
    handle: { taskId: "existing", routeKey: kieRouteForCapability(request.capability)!.key, startedAt: 0 } };
  const offline = await endpoint.poll(common);
  assert.equal(offline.status, "failed");
  assert.match(offline.status === "failed" ? offline.failure.message : "", /offline/);
  now = 60_001;
  const timedOut = await endpoint.poll(common);
  assert.equal(timedOut.status, "failed");
  assert.equal(timedOut.status === "failed" && timedOut.failure.code, "KIE_OPERATION_TIMEOUT");
  assert.equal(requests, 1, "an expired operation does no further network work");
});

test("KIE request timeout covers a response body that never finishes", async () => {
  const request = need({});
  const { endpoint } = await endpointFor(request, async () => {
    // Some gateways return headers and then leave a body open without reacting
    // to AbortSignal. The Provider deadline must still release the Build turn.
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    return new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
  }, () => 1_000, 20);
  const { kieRouteForCapability } = await import("../src/routes.js");
  const startedAt = Date.now();
  const outcome = await endpoint.poll({
    command: { kind: "fulfill-need", id: "need:body-timeout", need: request },
    need: request,
    resources: new MemoryResourceStore(),
    credentials: { apiKey: { secret: "test" } },
    operation: "op:body-timeout",
    handle: {
      taskId: "existing",
      routeKey: kieRouteForCapability(request.capability)!.key,
      startedAt: 1_000,
    },
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.status === "failed" && outcome.failure.code, "KIE_REQUEST_TIMEOUT");
  assert.ok(Date.now() - startedAt < 500, "poll returns after the configured network timeout");
});
