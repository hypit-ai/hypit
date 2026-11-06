import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";

import { captionProducers, captionTypes } from "./manifest.js";
import { captionHtmlSource } from "./picture.js";
import {
  appendCaptionHiddenOverride,
  appendCaptionStyleOverride,
  assertCaptionComponentSpec,
  assertCaptionDocument,
  assertCaptionPresentation,
  assertCaptionPresentationOverrideSpec,
  assertCaptionPresentationSchedule,
  assertCaptionSelection,
  assertCaptionStyle,
  assertCaptionUnitEventSpec,
  assertLocalCaptionTiming,
  captionProgramSource,
  captionUnitEvent,
  createCaptionPresentation,
  scheduleCaptionPresentation,
} from "./source.js";
import type {
  CaptionComponentSpec,
  CaptionDocument,
  CaptionPresentation,
  CaptionPresentationOverrideSpec,
  CaptionPresentationSchedule,
  CaptionSelection,
  CaptionStyle,
  CaptionUnitEventSpec,
  LocalCaptionTiming,
} from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const captionComponent = {
  refinements: [
    { type: captionTypes.document, handler: ({ value }) =>
      assertCaptionDocument(valueOf<CaptionDocument>(value, "CaptionDocument")) },
    { type: captionTypes.timing, handler: ({ value }) =>
      assertLocalCaptionTiming(valueOf<LocalCaptionTiming>(value, "LocalCaptionTiming")) },
    { type: captionTypes.selection, handler: ({ value }) =>
      assertCaptionSelection(valueOf<CaptionSelection>(value, "CaptionSelection")) },
    { type: captionTypes.style, handler: ({ value }) =>
      assertCaptionStyle(valueOf<CaptionStyle>(value, "CaptionStyle")) },
    { type: captionTypes.presentationOverrideSpec, handler: ({ value }) =>
      assertCaptionPresentationOverrideSpec(valueOf<CaptionPresentationOverrideSpec>(value,
        "CaptionPresentationOverrideSpec")) },
    { type: captionTypes.presentation, handler: ({ value }) =>
      assertCaptionPresentation(valueOf<CaptionPresentation>(value, "CaptionPresentation")) },
    { type: captionTypes.schedule, handler: ({ value }) =>
      assertCaptionPresentationSchedule(valueOf<CaptionPresentationSchedule>(value,
        "CaptionPresentationSchedule")) },
    { type: captionTypes.componentSpec, handler: ({ value }) =>
      assertCaptionComponentSpec(valueOf<CaptionComponentSpec>(value, "CaptionComponentSpec")) },
    { type: captionTypes.unitEventSpec, handler: ({ value }) =>
      assertCaptionUnitEventSpec(valueOf<CaptionUnitEventSpec>(value, "CaptionUnitEventSpec")) },
  ],
  producers: [{
    producer: captionProducers.createPresentation,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(createCaptionPresentation(
      valueOf<CaptionStyle>(inputs.style?.value, "CaptionStyle"),
    )) }),
  }, {
    producer: captionProducers.appendStyleOverride,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(appendCaptionStyleOverride(
      valueOf<CaptionPresentation>(inputs.presentation?.value, "CaptionPresentation"),
      valueOf<CaptionPresentationOverrideSpec>(inputs.spec?.value, "CaptionPresentationOverrideSpec"),
      valueOf<CaptionStyle>(inputs.style?.value, "CaptionStyle"),
    )) }),
  }, {
    producer: captionProducers.appendHiddenOverride,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(appendCaptionHiddenOverride(
      valueOf<CaptionPresentation>(inputs.presentation?.value, "CaptionPresentation"),
      valueOf<CaptionPresentationOverrideSpec>(inputs.spec?.value, "CaptionPresentationOverrideSpec"),
    )) }),
  }, {
    producer: captionProducers.schedule,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(scheduleCaptionPresentation(
      valueOf<CaptionComponentSpec>(inputs.spec?.value, "CaptionComponentSpec"),
      valueOf<CaptionDocument>(inputs.document?.value, "CaptionDocument"),
      valueOf<LocalCaptionTiming>(inputs.timing?.value, "LocalCaptionTiming"),
      valueOf<CaptionPresentation>(inputs.presentation?.value, "CaptionPresentation"),
    )) }),
  }, {
    producer: captionProducers.source,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(captionProgramSource(
      valueOf<CaptionComponentSpec>(inputs.spec?.value, "CaptionComponentSpec"),
      valueOf<CaptionDocument>(inputs.document?.value, "CaptionDocument"),
      valueOf<LocalCaptionTiming>(inputs.timing?.value, "LocalCaptionTiming"),
      valueOf<CaptionPresentation>(inputs.presentation?.value, "CaptionPresentation"),
    )) }),
  }, {
    producer: captionProducers.unitEvent,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(captionUnitEvent(
      valueOf<LocalCaptionTiming>(inputs.timing?.value, "LocalCaptionTiming"),
      valueOf<CaptionUnitEventSpec>(inputs.spec?.value, "CaptionUnitEventSpec"),
    )) }),
  }, {
    producer: captionProducers.htmlSource,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(captionHtmlSource(
      valueOf<CaptionComponentSpec>(inputs.spec?.value, "CaptionComponentSpec"),
      valueOf<CaptionDocument>(inputs.document?.value, "CaptionDocument"),
      valueOf<LocalCaptionTiming>(inputs.timing?.value, "LocalCaptionTiming"),
      valueOf<CaptionPresentation>(inputs.presentation?.value, "CaptionPresentation"),
    )) }),
  }],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
