import assert from "node:assert/strict";
import test from "node:test";

import type { ProductHistory } from "@hypit/product";
import type { BlobRef, TypeRef } from "@hypit/protocol";

import { resolveGenerationNodeProduct } from "../src/index.js";

const moduleRef = { name: "@example/media", version: "1" } as const;
const mediaType = { module: moduleRef, name: "Media" } satisfies TypeRef;
const blob: BlobRef = {
  kind: "blob",
  resource: "res_generation_product",
  size: 5,
  mediaType: "video/mp4",
};

test("a Product reference resolves typed value and owned bytes without copying Result state", async () => {
  const history: ProductHistory = {
    async readProduct() { return undefined; },
    async resolveProduct(address) {
      return {
        address,
        type: mediaType,
        publisher: "hypit.product@1",
        value: { media: blob },
        async openResource(requested) {
          if (requested.resource !== blob.resource) return undefined;
          return (async function* () { yield new TextEncoder().encode("video"); })();
        },
      };
    },
  };
  const resolved = await resolveGenerationNodeProduct({
    format: "hypit.node-product@1",
    build: "bld_fixture",
    output: "hero",
  }, history);
  assert.equal(resolved.record.id, 'generation-product:["bld_fixture","hero"]');
  assert.deepEqual(resolved.record.value, { media: blob });
  assert.equal(resolved.attachments.length, 1);
  const bytes: number[] = [];
  for await (const chunk of await resolved.attachments[0]!.open()) bytes.push(...chunk);
  assert.equal(new TextDecoder().decode(Uint8Array.from(bytes)), "video");
});

test("an active, failed or missing Product is unavailable rather than regenerated", async () => {
  const history: ProductHistory = {
    async readProduct() { return undefined; },
    async resolveProduct() { return undefined; },
  };
  await assert.rejects(() => resolveGenerationNodeProduct({
    format: "hypit.node-product@1",
    build: "bld_missing",
    output: "hero",
  }, history), /is not ready/u);
});
