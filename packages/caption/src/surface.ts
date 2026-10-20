import type { StructuredSurfaceHandler } from "@hypit/hypit/markup";
import { assertAttributes, assertEmptyElement, textAttribute } from "@hypit/hypit/markup";
import { captionTypes } from "./manifest.js";
import { sealCaptionStyle } from "./style.js";

export const decodeHiddenCaptionStyleSurface: StructuredSurfaceHandler = ({ element }) => {
  assertAttributes(element, ["id"]);
  assertEmptyElement(element);
  const id = textAttribute(element, "id");
  if (element.children.some(child => child.kind !== "text" || child.value.trim())) {
    throw new Error(`${element.name} accepts no children`);
  }
  return { records: [{ id, type: captionTypes.style,
    value: (sealCaptionStyle({ id, rendering: null })), range: element.range }],
    components: [] };
};
