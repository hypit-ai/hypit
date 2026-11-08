import type { NleProject, NleTransaction } from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import {
  createCaptionNleMaterialization as materializeCaption,
  createCaptionNleMaterializationForMediaItem as materializeCaptionForMediaItem,
  type CaptionNleFamily,
  type CaptionNleMaterializationInput as SharedCaptionNleMaterializationInput,
} from "@hypit/caption-nle";

import { captionFineNleComponentSymbol } from "./nle-package.js";
import type { CaptionPresentation, CaptionStyle } from "./types.js";

const captionFineFamily: CaptionNleFamily<"fine"> = {
  family: "fine",
  component: captionFineNleComponentSymbol,
  parameters: (caption, style) => canonicalize({
    caption,
    styleId: style.id,
    family: style.family,
    style: style.parameters,
  }),
};

export type CaptionFineNleMaterializationInput =
  Omit<SharedCaptionNleMaterializationInput<"fine">, "family" | "presentation"> & {
    readonly presentation: CaptionPresentation | CaptionStyle;
  };

export function createCaptionFineNleMaterialization(
  project: NleProject,
  input: CaptionFineNleMaterializationInput & { readonly at: ExactTemporalValue },
): NleTransaction {
  return materializeCaption(project, { ...input, family: captionFineFamily });
}

export function createCaptionFineNleMaterializationForMediaItem(
  project: NleProject,
  input: CaptionFineNleMaterializationInput & { readonly mediaItem: string },
): NleTransaction {
  return materializeCaptionForMediaItem(project, { ...input, family: captionFineFamily });
}
