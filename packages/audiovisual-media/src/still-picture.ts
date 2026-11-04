import type { ProgramSource } from "@hypit/audiovisual";
import { assertProgramSource, pictureType } from "@hypit/audiovisual";
import type { BlobRef } from "@hypit/hypit/protocol";
import { assertBlobRef } from "@hypit/hypit/protocol";
import type { PictureInterpretation } from "@hypit/media";
import { verifyPictureInterpretation } from "@hypit/media";
import type { LocalSpatialDomain } from "@hypit/spatial/algebra";
import { assertLocalSpatialDomain } from "@hypit/spatial/algebra";

export type StillPictureSourceSpec = {
  /** Author-owned Source identity. It is never recovered from the Blob locator. */
  readonly id: string;
  /** The picture's factual local coordinate domain. */
  readonly space: LocalSpatialDomain;
};

/** One fully interpreted, timeless picture resource. */
export type StillPictureSource = StillPictureSourceSpec & {
  readonly artifact: BlobRef;
  readonly picture: PictureInterpretation;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

export function assertStillPictureSourceSpec(
  value: StillPictureSourceSpec,
): void {
  assertIdentity(value.id, "Still Picture Source identity");
  assertLocalSpatialDomain(value.space);
}

export function sealStillPictureSource(value: StillPictureSource): StillPictureSource {
  assertStillPictureSourceSpec(value);
  assertBlobRef(value.artifact, `Still Picture Source ${value.id} artifact`);
  assert(value.artifact.mediaType.startsWith("image/"),
    `Still Picture Source ${value.id} artifact is not an image.`);
  verifyPictureInterpretation(value.picture, `Still Picture Source ${value.id} interpretation`);
  return structuredClone(value);
}

/** Close Blob and interpretation facts under an explicit Source identity. */
export function resolveStillPictureSource(
  spec: StillPictureSourceSpec,
  artifact: BlobRef,
  picture: PictureInterpretation,
): StillPictureSource {
  return sealStillPictureSource({
    id: spec.id,
    space: structuredClone(spec.space),
    artifact: structuredClone(artifact),
    picture: structuredClone(picture),
  });
}

/** Project a timeless picture into AVIR without inventing a temporal domain. */
export function programSourceFromStillPicture(value: StillPictureSource): ProgramSource {
  const source = sealStillPictureSource(value);
  const result: ProgramSource = {
    id: source.id,
    outputs: {
      picture: {
        kind: "constant",
        type: pictureType,
        spatialDomain: structuredClone(source.space),
      },
    },
  };
  assertProgramSource(result);
  return structuredClone(result);
}
