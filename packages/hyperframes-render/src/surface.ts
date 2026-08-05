import { contractTypes } from "@svml/contracts";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  TextAttributeValue,
} from "@svml/text";

import { hyperframesRenderFragment } from "./fragment.js";

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${element.name}.${name} must be a string`);
  return value;
}

function referenceAttribute(element: StructuredElement, name: string): string {
  const value: TextAttributeValue | undefined = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference") {
    throw new Error(`${element.name}.${name} must be a reference`);
  }
  return value.path;
}

export const decodeHyperframesRenderSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const names = Object.keys(element.attributes).sort();
  if (names.join(",") !== "composition,id") throw new Error(`${element.name} requires exactly composition and id`);
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} does not accept children`);
  }
  const id = stringAttribute(element, "id");
  const path = referenceAttribute(element, "composition");
  const composition = resolveReference(path);
  if (composition === undefined
    || composition.type.module.name !== contractTypes.composition.module.name
    || composition.type.module.version !== contractTypes.composition.module.version
    || composition.type.name !== contractTypes.composition.name) {
    throw new Error(`${element.name}.composition must reference Composition`);
  }
  return {
    records: [],
    components: [{
      id,
      fragment: hyperframesRenderFragment.id,
      inputs: { composition: composition.ref },
      outputs: { video: `${id}.video` },
      range: element.range,
    }],
    fragments: [hyperframesRenderFragment],
  };
};
