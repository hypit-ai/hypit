import type { HtmlTextNode } from "@hypit/html-program";
import type { NleTimelineComponentPresentation } from "@hypit/nle-view";

import { assertTextFineNleParameters, textFineNleComponentSymbol } from "./nle-package.js";

function plainText(nodes: readonly HtmlTextNode[]): string {
  return nodes.map((node) => {
    if (node.kind === "text") return node.text;
    if (node.kind === "break") return "\n";
    return plainText(node.children);
  }).join("");
}

export const textFineNlePresentation: NleTimelineComponentPresentation = {
  component: textFineNleComponentSymbol,
  displayName: "Text",
  tone: "teal",
  chrome: "standard",
  heightPx: 48,
  project: ({ item }) => {
    assertTextFineNleParameters(item.parameters);
    const text = plainText(item.parameters.children).trim();
    return {
      title: "Text",
      layers: text.length === 0 ? [] : [{ kind: "text", role: "content", text }],
    };
  },
};
