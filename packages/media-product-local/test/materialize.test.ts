import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { blobTypes } from "@hypit/hypit/blob";
import type { LocalMediaAssetImportRequest } from "@hypit/media-local";
import type { ProductHistory } from "@hypit/product";

import { materializeLocalMediaProduct } from "../src/index.js";

const address = { publication: "bld_exact", name: "hero:take" } as const;
const blob = { kind: "blob" as const, resource: "res_hero" as const, size: 4, mediaType: "video/mp4" };

function products(): ProductHistory {
  return {
    async readProduct(candidate) {
      return candidate.publication === address.publication && candidate.name === address.name
        ? {
            address,
            type: blobTypes.blob,
            publisher: "@hypit/product@1#product",
            representation: "file",
            mediaType: blob.mediaType,
            size: blob.size,
          }
        : undefined;
    },
    async resolveProduct(candidate) {
      return candidate.publication === address.publication && candidate.name === address.name
        ? {
            address,
            type: blobTypes.blob,
            publisher: "@hypit/product@1#product",
            value: blob,
            openResource: async (resource) => resource.resource === blob.resource
              ? (async function* () { yield new Uint8Array([1, 2, 3, 4]); })()
              : undefined,
          }
        : undefined;
    },
  };
}

test("one exact media Product becomes an ordinary import and leaves no staging file", async () => {
  let staged = "";
  let imported: LocalMediaAssetImportRequest | undefined;
  const result = await materializeLocalMediaProduct({
    product: address,
    assetPath: "/project/assets/hero.media.json",
  }, {
    products: products(),
    async importMediaAsset(request) {
      imported = request;
      staged = request.sourcePath;
      assert.deepEqual(Uint8Array.from(await readFile(staged)), new Uint8Array([1, 2, 3, 4]));
      return {
        assetPath: request.assetPath,
        mediaPath: "/project/assets/hero.mp4",
        document: {} as never,
      };
    },
  });
  assert.equal(result.assetPath, "/project/assets/hero.media.json");
  assert.deepEqual(imported === undefined ? undefined : {
    id: imported.id,
    assetPath: imported.assetPath,
    mediaType: imported.mediaType,
    filePolicy: imported.filePolicy,
    mediaFile: imported.mediaFile,
  }, {
    id: "hero:take",
    assetPath: "/project/assets/hero.media.json",
    mediaType: "video/mp4",
    filePolicy: "copy",
    mediaFile: "hero-take.mp4",
  });
  assert.equal(Object.hasOwn(imported ?? {}, "product"), false);
  assert.equal(await stat(staged).then(() => true, () => false), false);
});

test("structured and non-media Products do not enter Media Asset import", async () => {
  let imported = false;
  const structured: ProductHistory = {
    async readProduct() {
      return {
        address,
        type: blobTypes.blob,
        publisher: "@hypit/product@1#product",
        representation: "structured",
      };
    },
    async resolveProduct() { throw new Error("must not resolve"); },
  };
  await assert.rejects(() => materializeLocalMediaProduct({
    product: address,
    assetPath: "/project/assets/hero.media.json",
  }, {
    products: structured,
    async importMediaAsset() {
      imported = true;
      throw new Error("must not import");
    },
  }), /not one media file/u);
  assert.equal(imported, false);
});
