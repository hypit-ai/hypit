import { assertCaptionNleComponentParameters } from "@hypit/caption-nle";
import type { NleTimelineComponentPresentation } from "@hypit/nle-view";

import { captionFineNleComponentSymbol } from "./nle-package.js";

export const captionFineNlePresentation: NleTimelineComponentPresentation = {
  component: captionFineNleComponentSymbol,
  displayName: "Caption",
  tone: "magenta",
  chrome: "standard",
  heightPx: 36,
  project: ({ item }) => {
    assertCaptionNleComponentParameters(item.parameters, item.duration);
    const text = item.parameters.caption.words
      .map((word) => `${word.separatorBefore}${word.text}`).join("");
    return {
      title: "Caption",
      layers: text.length === 0 ? [] : [{ kind: "text", role: "content", text }],
    };
  },
};
