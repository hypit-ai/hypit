import { canonicalize, isDigest } from "@narratage/protocol";

import type { BackgroundRemovalRequest } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertBackgroundRemovalRequest(value: BackgroundRemovalRequest): void {
  assert(value.source.kind === "blob" && isDigest(value.source.digest)
    && Number.isSafeInteger(value.source.size) && value.source.size >= 0
    && value.source.mediaType.startsWith("image/"), "Background Removal source must be an image Blob Artifact.");
}

export function backgroundRemovalRequest(source: BackgroundRemovalRequest["source"]): BackgroundRemovalRequest {
  const value = { source };
  assertBackgroundRemovalRequest(value);
  return canonicalize(value) as unknown as BackgroundRemovalRequest;
}
