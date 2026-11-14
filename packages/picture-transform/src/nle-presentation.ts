import type { NleTimelineAdjustmentPresentation } from "@hypit/nle-view";

import { pictureTransformNleSymbol } from "./nle.js";

export const pictureTransformNlePresentation: NleTimelineAdjustmentPresentation = {
  operator: pictureTransformNleSymbol,
  displayName: "Transform",
  tone: "violet",
  chrome: "compact",
  heightPx: 32,
};
