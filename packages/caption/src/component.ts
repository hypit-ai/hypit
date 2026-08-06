import type { ComponentPackage } from "@svml/component-kit";
import type {
  CompleteSemanticMap,
  Narrative,
} from "@svml/contracts";
import type { StoredValue } from "@svml/protocol";
import { canonicalize } from "@svml/protocol";

import {
  captionImplementationDigest,
  captionProducers,
  captionTypes,
  captionValidatorDigests,
} from "./manifest.js";
import { temporalizeCaption } from "./temporalize.js";
import {
  assertCaptionTrackProgram,
  assertTimedCaptionProjection,
  renderCaptionTrack,
  renderCaptionTrackImplementationDigest,
} from "./track.js";
import type {
  CaptionTrackProgram,
  TimedCaptionProjection,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as T;
}

/** Deterministic timing and VisualTrack lowering only; cue generation and author styling stay outside. */
export const captionComponent = {
  name: "@svml/caption",
  producers: [
    {
      producer: captionProducers.temporalize,
      implementationDigest: captionImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: {
          caption: {
            kind: "inline",
            value: canonicalize(temporalizeCaption(
              inline<Narrative>(inputs.narrative?.value, "Narrative"),
              inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
            )),
          },
        },
        needs: {},
      }),
    },
    {
      producer: captionProducers.renderTrack,
      implementationDigest: renderCaptionTrackImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: {
          track: {
            kind: "inline",
            value: canonicalize(renderCaptionTrack(
              inline<TimedCaptionProjection>(inputs.caption?.value, "TimedCaptionProjection"),
              inline<CaptionTrackProgram>(inputs.program?.value, "CaptionTrackProgram"),
            )),
          },
        },
        needs: {},
      }),
    },
  ],
  validators: [
    {
      type: captionTypes.timedProjection,
      implementationDigest: captionValidatorDigests.timedProjection,
      handler: ({ value }) => assertTimedCaptionProjection(
        inline<TimedCaptionProjection>(value, "TimedCaptionProjection"),
      ),
    },
    {
      type: captionTypes.trackProgram,
      implementationDigest: captionValidatorDigests.trackProgram,
      handler: ({ value }) => assertCaptionTrackProgram(
        inline<CaptionTrackProgram>(value, "CaptionTrackProgram"),
      ),
    },
  ],
} satisfies ComponentPackage;
