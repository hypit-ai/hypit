import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { AsyncEndpoint, EndpointOutcome, ResourceStore } from "@hypit/endpoint";
import { sealGrokImagineRequest } from "@hypit/grok-imagine";
import type { BlobRef, CanonicalValue, Need } from "@hypit/protocol";

import { createPolloProvider } from "../src/provider.js";
import { polloRouteForCapability } from "../src/routes.js";

async function listen(handler: Parameters<typeof createServer>[1]) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

const route = polloRouteForCapability({ module: { name: "@hypit/grok-imagine", version: "1" }, name: "grok-imagine-video-1.5-preview" })!;
const image: BlobRef = { kind: "blob", resource: "res_pollo_1", size: 3, mediaType: "image/png" };
const need: Need = {
  id: "need:pollo-redirect", capability: route.capability, returns: route.returns,
  constraints: sealGrokImagineRequest("grok-imagine-video-1.5-preview", {
    prompt: ["spin"], aspectRatio: ["auto"], resolution: ["720p"], duration: [8], images: [{ role: "image", artifact: image }],
  }) as unknown as CanonicalValue,
  result: "record:pollo",
};
const credentials = { apiKey: { secret: "POLLO_SECRET_KEY" } };

/** An API whose every response redirects to a second, cross-origin server that records the key it receives. */
async function redirected(run: (endpoint: AsyncEndpoint) => Promise<EndpointOutcome>) {
  const keys: (string | undefined)[] = [];
  const other = await listen((request, response) => {
    keys.push(request.headers["x-api-key"] as string | undefined);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ taskId: "task_2", generations: [{ status: "processing" }] }));
  });
  const api = await listen((_request, response) => {
    response.writeHead(307, { location: `http://127.0.0.1:${other.port}/collect?signature=SIGNED_PART` });
    response.end();
  });
  try {
    let endpoint: AsyncEndpoint | undefined;
    const registry = { registerAsyncEndpoint: (_instance: unknown, _capability: unknown, _returns: unknown, value: AsyncEndpoint) => { endpoint = value; } };
    createPolloProvider({
      baseUrl: `http://127.0.0.1:${api.port}`, pollIntervalMs: 0,
      publicAssetUrl: async () => "https://assets.example.test/image.png",
    }).install(registry as unknown as Parameters<ReturnType<typeof createPolloProvider>["install"]>[0]);
    assert.ok(endpoint !== undefined);
    const result = await run(endpoint);
    assert.deepEqual(keys, [], "the redirect target must not be contacted with the API key");
    assert.equal(result.status, "failed");
    const text = JSON.stringify(result);
    assert.match(text, /Pollo HTTP 307/u);
    assert.match(text, new RegExp(`redirect to http://127\\.0\\.0\\.1:${other.port} not followed`, "u"));
    assert.match(text, /set baseUrl to that origin/u);
    assert.doesNotMatch(text, /\/collect|SIGNED_PART/u, "only the redirect origin may be reported");
    assert.doesNotMatch(text, /POLLO_SECRET_KEY/u);
  } finally {
    api.server.close();
    other.server.close();
  }
}

test("Pollo does not forward its API key across a redirect when polling", async () => {
  await redirected(async (endpoint) => {
    const handle = { contract: "hypit.pollo-operation@1", taskId: "task_1", route: route.key, startedAt: Date.now() };
    return await endpoint.poll({
      command: { kind: "fulfill-need", id: "command:pollo", need }, need, operation: "operation:pollo",
      resources: {} as ResourceStore, credentials, handle: handle as unknown as CanonicalValue,
    });
  });
});

test("Pollo does not forward its API key across a redirect when submitting", async () => {
  await redirected(async (endpoint) => await endpoint.start({
    command: { kind: "fulfill-need", id: "command:pollo", need }, need, operation: "operation:pollo",
    resources: {} as ResourceStore, credentials,
  }));
});
