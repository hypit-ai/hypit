import { assertExactAttributes as exactAttributes, textAttribute as stringAttribute, type StructuredElement, type StructuredSurfaceHandler, type SurfaceResolvedReference, type SurfaceRecordDraft, type MarkupAttributeValue } from "@hypit/hypit/markup";
import { sameType } from "@hypit/hypit/protocol";
import { mediaTypes } from "@hypit/media";

import { whisperXTranscriptionFragment } from "./fragment.js";
import { whisperXTypes } from "./manifest.js";
import { parseWhisperXLanguage } from "./types.js";

function reference(element: StructuredElement, name: string, expected: SurfaceResolvedReference["type"],
  resolveReference: (path: string) => SurfaceResolvedReference | undefined): SurfaceResolvedReference {
  const raw: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${element.name}.${name} must be a whole-value reference`);
  const value = resolveReference(raw.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`${element.name}.${name} has the wrong type`);
  return value;
}
export const decodeWhisperXTranscriptionSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "media", "language"]);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) throw new Error(`${element.name} does not accept children`);
  const id = stringAttribute(element, "id");
  const records: SurfaceRecordDraft[] = [];
  const inputs: Record<string, SurfaceResolvedReference["ref"] | { kind: "record"; id: string }> = {
    media: reference(element, "media", mediaTypes.prepared, resolveReference).ref,
  };
  const language = parseWhisperXLanguage(stringAttribute(element, "language"), `${element.name}.language`);
  const languageId = `${id}.language`;
  records.push({ id: languageId, type: whisperXTypes.language, value: (language), range: element.range });
  inputs.language = { kind: "record", id: languageId };
  return { records, components: [{ id, fragment: whisperXTranscriptionFragment, inputs,
    outputs: { transcript: `${id}.transcript` }, range: element.range }],
    exports: [`${id}.transcript`] };
};
