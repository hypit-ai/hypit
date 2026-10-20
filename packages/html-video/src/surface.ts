import { resolveTemporalContext } from "@hypit/temporal/markup";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes, verifyMediaFrameRange } from "@hypit/media";
import { sameType } from "@hypit/hypit/protocol";
import type { StructuredElement, StructuredSurfaceHandler, MarkupAttributeValue } from "@hypit/hypit/markup";

import { createHtmlVideoFragment } from "./fragment.js";

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${element.name}.${name} must be a string`);
  return value;
}

function referenceAttribute(element: StructuredElement, name: string): string {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference") {
    throw new Error(`${element.name}.${name} must be a reference`);
  }
  return value.path;
}

export const decodeHtmlVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const names = Object.keys(element.attributes).sort();
  if (names.some((name) => !["composition", "id", "timeline", "start-frame", "end-frame-exclusive"].includes(name))) {
    throw new Error(`${element.name} contains unsupported attributes`);
  }
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} does not accept children`);
  }
  const id = stringAttribute(element, "id");
  const path = referenceAttribute(element, "composition");
  const composition = resolveReference(path);
  if (composition === undefined || !sameType(composition.type, compositionTypes.composition)) {
    throw new Error(`${element.name}.composition must reference Composition`);
  }
  const context = resolveTemporalContext({ element, resolveReference });
  const selected = element.attributes["start-frame"] !== undefined || element.attributes["end-frame-exclusive"] !== undefined;
  const frame = (name: string): number => {
    const text = stringAttribute(element, name);
    if (!/^\d+$/u.test(text)) throw new Error(`${element.name}.${name} must be a non-negative integer`);
    return Number(text);
  };
  const range = selected ? { startFrame: frame("start-frame"), endFrameExclusive: frame("end-frame-exclusive") } : undefined;
  if (range !== undefined) verifyMediaFrameRange(range);
  const fragment = createHtmlVideoFragment(selected);
  const rangeId = `${id}.frame-range`;
  return {
    records: range === undefined ? [] : [{ id: rangeId, type: mediaTypes.frameRange, value: (range), range: element.range }],
    components: [{
      id,
      fragment,
      inputs: { composition: composition.ref, timeline: context.timeline.ref, ...(selected ? { range: { kind: "record" as const, id: rangeId } } : {}) },
      outputs: { video: `${id}.video` },
      range: element.range,
    }],
  };
};
