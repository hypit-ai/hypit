import { sealMediaInterpretation, type ResolvedMedia } from "@hypit/media";
import type { LocalSpatialDomain } from "./spatial.js";
import type { ResolvedSource } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pictureDomain(id: string, media: ResolvedMedia): LocalSpatialDomain {
  const picture = media.interpretation.picture;
  assert(picture !== undefined, `Resolved Media ${id} has no Picture member.`);
  const interpreted = picture.interpretation;
  const displayWidth = interpreted.codedWidth
    * interpreted.sampleAspectRatio.numerator / interpreted.sampleAspectRatio.denominator;
  const rotated = interpreted.rotationDegrees === 90 || interpreted.rotationDegrees === 270;
  return {
    id: `${id}:picture-space`,
    region: {
      x: 0,
      y: 0,
      width: rotated ? interpreted.codedHeight : displayWidth,
      height: rotated ? displayWidth : interpreted.codedHeight,
    },
  };
}

export function resolvedMediaSource(id: string, value: ResolvedMedia): ResolvedSource {
  assert(value.resource.address.length > 0, `Resolved Media ${id} resource address is empty.`);
  assert(value.resource.mediaType.length > 0, `Resolved Media ${id} resource media type is empty.`);
  const interpretation = sealMediaInterpretation(value.interpretation);
  const media = { resource: value.resource, interpretation };
  const picture = interpretation.picture;
  return {
    content: { kind: "media", media },
    ...(picture === undefined ? {} : {
      picture: {
        spatialDomain: pictureDomain(id, media),
        ...(picture.kind !== "constant" ? { time: interpretation.domain! } : {}),
      },
    }),
    ...(interpretation.audio === undefined ? {} : { audio: interpretation.domain! }),
  };
}
