import assert from "node:assert/strict";
import test from "node:test";
import type { AsyncEndpoint, CapabilityRef, EndpointPollContext, EndpointRegistrar, EndpointStartContext } from "@hypit/endpoint-kit";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { sealSeedanceRequest } from "@hypit/seedance";

import { createHiggsfieldProvider } from "../src/provider.js";
import { higgsfieldRouteForCapability } from "../src/routes.js";

const capability = { module: { name: "@hypit/seedance", version: "1" }, name: "seedance-2.5" } as const;
const image: BlobRef = { kind: "blob", resource: "res_higgsfield_3", size: 4, mediaType: "image/png" };
const request = sealSeedanceRequest("seedance-2.5", {
  prompt: ["go"], resolution: ["720p"], duration: [5], generateAudio: [true], webSearch: [false],
  aspectRatio: ["9:16"], referenceImage: [{ role: "image", artifact: image, fields: { personReference: true } }],
});

/** Install the Provider the way the Runtime does, keeping the asynchronous Endpoint it registers. */
async function installed(fetcher: typeof globalThis.fetch): Promise<AsyncEndpoint> {
  let registered: AsyncEndpoint | undefined;
  const registry: EndpointRegistrar = {
    registerImmediateEndpoint() { throw new Error("Higgsfield registers no immediate capability"); },
    registerAsyncEndpoint(_id: string, _capability: CapabilityRef, _returns, endpoint: AsyncEndpoint) {
      registered ??= endpoint;
    },
  };
  await createHiggsfieldProvider({ fetch: fetcher }).install(registry);
  assert.ok(registered !== undefined, "the Provider registered no asynchronous Endpoint");
  return registered;
}

function invocation(stored: string[]) {
  return {
    need: { capability, constraints: request as unknown as CanonicalValue },
    credentials: { apiKey: { secret: "key-id:key-secret" } },
    resources: {
      get: async () => new Uint8Array([1, 2, 3, 4]),
      put: async (bytes: Uint8Array, mediaType: string) => {
        stored.push(mediaType);
        return { kind: "blob", resource: "res_out", size: bytes.byteLength, mediaType } as BlobRef;
      },
    },
  };
}

/** The illustrative transport stands in for Higgsfield's documented operations; no key is used. */
function service(onSubmit: (body: Record<string, unknown>) => void): typeof globalThis.fetch {
  return (async (url: string | URL, init: RequestInit = {}) => {
    const address = String(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (address.endsWith("/files/generate-upload-url")) {
      return json({
        public_url: "https://cdn.higgsfield.ai/input/reference.png",
        upload_url: "https://storage.higgsfield.ai/presigned",
        upload_headers: { "x-amz-tagging": "retention=temporary" },
      });
    }
    if (address === "https://storage.higgsfield.ai/presigned") {
      const headers = (init.headers ?? {}) as Record<string, string>;
      assert.equal(headers["x-amz-tagging"], "retention=temporary");
      assert.equal(headers.authorization, undefined, "account credentials must not reach presigned storage");
      return new Response("", { status: 200 });
    }
    if (address.endsWith("/bytedance/seedance-2.5/reference-to-video")) {
      assert.equal(((init.headers ?? {}) as Record<string, string>).authorization, "Key key-id:key-secret");
      onSubmit(JSON.parse(String(init.body)) as Record<string, unknown>);
      return json({
        status: "queued", request_id: "req-1",
        status_url: "https://api.higgsfield.ai/requests/req-1/status",
        cancel_url: "https://api.higgsfield.ai/requests/req-1/cancel",
      });
    }
    if (address.endsWith("/requests/req-1/status")) {
      return json({ status: "completed", request_id: "req-1", video: { url: "https://cdn.higgsfield.ai/out.mp4" } });
    }
    if (address === "https://cdn.higgsfield.ai/out.mp4") {
      return new Response("mp4", { status: 200, headers: { "content-type": "video/mp4" } });
    }
    throw new Error(`unexpected request ${address}`);
  }) as unknown as typeof globalThis.fetch;
}

test("a reference request uploads, submits, polls and collects", async () => {
  const stored: string[] = [];
  let submitted: Record<string, unknown> | undefined;
  const endpoint = await installed(service((body) => { submitted = body; }));
  const context = invocation(stored);

  const started = await endpoint.start({ ...context, operation: "op-1", checkpoint: async () => {} } as unknown as EndpointStartContext);
  assert.equal(started.status, "pending", `start failed: ${JSON.stringify(started.status === "failed" ? started.failure : {})}`);
  assert.deepEqual(submitted, {
    prompt: "go", resolution: "720p", duration: 5, generate_audio: true, aspect_ratio: "9:16",
    image_urls: ["https://cdn.higgsfield.ai/input/reference.png"],
  });
  assert.equal(started.receipt?.id, "req-1");

  const polled = await endpoint.poll({ ...context, handle: started.handle } as unknown as EndpointPollContext);
  assert.equal(polled.status, "ready");
  const collected = await endpoint.collect!({ ...context, handle: polled.status === "ready" ? polled.handle : undefined } as unknown as EndpointPollContext);
  assert.equal(collected.status, "completed");
  assert.deepEqual(stored, ["video/mp4"]);
  assert.equal(collected.receipt?.id, "req-1");
});

test("a terminal non-completed request keeps the service's own reason without its URLs", async () => {
  const rejected = (async () => new Response(
    JSON.stringify({ status: "nsfw", request_id: "req-2", error: { message: "rejected https://cdn.higgsfield.ai/input.png" } }),
    { status: 200, headers: { "content-type": "application/json" } },
  )) as unknown as typeof globalThis.fetch;
  const endpoint = await installed(rejected);
  const outcome = await endpoint.poll({
    ...invocation([]),
    handle: {
      contract: "hypit.higgsfield-operation@1", requestId: "req-2",
      route: higgsfieldRouteForCapability(capability)!.key,
      statusUrl: "https://api.higgsfield.ai/requests/req-2/status", startedAt: Date.now(),
    },
  } as unknown as EndpointPollContext);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.status === "failed" ? outcome.failure.code : undefined, "HIGGSFIELD_NSFW");
  assert.match(outcome.status === "failed" ? outcome.failure.message : "", /\[redacted-url\]/u);
});
