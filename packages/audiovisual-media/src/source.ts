import {
  assertProgramSource,
  audioType,
  pictureType,
} from "@hypit/audiovisual";
import type { ProgramSource } from "@hypit/audiovisual";
import {
  preparedVisualExtent,
  verifyPreparedMedia,
} from "@hypit/media";
import type { PreparedMedia } from "@hypit/media";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";

/** Project selected Media members into one renderer-independent audiovisual Source. */
export function programSourceFromPreparedMedia(media: PreparedMedia): ProgramSource {
  verifyPreparedMedia(media);
  const outputs: Record<string, ProgramSource["outputs"][string]> = {};
  if (media.visual !== undefined) {
    const extent = preparedVisualExtent(media);
    outputs.picture = {
      kind: "signal",
      type: pictureType,
      domain: structuredClone(media.domain),
      spatialDomain: sealLocalSpatialDomain({
        id: `${media.domain.id}:picture`,
        region: { x: 0, y: 0, width: extent.widthPx, height: extent.heightPx },
      }),
    };
  }
  if (media.audio !== undefined) {
    outputs.audio = {
      kind: "signal",
      type: audioType,
      domain: structuredClone(media.domain),
    };
  }
  const source: ProgramSource = { id: media.domain.id, outputs };
  assertProgramSource(source);
  return structuredClone(source);
}
