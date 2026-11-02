import { captionCueText } from "./text-declaration.js";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { TemporalWindow } from "@hypit/temporal";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Value } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Timeline } from "@hypit/timeline";
import { createAbsoluteCaptionTiming, type CaptionTimingSpec } from "./absolute-timing.js";

import { captionProducers, captionTypes } from "./manifest.js";
import { appendCaptionUse, assertCaptionProgram, assertCaptionStyle } from "./style.js";
import { assertCaptionDocumentIdentity } from "./identity.js";
import { assertCaptionTiming } from "./temporalize.js";
import type { CaptionDocument, CaptionProgram, CaptionStyleIntent, CaptionTiming } from "./types.js";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value as T;
}

export const captionComponent = {
  producers: [{
    producer: captionProducers.cueText,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(captionCueText(valueOf<CaptionDocument>(inputs.document?.value, "CaptionDocument"), valueOf<{ cueId: string }>(inputs.cue?.value, "CaptionCueSelection").cueId)) }),
  }, {
    producer: captionProducers.resolveTiming,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(createAbsoluteCaptionTiming(
      valueOf<CaptionDocument>(inputs.document?.value, "CaptionDocument"),
      valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      valueOf<CaptionTimingSpec>(inputs.spec?.value, "CaptionTimingSpec"),
    )) }),
  }, {
    producer: captionProducers.create,
    handler: ({ inputs }) => ({ kind: "output", value: (canonicalize({
      id: valueOf<{id:string}>(inputs.header?.value, "CaptionTrackSpec").id,
      documentId: valueOf<CaptionDocument>(inputs.document?.value, "CaptionDocument").id,
      styles: [], uses: [],
    })) }),
  }, {
    producer: captionProducers.append,
    handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(appendCaptionUse(
      valueOf<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
      valueOf<{id:string}>(inputs.filter?.value, "CaptionContentFilter").id,
      valueOf<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
      valueOf<CaptionStyleIntent>(inputs.style?.value, "CaptionStyle"),
      valueOf<{id:string;role?:string}>(inputs.filter?.value, "CaptionContentFilter").role,
    ))) }),
  }, {
    producer: captionProducers.appendUnbounded,
    handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(appendCaptionUse(
      valueOf<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
      valueOf<{id:string}>(inputs.filter?.value, "CaptionContentFilter").id,
      undefined,
      valueOf<CaptionStyleIntent>(inputs.style?.value, "CaptionStyle"),
      valueOf<{id:string;role?:string}>(inputs.filter?.value, "CaptionContentFilter").role,
    ))) }),
  }],
  refinements: [
    { type: captionTypes.document, handler: ({ value }) => assertCaptionDocumentIdentity(valueOf<CaptionDocument>(value, "CaptionDocument")) },
    { type: captionTypes.style, handler: ({ value }) => {
      if (value === undefined) throw new Error("CaptionStyle is missing");
      const style = value as CaptionStyleIntent;
      assertCaptionStyle(style);
    } },
    { type: captionTypes.program, handler: ({ value }) => assertCaptionProgram(valueOf<CaptionProgram>(value, "CaptionProgram")) },
    { type: captionTypes.timing, handler: ({ value }) => assertCaptionTiming(valueOf<CaptionTiming>(value, "CaptionTiming")) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
