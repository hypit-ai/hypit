import type { ComponentPackage } from "@narratage/component-kit";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { CompositableSurfaceRef } from "@narratage/media";
import type { SpatialFrame, SpatialPath, SpatialPoint } from "@narratage/spatial";
import type { StoredValue } from "@narratage/protocol";
import type { Text } from "@narratage/text";
import { canonicalize } from "@narratage/protocol";

import { typographyTrackProducers } from "./manifest.js";
import { typographyRecipeFacet } from "./recipe-facet.js";
import {
  appendMomentTextItem,
  appendProgramTextItem,
  appendSelectionTextItem,
  bindAreaTextPlacement,
  bindAreaTextPlacementImplementationDigest,
  bindPathTextPlacement,
  bindPathTextPlacementImplementationDigest,
  bindPointTextPlacement,
  bindPointTextPlacementImplementationDigest,
  createTypographyTrackSet,
  createTypographyTrackSetImplementationDigest,
  finalizeTypographyTrack,
  finalizeTypographyTrackImplementationDigest,
  renderTypographyTrack,
  renderTypographyTrackImplementationDigest,
  renderTextMaskTrack,
  renderTextMaskTrackImplementationDigest,
  appendMomentTextItemImplementationDigest,
  appendProgramTextItemImplementationDigest,
  appendSelectionTextItemImplementationDigest,
  materializePlainTextItem,
  materializePlainTextItemImplementationDigest,
} from "./program.js";
import type {
  TextItemSpec,
  PlainTextItemSpec,
  TextPlacement,
  TextMotion,
  TextMaskSpec,
  TextStyle,
  TypographyTrackHeader,
  TypographyTrackProgram,
  TypographyTrackSet,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline.`);
  return value.value as unknown as T;
}

const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

export const typographyTrackComponent = {
  name: "@narratage/typography-track",
  producers: [
    {
      producer: typographyTrackProducers.materializePlainItem,
      implementationDigest: materializePlainTextItemImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { spec: output(materializePlainTextItem(
        inline<PlainTextItemSpec>(inputs.spec?.value, "PlainTextItemSpec"),
        inline<Text>(inputs.content?.value, "Text"),
      )) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.bindPoint,
      implementationDigest: bindPointTextPlacementImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { placement: output(bindPointTextPlacement(inline<SpatialPoint>(inputs.point?.value, "SpatialPoint"))) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.bindArea,
      implementationDigest: bindAreaTextPlacementImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { placement: output(bindAreaTextPlacement(inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"))) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.bindPath,
      implementationDigest: bindPathTextPlacementImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { placement: output(bindPathTextPlacement(inline<SpatialPath>(inputs.path?.value, "SpatialPath"))) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.createSet,
      implementationDigest: createTypographyTrackSetImplementationDigest,
      handler: () => ({ outputs: { set: output(createTypographyTrackSet()) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.appendProgram,
      implementationDigest: appendProgramTextItemImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { set: output(appendProgramTextItem(
        inline<TypographyTrackSet>(inputs.set?.value, "TypographyTrackSet"),
        inline<TypographyTrackHeader>(inputs.header?.value, "TypographyTrackHeader"),
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TextPlacement>(inputs.placement?.value, "TextPlacement"),
        inline<TextItemSpec>(inputs.spec?.value, "TextItemSpec"),
        inline<TextStyle>(inputs.style?.value, "TextStyle"),
        inline<TextMotion>(inputs.motion?.value, "TextMotion"),
      )) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.appendSelection,
      implementationDigest: appendSelectionTextItemImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { set: output(appendSelectionTextItem(
        inline<TypographyTrackSet>(inputs.set?.value, "TypographyTrackSet"),
        inline<TypographyTrackHeader>(inputs.header?.value, "TypographyTrackHeader"),
        inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelection"),
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TextPlacement>(inputs.placement?.value, "TextPlacement"),
        inline<TextItemSpec>(inputs.spec?.value, "TextItemSpec"),
        inline<TextStyle>(inputs.style?.value, "TextStyle"),
        inline<TextMotion>(inputs.motion?.value, "TextMotion"),
      )) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.appendMoment,
      implementationDigest: appendMomentTextItemImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { set: output(appendMomentTextItem(
        inline<TypographyTrackSet>(inputs.set?.value, "TypographyTrackSet"),
        inline<TypographyTrackHeader>(inputs.header?.value, "TypographyTrackHeader"),
        inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMoment"),
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TextPlacement>(inputs.placement?.value, "TextPlacement"),
        inline<TextItemSpec>(inputs.spec?.value, "TextItemSpec"),
        inline<TextStyle>(inputs.style?.value, "TextStyle"),
        inline<TextMotion>(inputs.motion?.value, "TextMotion"),
      )) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.finalize,
      implementationDigest: finalizeTypographyTrackImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { program: output(finalizeTypographyTrack(
        inline<TypographyTrackHeader>(inputs.header?.value, "TypographyTrackHeader"),
        inline<TypographyTrackSet>(inputs.set?.value, "TypographyTrackSet"),
      )) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.render,
      implementationDigest: renderTypographyTrackImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { track: output(renderTypographyTrack(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TypographyTrackProgram>(inputs.program?.value, "TypographyTrackProgram"),
      )) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.renderMask,
      implementationDigest: renderTextMaskTrackImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { track: output(renderTextMaskTrack(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TypographyTrackProgram>(inputs.program?.value, "TypographyTrackProgram"),
        inline<CompositableSurfaceRef>(inputs.material?.value, "CompositableSurfaceRef"),
        inline<TextMaskSpec>(inputs.spec?.value, "TextMaskSpec"),
      )) }, needs: {} }),
    },
  ],
  recipes: [typographyRecipeFacet],
} satisfies ComponentPackage;
