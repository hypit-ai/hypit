import { narrativeTypes } from "@narratage/narrative";
import { speechTypes } from "@narratage/speech";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@narratage/markup";

import { whisperXSpeechAlignmentFragment } from "./fragment.js";

function exactAttributes(element: StructuredElement, names: readonly string[]): void {
  if (Object.keys(element.attributes).sort().join("\u0000") !== [...names].sort().join("\u0000")) {
    throw new Error(`${element.name} requires exactly ${names.join(", ")}`);
  }
}

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be a non-empty string`);
  return value.trim();
}

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

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

export const decodeWhisperXAlignmentSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "narrative", "audio"]);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} does not accept children`);
  }
  const id = stringAttribute(element, "id");
  const narrative = reference(element, "narrative", narrativeTypes.narrative, resolveReference);
  const audio = reference(element, "audio", speechTypes.audioBasis, resolveReference);
  return {
    records: [],
    components: [{
      id,
      fragment: whisperXSpeechAlignmentFragment.id,
      inputs: { narrative: narrative.ref, audio: audio.ref },
      outputs: {
        rawEvidence: `${id}.rawEvidence`,
        evidence: `${id}.evidence`,
        map: `${id}.map`,
      },
      range: element.range,
    }],
    fragments: [whisperXSpeechAlignmentFragment],
  };
};
