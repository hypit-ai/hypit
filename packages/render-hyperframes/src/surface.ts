import { createTemporalSpace, resolveTemporalContext } from "@hypit/temporal-markup";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes, verifyMediaFrameRange } from "@hypit/media";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  MarkupAttributeValue,
} from "@hypit/markup";

import { createRenderHyperframesFragment } from "./fragment.js";

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

export const decodeHyperframesRenderSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const names = Object.keys(element.attributes).sort();
  if (names.some((name) => !["composition", "id", "semantic", "space", "start-frame", "end-frame-exclusive"].includes(name))) {
    throw new Error(`${element.name} contains unsupported attributes`);
  }
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} does not accept children`);
  }
  const id = stringAttribute(element, "id");
  const path = referenceAttribute(element, "composition");
  const composition = resolveReference(path);
  if (composition === undefined
    || composition.type.module.name !== compositionTypes.composition.module.name
    || composition.type.module.version !== compositionTypes.composition.module.version
    || composition.type.name !== compositionTypes.composition.name) {
    throw new Error(`${element.name}.composition must reference Composition`);
  }
  const time = createTemporalSpace({ id, element, ...resolveTemporalContext({ element, resolveReference }) });
  const selected = element.attributes["start-frame"] !== undefined || element.attributes["end-frame-exclusive"] !== undefined;
  const frame = (name: string): number => {
    const text = stringAttribute(element, name);
    if (!/^\d+$/u.test(text)) throw new Error(`${element.name}.${name} must be a non-negative integer`);
    return Number(text);
  };
  const range = selected ? { startFrame: frame("start-frame"), endFrameExclusive: frame("end-frame-exclusive") } : undefined;
  if (range !== undefined) verifyMediaFrameRange(range);
  const fragment = createRenderHyperframesFragment(selected);
  const rangeId = `${id}.frame-range`;
  return {
    records: range === undefined ? [] : [{ id: rangeId, type: mediaTypes.frameRange, value: { kind: "inline", value: range }, range: element.range }],
    components: [...time.components, {
      id,
      fragment: fragment.id,
      inputs: { composition: composition.ref, space: time.space.ref, ...(selected ? { range: { kind: "record" as const, id: rangeId } } : {}) },
      outputs: { video: `${id}.video` },
      range: element.range,
    }],
    fragments: [...time.fragments, fragment],
  };
};
