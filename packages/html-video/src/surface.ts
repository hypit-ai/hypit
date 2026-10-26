import { resolveTemporalContext } from "@hypit/temporal/markup";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import { assertFrameSpan, timelineTypes } from "@hypit/timeline";
import { sameType } from "@hypit/hypit/protocol";
import type { StructuredElement, StructuredSurfaceHandler, MarkupAttributeValue, SurfaceRecordDraft, SurfaceResolvedReference } from "@hypit/hypit/markup";

import { createHtmlVideoFragment } from "./fragment.js";
import { htmlVideoDeliverySpec } from "./delivery.js";

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
  if (names.some((name) => !["composition", "delivery", "id", "quality", "timeline", "start-frame", "end-frame-exclusive"].includes(name))) {
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
  if (element.attributes.delivery !== undefined && element.attributes.quality !== undefined) {
    throw new Error(`${element.name} cannot combine delivery and quality`);
  }
  const deliveryAttribute = element.attributes.delivery;
  let delivery: SurfaceResolvedReference["ref"];
  const deliveryId = `${id}.delivery`;
  const records: SurfaceRecordDraft[] = [];
  if (deliveryAttribute !== undefined) {
    if (typeof deliveryAttribute !== "object" || deliveryAttribute.kind !== "reference") {
      throw new Error(`${element.name}.delivery must be a reference`);
    }
    const resolved = resolveReference(deliveryAttribute.path);
    if (resolved === undefined || !sameType(resolved.type, mediaTypes.delivery)) {
      throw new Error(`${element.name}.delivery must reference MediaDeliverySpec`);
    }
    delivery = resolved.ref;
  } else {
    const rawQuality = element.attributes.quality;
    if (rawQuality !== undefined && typeof rawQuality !== "string") {
      throw new Error(`${element.name}.quality must be text`);
    }
    const quality = rawQuality ?? "standard";
    if (quality !== "draft" && quality !== "standard" && quality !== "high") {
      throw new Error(`${element.name}.quality must be draft, standard or high`);
    }
    records.push({ id: deliveryId, type: mediaTypes.delivery,
      value: htmlVideoDeliverySpec(quality), range: element.range });
    delivery = { kind: "record", id: deliveryId };
  }
  const selected = element.attributes["start-frame"] !== undefined || element.attributes["end-frame-exclusive"] !== undefined;
  const frame = (name: string): number => {
    const text = stringAttribute(element, name);
    if (!/^\d+$/u.test(text)) throw new Error(`${element.name}.${name} must be a non-negative integer`);
    return Number(text);
  };
  const range = selected ? { startFrame: frame("start-frame"), endFrameExclusive: frame("end-frame-exclusive") } : undefined;
  if (range !== undefined) assertFrameSpan(range);
  const fragment = createHtmlVideoFragment(selected);
  const rangeId = `${id}.frame-range`;
  if (range !== undefined) records.push({ id: rangeId, type: timelineTypes.frameSpan, value: range, range: element.range });
  return {
    records,
    components: [{
      id,
      fragment,
      inputs: { composition: composition.ref, timeline: context.timeline.ref, delivery,
        ...(selected ? { range: { kind: "record" as const, id: rangeId } } : {}) },
      outputs: { video: `${id}.video` },
      range: element.range,
    }],
    exports: [`${id}.video`],
  };
};
