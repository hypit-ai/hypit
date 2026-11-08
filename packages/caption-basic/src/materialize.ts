import type { NleProject, NleTransaction } from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import {
  createCaptionNleMaterialization as materializeCaption,
  createCaptionNleMaterializationForMediaItem as materializeCaptionForMediaItem,
  type CaptionNleFamily,
  type CaptionNleMaterializationInput as SharedCaptionNleMaterializationInput,
  type CaptionPresentation,
} from "@hypit/caption-nle";

import { captionBasicNleComponentSymbol } from "./nle-package.js";
import type { CaptionStyle } from "./types.js";

const captionBasicFamily: CaptionNleFamily<"basic"> = {
  family: "basic",
  component: captionBasicNleComponentSymbol,
  parameters: (caption, style) => canonicalize({
    caption,
    styleId: style.id,
    family: style.family,
    style: style.parameters,
  }),
};

export type CaptionNleMaterializationInput =
  Omit<SharedCaptionNleMaterializationInput<"basic">, "family" | "presentation"> & {
    readonly presentation: CaptionPresentation<"basic"> | CaptionStyle;
  };

/** Bake source-local Caption timing into independent, directly editable Basic Caption Items. */
export function createCaptionNleMaterialization(
  project: NleProject,
  input: CaptionNleMaterializationInput & { readonly at: ExactTemporalValue },
): NleTransaction {
  return materializeCaption(project, { ...input, family: captionBasicFamily });
}

/** Resolve Basic Caption Cues through one selected Media Item, then persist direct Programme times. */
export function createCaptionNleMaterializationForMediaItem(
  project: NleProject,
  input: CaptionNleMaterializationInput & { readonly mediaItem: string },
): NleTransaction {
  return materializeCaptionForMediaItem(project, { ...input, family: captionBasicFamily });
}
