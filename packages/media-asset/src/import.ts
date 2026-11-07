import { prepareMedia, selectMediaStreams } from "@hypit/media";

import { sealMediaAssetDocument } from "./document.js";
import type {
  MediaAssetDocument,
  MediaAssetInterpretationInput,
} from "./types.js";

/**
 * Close one explicit inspection + selection decision into a portable file document.
 * The temporary BlobRef exists only to reuse Media's exact interpretation algebra.
 */
export function createMediaAssetDocumentFromInspection(
  input: MediaAssetInterpretationInput,
): MediaAssetDocument {
  const resolved = prepareMedia({
    id: `${input.id}:media`,
    source: {
      kind: "blob",
      resource: "res_media-asset-import",
      size: 0,
      mediaType: input.file.mediaType,
    },
    inspection: input.inspection,
    selection: selectMediaStreams(input.inspection, input.selection),
  });
  const { source: _source, ...interpretation } = resolved;
  return sealMediaAssetDocument({
    format: "hypit.media-asset@1",
    id: input.id,
    media: {
      file: structuredClone(input.file),
      interpretation,
    },
    representations: [],
  });
}
