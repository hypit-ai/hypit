import {
  assertExactAttributes as exactAttributes,
  textAttribute as stringAttribute,
  type StructuredElement,
  type StructuredSurfaceHandler,
  type SurfaceResolvedReference,
  type MarkupAttributeValue,
} from "@hypit/markup";
import { sameType } from "@hypit/protocol";
import { narrativeTypes } from "@hypit/narrative";
import { mediaTypes } from "@hypit/media";

import { whisperXSemanticTakeFragment } from "./fragment.js";

function reference(
  element: StructuredElement,
  name: string,
  expected: SurfaceResolvedReference["type"],
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const raw: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${element.name}.${name} must be a whole-value reference`);
  const value = resolveReference(raw.path);
  if (value === undefined) throw new Error(`${element.name}.${name} cannot resolve ${raw.path}`);
  if (!sameType(value.type, expected)) throw new Error(`${element.name}.${name} has the wrong type`);
  return value;
}

export const decodeWhisperXSemanticTakeSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "narrative", "segment", "media"]);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} does not accept children`);
  }
  const id = stringAttribute(element, "id");
  const narrative = reference(element, "narrative", narrativeTypes.narrative, resolveReference);
  const segment = reference(element, "segment", narrativeTypes.excerpt, resolveReference);
  const media = reference(element, "media", mediaTypes.synchronized, resolveReference);
  return {
    records: [],
    components: [{
      id,
      fragment: whisperXSemanticTakeFragment.id,
      inputs: { narrative: narrative.ref, segment: segment.ref, media: media.ref },
      outputs: {
        evidence: `${id}.evidence`,
        take: `${id}.take`,
      },
      range: element.range,
    }],
    fragments: [whisperXSemanticTakeFragment],
  };
};
