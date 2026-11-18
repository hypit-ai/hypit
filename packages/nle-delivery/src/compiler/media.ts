import { sealMediaInterpretation, type ResolvedMedia } from "@hypit/media";
import type { LocalSpatialDomain } from "./spatial.js";
import type { CompiledSource, CompiledSourceOutput } from "./types.js";

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

/** Project one Host-resolved accepted Media value into the fixed compiler source. */
export function resolvedMediaSource(id: string, value: ResolvedMedia): CompiledSource {
  assert(typeof id === "string" && id.length > 0, "Resolved Media Source id is empty.");
  assert(value.resource.address.length > 0, `Resolved Media ${id} resource address is empty.`);
  assert(value.resource.mediaType.length > 0, `Resolved Media ${id} resource media type is empty.`);
  const interpretation = sealMediaInterpretation(value.interpretation);
  const signalDomain = interpretation.domain;
  const outputs: Record<string, CompiledSourceOutput> = {};
  if (interpretation.picture !== undefined) {
    const spatialDomain = pictureDomain(id, { resource: value.resource, interpretation });
    outputs.picture = interpretation.picture.kind === "constant"
      ? { signal: "picture", kind: "constant", spatialDomain }
      : {
          signal: "picture",
          kind: "signal",
          domain: structuredClone(signalDomain!),
          spatialDomain,
        };
  }
  if (interpretation.audio !== undefined) outputs.audio = {
    signal: "audio",
    kind: "signal",
    domain: structuredClone(signalDomain!),
  };
  assert(Object.keys(outputs).length > 0, `Resolved Media ${id} has no selected Picture or Audio member.`);
  return {
    id,
    content: { kind: "media", media: { resource: structuredClone(value.resource), interpretation } },
    outputs,
  };
}
