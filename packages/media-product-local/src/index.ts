import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  MediaAssetImportTaskContext,
} from "@hypit/media-asset";
import {
  mediaAssetGenerationNodes,
  verifyMediaAssetReference,
  type MediaAssetReference,
} from "@hypit/media-asset";
import type { GenerationGraphNode } from "@hypit/generation-graph";
import type { NodeMediaAssetImportResult } from "@hypit/media-asset/node";
import {
  importLocalMediaAsset,
  mediaAssetIdFromFile,
  mediaFileExtension,
  type LocalMediaAssetImportRequest,
} from "@hypit/media-local";
import type { ProductHistory } from "@hypit/product";
import {
  isBlobRef,
  sameType,
} from "@hypit/protocol";
import type { ProductAddress } from "@hypit/product";

export type LocalMediaProductMaterializationRequest = Omit<
  LocalMediaAssetImportRequest,
  "sourcePath" | "assetPath" | "mediaType" | "filePolicy"
> & {
  readonly product: ProductAddress;
  readonly assetPath: string;
};

export type LocalMediaProductMaterializationHost = {
  readonly products: ProductHistory;
  /** Replaceable only at the application boundary; the normal implementation is direct local import. */
  readonly importMediaAsset?: (
    request: LocalMediaAssetImportRequest,
    context?: MediaAssetImportTaskContext,
  ) => Promise<NodeMediaAssetImportResult>;
};

export type LocalMediaProductGenerationNodeRequest = LocalMediaProductMaterializationRequest & {
  readonly node: string;
  /** Portable Media Asset reference as it will appear in the Generation Graph. */
  readonly asset: MediaAssetReference;
  /** Selects the typed projection required by the intended downstream port. */
  readonly projection: keyof typeof mediaAssetGenerationNodes;
};

export type LocalMediaProductGenerationNodeResult = NodeMediaAssetImportResult & {
  readonly node: GenerationGraphNode;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function cancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw signal.reason ?? new Error("Media Product materialization was cancelled.");
}

function portableMediaFileStem(value: string): string {
  const normalized = value.normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return (normalized.length === 0 ? "media" : normalized).slice(0, 160);
}

/**
 * Copy one exact file Product into an ordinary Media Asset.
 * Product identity is used only to open bytes and never enters the resulting document.
 */
export async function materializeLocalMediaProduct(
  request: LocalMediaProductMaterializationRequest,
  host: LocalMediaProductMaterializationHost,
  context: MediaAssetImportTaskContext = {},
): Promise<NodeMediaAssetImportResult> {
  const {
    product,
    assetPath,
    id: requestedId,
    mediaFile: requestedMediaFile,
    ...mediaOptions
  } = request;
  const summary = await host.products.readProduct(product);
  assert(summary !== undefined,
    `Media Product ${product.publication}/${product.name} does not exist.`);
  assert(summary.representation === "file",
    `Product ${product.publication}/${product.name} is not one media file.`);
  assert(/^(?:audio|image|video)\//u.test(summary.mediaType),
    `Product ${product.publication}/${product.name} is ${summary.mediaType}, not media.`);
  const extension = mediaFileExtension(summary.mediaType);
  const resolved = await host.products.resolveProduct(product);
  assert(resolved !== undefined,
    `Media Product ${product.publication}/${product.name} cannot be resolved.`);
  assert(sameType(resolved.type, summary.type), "Resolved Media Product has a different Type.");
  assert(isBlobRef(resolved.value), "Resolved file Product does not contain one Blob.");
  assert(resolved.value.mediaType === summary.mediaType,
    `Resolved Media Product is ${resolved.value.mediaType}, expected ${summary.mediaType}.`);

  const id = requestedId ?? mediaAssetIdFromFile(product.name);
  const mediaFile = requestedMediaFile ?? `${portableMediaFileStem(product.name)}${extension}`;
  const directory = await mkdtemp(join(tmpdir(), "hypit-media-product-"));
  const staged = join(directory, `product${extension}`);
  try {
    cancelled(context.signal);
    const bytes = await resolved.openResource(resolved.value);
    assert(bytes !== undefined,
      `Media Product ${product.publication}/${product.name} bytes are unavailable.`);
    await writeFile(staged, bytes, {
      flag: "wx",
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    cancelled(context.signal);
    return await (host.importMediaAsset ?? importLocalMediaAsset)({
      ...mediaOptions,
      id,
      mediaFile,
      sourcePath: staged,
      assetPath,
      mediaType: summary.mediaType,
      filePolicy: "copy",
    }, context);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Materialize one media Product and author the exact file-backed value node selected by its downstream port. */
export async function materializeLocalMediaProductAsGenerationNode(
  request: LocalMediaProductGenerationNodeRequest,
  host: LocalMediaProductMaterializationHost,
  context: MediaAssetImportTaskContext = {},
): Promise<LocalMediaProductGenerationNodeResult> {
  verifyMediaAssetReference(request.asset);
  const {
    node,
    asset,
    projection,
    ...materialization
  } = request;
  const result = await materializeLocalMediaProduct(materialization, host, context);
  return {
    ...result,
    node: {
      id: node,
      using: mediaAssetGenerationNodes[projection],
      inputs: { asset: { value: asset } },
    },
  };
}
