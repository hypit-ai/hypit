import type { ComponentPackage } from "@narratage/component-kit";
import type { ProgramSpace } from "@narratage/program-space";
import { canonicalize } from "@narratage/protocol";
import type { BlobRef, StoredValue } from "@narratage/protocol";
import type { ContentFit, IntrinsicExtent, SpatialFrame } from "@narratage/spatial";

import { mediaTrackProducers, mediaTrackTypes } from "./manifest.js";
import {
  appendFullStillMediaItem,
  assertMediaTrackProgram,
  createMediaTrackSet,
  finalizeMediaTrack,
  mediaTrackImplementationDigests,
  mediaTrackValidatorDigests,
  renderMediaTrack,
} from "./program.js";
import type { MediaStillItemSpec, MediaTrackHeader, MediaTrackProgram, MediaTrackSet } from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}
function blob(value: StoredValue | undefined): BlobRef {
  if (value?.kind !== "blob") throw new Error("Media source must be a BlobArtifact.");
  return value;
}
const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

export const mediaTrackComponent = {
  name: "@narratage/media-track",
  producers: [
    { producer: mediaTrackProducers.createSet, implementationDigest: mediaTrackImplementationDigests.createSet, handler: () => ({ outputs: { set: output(createMediaTrackSet()) }, needs: {} }) },
    { producer: mediaTrackProducers.appendFullStill, implementationDigest: mediaTrackImplementationDigests.appendFullStill, handler: ({ inputs }) => ({ outputs: { set: output(appendFullStillMediaItem(
      inline<MediaTrackSet>(inputs.set?.value, "MediaTrackSet"),
      inline<MediaTrackHeader>(inputs.header?.value, "MediaTrackHeader"),
      inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
      blob(inputs.source?.value),
      inline<IntrinsicExtent>(inputs.extent?.value, "IntrinsicExtent"),
      inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
      inline<ContentFit>(inputs.fit?.value, "ContentFit"),
      inline<MediaStillItemSpec>(inputs.spec?.value, "MediaStillItemSpec"),
    )) }, needs: {} }) },
    { producer: mediaTrackProducers.finalize, implementationDigest: mediaTrackImplementationDigests.finalize, handler: ({ inputs }) => ({ outputs: { program: output(finalizeMediaTrack(
      inline<MediaTrackSet>(inputs.set?.value, "MediaTrackSet"),
      inline<MediaTrackHeader>(inputs.header?.value, "MediaTrackHeader"),
    )) }, needs: {} }) },
    { producer: mediaTrackProducers.render, implementationDigest: mediaTrackImplementationDigests.render, handler: ({ inputs }) => ({ outputs: { track: output(renderMediaTrack(
      inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
      inline<MediaTrackProgram>(inputs.program?.value, "MediaTrackProgram"),
    )) }, needs: {} }) },
  ],
  validators: [{
    type: mediaTrackTypes.program,
    implementationDigest: mediaTrackValidatorDigests.program,
    handler: ({ value }) => assertMediaTrackProgram(inline<MediaTrackProgram>(value, "MediaTrackProgram")),
  }],
} satisfies ComponentPackage;
