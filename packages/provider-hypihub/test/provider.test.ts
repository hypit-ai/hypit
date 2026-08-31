import assert from "node:assert/strict";
import test from "node:test";

import { EndpointRegistry, MemoryArtifactStore } from "@hypit/driver-node";
import type { AsyncEndpoint } from "@hypit/endpoint-kit";
import type { CanonicalValue, Need } from "@hypit/protocol";
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
  assert.equal(calls.length, 6);
});
