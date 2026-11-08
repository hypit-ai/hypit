import {
  assertProgramSource,
  audioType,
  pictureType,
  type ProgramSource,
} from "@hypit/audiovisual";
import {
  preparedPictureExtent,
  verifyPreparedMedia,
  type PreparedMedia,
} from "@hypit/media";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";

/** Project selected Media members into one renderer-independent AVIR Source. */
export function programSourceFromPreparedMedia(media: PreparedMedia): ProgramSource {
  verifyPreparedMedia(media);
  const outputs: Record<string, ProgramSource["outputs"][string]> = {};
  if (media.picture !== undefined) {
    const extent = preparedPictureExtent(media);
    const spatialDomain = sealLocalSpatialDomain({
      id: `${media.id}:picture`,
      region: { x: 0, y: 0, width: extent.widthPx, height: extent.heightPx },
    });
    if (media.picture.kind === "constant") {
      outputs.picture = { kind: "constant", type: pictureType, spatialDomain };
    } else {
      if (media.domain === undefined) {
        throw new Error(`Prepared Media ${media.id} Picture signal has no temporal domain.`);
      }
      outputs.picture = {
        kind: "signal",
        type: pictureType,
        domain: structuredClone(media.domain),
        spatialDomain,
      };
    }
  }
  if (media.audio !== undefined) {
    if (media.domain === undefined) throw new Error(`Prepared Media ${media.id} Audio has no temporal domain.`);
    outputs.audio = {
      kind: "signal",
      type: audioType,
      domain: structuredClone(media.domain),
    };
  }
  const source: ProgramSource = { id: media.id, outputs };
  assertProgramSource(source);
  return structuredClone(source);
}
