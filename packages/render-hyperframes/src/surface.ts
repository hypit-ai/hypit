import { programSpaceTypes } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
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
  if (names.join(",") !== "composition,id,space") throw new Error(`${element.name} requires exactly composition, id and space`);
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
  const spacePath = referenceAttribute(element, "space");
  const space = resolveReference(spacePath);
  if (space === undefined
    || space.type.module.name !== programSpaceTypes.programSpace.module.name
    || space.type.module.version !== programSpaceTypes.programSpace.module.version
    || space.type.name !== programSpaceTypes.programSpace.name) {
    throw new Error(`${element.name}.space must reference ProgramSpace`);
  }
  return {
    records: [],
    components: [{
      id,
      fragment: renderHyperframesFragment.id,
      inputs: { composition: composition.ref, space: space.ref },
      outputs: { video: `${id}.video` },
      range: element.range,
    }],
    fragments: [renderHyperframesFragment],
  };
};
