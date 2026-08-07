import type { ComponentPackage } from "@narratage/component-kit";
import type {
  CompleteSemanticMap,
  Narrative,
  ProgramSpace,
} from "@narratage/video-contracts";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import {
  captionImplementationDigest,
  captionPlanImplementationDigest,
  captionProducers,
  captionTypes,
  captionValidatorDigests,
} from "./manifest.js";
import { assertCaptionPlan } from "./plan.js";
import { assertCaptionProgram, assertCaptionStyle } from "./style.js";
import { temporalizeCaption, temporalizeCaptionPlan } from "./temporalize.js";
import {
  assertCaptionTrackProgram,
  assertTimedCaptionProjection,
  renderCaptionProgram,
  renderCaptionTrack,
  renderCaptionProgramImplementationDigest,
  renderCaptionTrackImplementationDigest,
} from "./track.js";
import type {
  CaptionPlan,
  CaptionProgram,
  CaptionStyleIntent,
  CaptionTrackProgram,
  TimedCaptionProjection,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as T;
}

/** Deterministic timing and VisualTrack lowering only; cue generation and author styling stay outside. */
export const captionComponent = {
  name: "@narratage/caption",
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
      producer: captionProducers.temporalizePlan,
      implementationDigest: captionPlanImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: {
          caption: {
            kind: "inline",
            value: canonicalize(temporalizeCaptionPlan(
              inline<Narrative>(inputs.narrative?.value, "Narrative"),
              inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
              inline<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
              inline<CaptionPlan>(inputs.plan?.value, "CaptionPlan"),
            )),
          },
        },
        needs: {},
      }),
    },
    {
      producer: captionProducers.renderProgram,
      implementationDigest: renderCaptionProgramImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: {
          track: {
            kind: "inline",
            value: canonicalize(renderCaptionProgram(
              inline<TimedCaptionProjection>(inputs.caption?.value, "TimedCaptionProjection"),
              inline<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
              inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
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
              inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
            )),
          },
        },
        needs: {},
      }),
    },
  ],
  validators: [
    {
      type: captionTypes.style,
      implementationDigest: captionValidatorDigests.style,
      handler: ({ value }) => assertCaptionStyle(inline<CaptionStyleIntent>(value, "CaptionStyle")),
    },
    {
      type: captionTypes.program,
      implementationDigest: captionValidatorDigests.program,
      handler: ({ value }) => assertCaptionProgram(inline<CaptionProgram>(value, "CaptionProgram")),
    },
    {
      type: captionTypes.plan,
      implementationDigest: captionValidatorDigests.plan,
      handler: ({ value }) => assertCaptionPlan(inline(value, "CaptionPlan")),
    },
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
