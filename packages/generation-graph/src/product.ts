import {
  productAddress,
  type ProductHistory,
} from "@hypit/product";
import { valueBlobRefs, type BlobRef } from "@hypit/protocol";

import { assertGenerationNodeProduct } from "./project.js";
import type {
  GenerationGraphResolvedProduct,
  GenerationNodeProduct,
} from "./types.js";

/** Resolve one finished Product reference into ordinary graph input data and its owned bytes. */
export async function resolveGenerationNodeProduct(
  reference: GenerationNodeProduct,
  history: ProductHistory,
): Promise<GenerationGraphResolvedProduct> {
  assertGenerationNodeProduct(reference);
  const address = productAddress(reference.build, reference.output);
  const product = await history.resolveProduct(address);
  if (product === undefined) {
    throw new Error(`Generation Product ${reference.build}/${reference.output} is not ready.`);
  }
  const blobs = new Map<string, BlobRef>();
  for (const { blob } of valueBlobRefs(product.value)) {
    const existing = blobs.get(blob.resource);
    if (existing !== undefined
      && (existing.size !== blob.size || existing.mediaType !== blob.mediaType)) {
      throw new Error(`Generation Product Resource ${blob.resource} has conflicting descriptions.`);
    }
    blobs.set(blob.resource, blob);
  }
  return {
    record: {
      id: `generation-product:${JSON.stringify([reference.build, reference.output])}`,
      type: product.type,
      value: product.value,
    },
    attachments: [...blobs.values()].map((blob) => ({
      blob,
      async open() {
        const stream = await product.openResource(blob);
        if (stream === undefined) {
          throw new Error(`Generation Product Resource ${blob.resource} is unavailable.`);
        }
        return stream;
      },
    })),
  };
}
