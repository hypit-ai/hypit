import type { BlobRef } from "@narratage/protocol";

export type BackgroundRemovalRequest = {
  readonly contract: "svml.background-removal-request@1";
  readonly source: BlobRef;
};
