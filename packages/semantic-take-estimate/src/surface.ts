import { estimateTypes } from "@hypit/estimate";
import {
  assertExactAttributes,
  textAttribute,
} from "@hypit/markup";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@hypit/markup";
import { mediaTypes } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import { sameType } from "@hypit/protocol";

import { semanticTakeEstimateFragment } from "./fragment.js";

function reference(
  element: StructuredElement,
  name: string,
  expected: SurfaceResolvedReference["type"],
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const raw: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  const resolved = resolveReference(raw.path);
  if (resolved === undefined) throw new Error(`${element.name}.${name} cannot resolve ${raw.path}`);
  if (!sameType(resolved.type, expected)) throw new Error(`${element.name}.${name} has the wrong type`);
  return resolved;
}

export const decodeSemanticTakeEstimateSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertExactAttributes(element, ["id", "narrative", "segment", "media", "policy"]);
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty`);
  }
  const id = textAttribute(element, "id");
  return {
    records: [],
    components: [{
      id,
      fragment: semanticTakeEstimateFragment.id,
      inputs: {
        narrative: reference(element, "narrative", narrativeTypes.narrative, resolveReference).ref,
        segment: reference(element, "segment", narrativeTypes.excerpt, resolveReference).ref,
        media: reference(element, "media", mediaTypes.synchronized, resolveReference).ref,
        policy: reference(element, "policy", estimateTypes.speechPolicy, resolveReference).ref,
      },
      outputs: { take: `${id}.take` },
      range: element.range,
    }],
    fragments: [semanticTakeEstimateFragment],
  };
};
