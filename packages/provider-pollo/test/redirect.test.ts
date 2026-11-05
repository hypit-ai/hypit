import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { AsyncEndpoint, ResourceStore } from "@hypit/endpoint";
import { sealGrokImagineRequest } from "@hypit/grok-imagine";
import type { BlobRef, CanonicalValue, Need } from "@hypit/protocol";

import { createPolloProvider } from "../src/provider.js";
import { polloRouteForCapability } from "../src/routes.js";

async function listen(handler: Parameters<typeof createServer>[1]) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

test("Pollo does not forward its API key across a redirect", async () => {
  const keys: (string | undefined)[] = [];
  const other = await listen((request, response) => {
    keys.push(request.headers["x-api-key"] as string | undefined);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ generations: [{ status: "processing" }] }));
  });
  const api = await listen((_request, response) => {
    response.writeHead(307, { location: `http://localhost:${other.port}/collect` });
    response.end();
  });
  try {
    const route = polloRouteForCapability({ module: { name: "@hypit/grok-imagine", version: "1" }, name: "grok-imagine-video-1.5-preview" })!;
    const image: BlobRef = { kind: "blob", resource: "res_pollo_1", size: 3, mediaType: "image/png" };
    const need: Need = {
      id: "need:pollo-redirect", capability: route.capability, returns: route.returns,
      constraints: sealGrokImagineRequest("grok-imagine-video-1.5-preview", {
        prompt: ["spin"], aspectRatio: ["auto"], resolution: ["720p"], duration: [8], images: [{ role: "image", artifact: image }],
      }) as unknown as CanonicalValue,
      result: "record:pollo",
    };
    let endpoint: AsyncEndpoint | undefined;
    const registry = { registerAsyncEndpoint: (_instance: unknown, _capability: unknown, _returns: unknown, value: AsyncEndpoint) => { endpoint = value; } };
    createPolloProvider({ baseUrl: `http://127.0.0.1:${api.port}`, pollIntervalMs: 0 })
      .install(registry as unknown as Parameters<ReturnType<typeof createPolloProvider>["install"]>[0]);
    assert.ok(endpoint !== undefined);
    const handle = { contract: "hypit.pollo-operation@1", taskId: "task_1", route: route.key, startedAt: Date.now() };
    const result = await endpoint.poll({
      command: { kind: "fulfill-need", id: "command:pollo", need }, need, operation: "operation:pollo",
      resources: {} as ResourceStore, credentials: { apiKey: { secret: "POLLO_SECRET_KEY" } },
      handle: handle as unknown as CanonicalValue,
    });
    assert.deepEqual(keys, [], "the redirect target must not be contacted with the API key");
    assert.equal(result.status, "failed");
    assert.match(JSON.stringify(result), /Pollo HTTP 307/u);
    assert.doesNotMatch(JSON.stringify(result), /POLLO_SECRET_KEY/u);
  } finally {
    api.server.close();
    other.server.close();
  }
});
