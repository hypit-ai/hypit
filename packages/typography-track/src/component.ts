import type { ComponentPackage } from "@hypit/component-kit";
import type { ProgramSpace } from "@hypit/program-space";
import type { CompositableSurfaceRef } from "@hypit/media";
import type { SpatialFrame, SpatialPath, SpatialPoint } from "@hypit/spatial";
import type { StoredValue } from "@hypit/protocol";
import type { Text } from "@hypit/text";
import { canonicalize } from "@hypit/protocol";

import { typographyTrackProducers } from "./manifest.js";
import { appendProjectedTextItem, bindAreaTextPlacement, bindPathTextPlacement, bindPointTextPlacement, createTypographyTrackSet, finalizeTypographyTrack, renderTypographyTrack, renderTextMaskTrack, materializePlainTextItem } from "./program.js";
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
import type { TemporalWindow } from "@hypit/temporal";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline.`);
  return value.value as unknown as T;
}

const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

export const typographyTrackComponent = {
  producers: [
    {
      producer: typographyTrackProducers.materializePlainItem,
      handler: ({ inputs }) => ({ outputs: { spec: output(materializePlainTextItem(
        inline<PlainTextItemSpec>(inputs.spec?.value, "PlainTextItemSpec"),
        inline<Text>(inputs.content?.value, "Text"),
      )) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.bindPoint,
      handler: ({ inputs }) => ({ outputs: { placement: output(bindPointTextPlacement(inline<SpatialPoint>(inputs.point?.value, "SpatialPoint"))) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.bindArea,
      handler: ({ inputs }) => ({ outputs: { placement: output(bindAreaTextPlacement(inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"))) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.bindPath,
      handler: ({ inputs }) => ({ outputs: { placement: output(bindPathTextPlacement(inline<SpatialPath>(inputs.path?.value, "SpatialPath"))) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.createSet,
      handler: () => ({ outputs: { set: output(createTypographyTrackSet()) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.appendItem,
      handler: ({ inputs }) => ({ outputs: { set: output(appendProjectedTextItem(
        inline<TypographyTrackSet>(inputs.set?.value, "TypographyTrackSet"),
        inline<TypographyTrackHeader>(inputs.header?.value, "TypographyTrackHeader"),
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TextPlacement>(inputs.placement?.value, "TextPlacement"),
        inline<TextItemSpec>(inputs.spec?.value, "TextItemSpec"),
        inline<TextStyle>(inputs.style?.value, "TextStyle"),
        inline<TextMotion>(inputs.motion?.value, "TextMotion"),
        inline<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
      )) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.finalize,
      handler: ({ inputs }) => ({ outputs: { program: output(finalizeTypographyTrack(
        inline<TypographyTrackHeader>(inputs.header?.value, "TypographyTrackHeader"),
        inline<TypographyTrackSet>(inputs.set?.value, "TypographyTrackSet"),
      )) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.render,
      handler: ({ inputs }) => ({ outputs: { track: output(renderTypographyTrack(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TypographyTrackProgram>(inputs.program?.value, "TypographyTrackProgram"),
      )) }, needs: {} }),
    },
    {
      producer: typographyTrackProducers.renderMask,
      handler: ({ inputs }) => ({ outputs: { track: output(renderTextMaskTrack(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TypographyTrackProgram>(inputs.program?.value, "TypographyTrackProgram"),
        inline<CompositableSurfaceRef>(inputs.material?.value, "CompositableSurfaceRef"),
        inline<TextMaskSpec>(inputs.spec?.value, "TextMaskSpec"),
      )) }, needs: {} }),
    },
  ],
} satisfies ComponentPackage;
