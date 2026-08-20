import { semanticTrackTypes } from "@hypit/semantic-track";
import { compositionTypes } from "@hypit/composition";
import type { Composition } from "@hypit/composition";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  MarkupAttributeValue,
} from "@hypit/markup";

import { renderHyperframesFragment } from "./fragment.js";

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
  if (names.join(",") !== "composition,id,semantic") throw new Error(`${element.name} requires exactly composition, id and semantic`);
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
  const semanticPath = referenceAttribute(element, "semantic");
  const semantic = resolveReference(semanticPath);
  if (semantic === undefined
    || semantic.type.module.name !== semanticTrackTypes.track.module.name
    || semantic.type.module.version !== semanticTrackTypes.track.module.version
    || semantic.type.name !== semanticTrackTypes.track.name) {
    throw new Error(`${element.name}.semantic must reference SemanticTrack`);
  }
  return {
    records: [],
    components: [{
      id,
      fragment: renderHyperframesFragment.id,
      inputs: { composition: composition.ref, semantic: semantic.ref },
      outputs: { video: `${id}.video` },
      range: element.range,
    }],
    fragments: [renderHyperframesFragment],
  };
};
