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
import { whisperXTypes } from "./manifest.js";
import type { WhisperXLanguage } from "./types.js";

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
  exactAttributes(element, ["id", "narrative", "segment", "media", "language"]);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} does not accept children`);
  }
  const id = stringAttribute(element, "id");
  const narrative = reference(element, "narrative", narrativeTypes.narrative, resolveReference);
  const segment = reference(element, "segment", narrativeTypes.excerpt, resolveReference);
  const media = reference(element, "media", mediaTypes.synchronized, resolveReference);
  const language = stringAttribute(element, "language");
  if (language !== "en" && language !== "zh") {
    throw new Error(`${element.name}.language must be en or zh`);
  }
  const languageId = `${id}.language`;
  return {
    records: [{
      id: languageId,
      type: whisperXTypes.language,
      value: { kind: "inline", value: language as WhisperXLanguage },
      range: element.range,
    }],
    components: [{
      id,
      fragment: whisperXSemanticTakeFragment.id,
      inputs: {
        narrative: narrative.ref,
        segment: segment.ref,
        media: media.ref,
        language: { kind: "record", id: languageId },
      },
      outputs: { take: `${id}.take` },
      range: element.range,
    }],
    fragments: [whisperXSemanticTakeFragment],
  };
};
