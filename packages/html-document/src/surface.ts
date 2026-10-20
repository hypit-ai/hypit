import { compositionTypes } from "@hypit/composition";
import { resolveTemporalContext } from "@hypit/temporal/markup";
import { sameType } from "@hypit/hypit/protocol";
import type { StructuredSurfaceHandler } from "@hypit/hypit/markup";
import { htmlDocumentFragment } from "./fragment.js";

export const decodeHtmlDocumentSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  if (Object.keys(element.attributes).some((name) => !["id", "composition", "timeline"].includes(name))) {
    throw new Error(`${element.name} contains unsupported attributes`);
  }
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty`);
  }
  const id = element.attributes.id;
  if (typeof id !== "string" || id.length === 0) throw new Error(`${element.name}.id is required`);
  const reference = element.attributes.composition;
  if (typeof reference !== "object" || reference.kind !== "reference") {
    throw new Error(`${element.name}.composition must be a reference`);
  }
  const composition = resolveReference(reference.path);
  if (composition === undefined || !sameType(composition.type, compositionTypes.composition)) {
    throw new Error(`${element.name}.composition must reference Composition`);
  }
  const context = resolveTemporalContext({ element, resolveReference });
  return {
    records: [],
    components: [{
      id,
      fragment: htmlDocumentFragment,
      inputs: { composition: composition.ref, timeline: context.timeline.ref },
      outputs: { document: `${id}.document` },
      range: element.range,
    }],
  };
};
