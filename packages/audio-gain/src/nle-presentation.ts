import type { NleTimelineAdjustmentPresentation } from "@hypit/nle-view";

import { audioGainNleSymbol } from "./nle.js";

export const audioGainNlePresentation: NleTimelineAdjustmentPresentation = {
  component: audioGainNleSymbol,
  displayName: "Gain",
  tone: "green",
  chrome: "compact",
  heightPx: 32,
};
