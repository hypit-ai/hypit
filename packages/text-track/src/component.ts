import type { ComponentPackage } from "@narratage/component-kit";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { CompositableSurfaceRef } from "@narratage/media";
import type { SpatialFrame, SpatialPath, SpatialPoint } from "@narratage/spatial";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import { textTrackProducers } from "./manifest.js";
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
  createTextTrackSet,
  createTextTrackSetImplementationDigest,
  finalizeTextTrack,
  finalizeTextTrackImplementationDigest,
  renderTextTrack,
  renderTextTrackImplementationDigest,
  renderTextMaskTrack,
  renderTextMaskTrackImplementationDigest,
  appendMomentTextItemImplementationDigest,
  appendProgramTextItemImplementationDigest,
  appendSelectionTextItemImplementationDigest,
} from "./program.js";
import type {
  TextItemSpec,
  TextPlacement,
  TextMotion,
  TextMaskSpec,
  TextStyle,
  TextTrackHeader,
  TextTrackProgram,
  TextTrackSet,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline.`);
  return value.value as unknown as T;
}

const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

export const textTrackComponent = {
  name: "@narratage/text-track",
  producers: [
    {
      producer: textTrackProducers.bindPoint,
      implementationDigest: bindPointTextPlacementImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { placement: output(bindPointTextPlacement(inline<SpatialPoint>(inputs.point?.value, "SpatialPoint"))) }, needs: {} }),
    },
    {
      producer: textTrackProducers.bindArea,
      implementationDigest: bindAreaTextPlacementImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { placement: output(bindAreaTextPlacement(inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"))) }, needs: {} }),
    },
    {
      producer: textTrackProducers.bindPath,
      implementationDigest: bindPathTextPlacementImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { placement: output(bindPathTextPlacement(inline<SpatialPath>(inputs.path?.value, "SpatialPath"))) }, needs: {} }),
    },
    {
      producer: textTrackProducers.createSet,
      implementationDigest: createTextTrackSetImplementationDigest,
      handler: () => ({ outputs: { set: output(createTextTrackSet()) }, needs: {} }),
    },
    {
      producer: textTrackProducers.appendProgram,
      implementationDigest: appendProgramTextItemImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { set: output(appendProgramTextItem(
        inline<TextTrackSet>(inputs.set?.value, "TextTrackSet"),
        inline<TextTrackHeader>(inputs.header?.value, "TextTrackHeader"),
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TextPlacement>(inputs.placement?.value, "TextPlacement"),
        inline<TextItemSpec>(inputs.spec?.value, "TextItemSpec"),
        inline<TextStyle>(inputs.style?.value, "TextStyle"),
        inline<TextMotion>(inputs.motion?.value, "TextMotion"),
      )) }, needs: {} }),
    },
    {
      producer: textTrackProducers.appendSelection,
      implementationDigest: appendSelectionTextItemImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { set: output(appendSelectionTextItem(
        inline<TextTrackSet>(inputs.set?.value, "TextTrackSet"),
        inline<TextTrackHeader>(inputs.header?.value, "TextTrackHeader"),
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
      producer: textTrackProducers.appendMoment,
      implementationDigest: appendMomentTextItemImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { set: output(appendMomentTextItem(
        inline<TextTrackSet>(inputs.set?.value, "TextTrackSet"),
        inline<TextTrackHeader>(inputs.header?.value, "TextTrackHeader"),
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
      producer: textTrackProducers.finalize,
      implementationDigest: finalizeTextTrackImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { program: output(finalizeTextTrack(
        inline<TextTrackHeader>(inputs.header?.value, "TextTrackHeader"),
        inline<TextTrackSet>(inputs.set?.value, "TextTrackSet"),
      )) }, needs: {} }),
    },
    {
      producer: textTrackProducers.render,
      implementationDigest: renderTextTrackImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { track: output(renderTextTrack(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TextTrackProgram>(inputs.program?.value, "TextTrackProgram"),
      )) }, needs: {} }),
    },
    {
      producer: textTrackProducers.renderMask,
      implementationDigest: renderTextMaskTrackImplementationDigest,
      handler: ({ inputs }) => ({ outputs: { track: output(renderTextMaskTrack(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TextTrackProgram>(inputs.program?.value, "TextTrackProgram"),
        inline<CompositableSurfaceRef>(inputs.material?.value, "CompositableSurfaceRef"),
        inline<TextMaskSpec>(inputs.spec?.value, "TextMaskSpec"),
      )) }, needs: {} }),
    },
  ],
} satisfies ComponentPackage;
