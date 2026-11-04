import type { PreparedMedia } from "@hypit/media";
import type { PictureInterpretation } from "@hypit/media";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";

import { audiovisualMediaProducers, audiovisualMediaTypes } from "./manifest.js";
import { programSourceFromPreparedMedia } from "./source.js";
import {
  assertStillPictureSourceSpec,
  programSourceFromStillPicture,
  resolveStillPictureSource,
  sealStillPictureSource,
  type StillPictureSource,
  type StillPictureSourceSpec,
} from "./still-picture.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const audiovisualMediaComponent = {
  producers: [
    {
      producer: audiovisualMediaProducers.source,
      handler: ({ inputs }) => ({
        kind: "output",
        value: canonicalize(programSourceFromPreparedMedia(
          valueOf<PreparedMedia>(inputs.media?.value, "PreparedMedia"),
        )),
      }),
    },
    {
      producer: audiovisualMediaProducers.resolveStillPicture,
      handler: ({ inputs }) => ({
        kind: "output",
        value: canonicalize(resolveStillPictureSource(
          valueOf<StillPictureSourceSpec>(inputs.spec?.value, "StillPictureSourceSpec"),
          valueOf<BlobRef>(inputs.artifact?.value, "Still Picture artifact"),
          valueOf<PictureInterpretation>(inputs.picture?.value, "PictureInterpretation"),
        )),
      }),
    },
    {
      producer: audiovisualMediaProducers.stillPictureSource,
      handler: ({ inputs }) => ({
        kind: "output",
        value: canonicalize(programSourceFromStillPicture(
          valueOf<StillPictureSource>(inputs.picture?.value, "StillPictureSource"),
        )),
      }),
    },
  ],
  refinements: [
    {
      type: audiovisualMediaTypes.stillPictureSpec,
      handler: ({ value }) => assertStillPictureSourceSpec(
        valueOf<StillPictureSourceSpec>(value, "StillPictureSourceSpec"),
      ),
    },
    {
      type: audiovisualMediaTypes.stillPicture,
      handler: ({ value }) => { sealStillPictureSource(
        valueOf<StillPictureSource>(value, "StillPictureSource"),
      ); },
    },
  ],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
