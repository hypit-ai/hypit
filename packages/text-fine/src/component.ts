import type { Timeline } from "@hypit/timeline";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Value } from "@hypit/hypit/protocol";
import type { CompositableSurfaceRef } from "@hypit/media";
import type { SpatialFrame, SpatialPath, SpatialPoint } from "@hypit/spatial";
import type { Text } from "@hypit/hypit/text";
import { canonicalize } from "@hypit/hypit/protocol";

import { textFineProducers } from "./manifest.js";
import { bindAreaTextPlacement, bindPathTextPlacement, bindPointTextPlacement, createFineTextOccurrence, renderFineTextMask, renderFineTextOccurrence, materializePlainTextItem } from "./program.js";
import type {
  FineTextOccurrence,
  TextItemSpec,
  PlainTextItemSpec,
  TextPlacement,
  TextFlowPlacementPolicy,
  TextMotion,
  TextPathMotion,
  TextPathPlacementPolicy,
  TextPointPlacementPolicy,
  TextMaskSpec,
  TextStyle,
} from "./types.js";
import type { TemporalWindow } from "@hypit/temporal";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing.`);
  return value as unknown as T;
}

const output = (value: unknown) => ((canonicalize(value)));

export const textFineComponent = {
  producers: [
    {
      producer: textFineProducers.materializePlainItem,
      handler: ({ inputs }) => ({ kind: "output", value: output(materializePlainTextItem(
        valueOf<PlainTextItemSpec>(inputs.spec?.value, "PlainTextItemSpec"),
        valueOf<Text>(inputs.content?.value, "Text"),
      )) }),
    },
    {
      producer: textFineProducers.bindPoint,
      handler: ({ inputs }) => ({ kind: "output", value: output(bindPointTextPlacement(
        valueOf<SpatialPoint>(inputs.point?.value, "SpatialPoint"),
        valueOf<TextPointPlacementPolicy>(inputs.policy?.value, "TextPointPlacementPolicy"),
      )) }),
    },
    {
      producer: textFineProducers.bindArea,
      handler: ({ inputs }) => ({ kind: "output", value: output(bindAreaTextPlacement(
        valueOf<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
        valueOf<TextFlowPlacementPolicy>(inputs.policy?.value, "TextFlowPlacementPolicy"),
      )) }),
    },
    {
      producer: textFineProducers.bindPath,
      handler: ({ inputs }) => ({ kind: "output", value: output(bindPathTextPlacement(
        valueOf<SpatialPath>(inputs.path?.value, "SpatialPath"),
        valueOf<TextPathPlacementPolicy>(inputs.policy?.value, "TextPathPlacementPolicy"),
        valueOf<TextPathMotion>(inputs.marginMotion?.value, "TextPathMotion"),
      )) }),
    },
    {
      producer: textFineProducers.createOccurrence,
      handler: ({ inputs }) => ({ kind: "output", value: output(createFineTextOccurrence(
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        valueOf<TextPlacement>(inputs.placement?.value, "TextPlacement"),
        valueOf<TextItemSpec>(inputs.spec?.value, "TextItemSpec"),
        valueOf<TextStyle>(inputs.style?.value, "TextStyle"),
        valueOf<TextMotion>(inputs.motion?.value, "TextMotion"),
        valueOf<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
      )) }),
    },
    {
      producer: textFineProducers.renderOccurrence,
      handler: ({ inputs }) => ({ kind: "output", value: output(renderFineTextOccurrence(
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        valueOf<FineTextOccurrence>(inputs.occurrence?.value, "FineTextOccurrence"),
      )) }),
    },
    {
      producer: textFineProducers.renderOccurrenceMask,
      handler: ({ inputs }) => ({ kind: "output", value: output(renderFineTextMask(
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        valueOf<FineTextOccurrence>(inputs.occurrence?.value, "FineTextOccurrence"),
        valueOf<CompositableSurfaceRef>(inputs.material?.value, "CompositableSurfaceRef"),
        valueOf<TextMaskSpec>(inputs.spec?.value, "TextMaskSpec"),
      )) }),
    },
  ],
} satisfies ProducerPackage & RefinementPackage;
