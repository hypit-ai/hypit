import { assertAttributes, assertEmptyElement, localName, textAttribute, type StructuredSurfaceHandler } from "@hypit/markup";
import { sameType } from "@hypit/protocol";
import { speechTypes } from "@hypit/speech";
import { createSpeechTrackFragment } from "./fragment.js";
import { speechTrackTypes } from "./manifest.js";

export const decodeSpeechTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id"]);
  const id = textAttribute(element, "id");
  const takes = element.children.flatMap(child => {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error("Speech Track accepts only Take children.");
      return [];
    }
    if (localName(child.name) !== "Take") throw new Error("Speech Track accepts only Take children.");
    assertAttributes(child, ["source"]);
    assertEmptyElement(child);
    const source = child.attributes.source;
    if (typeof source !== "object" || source.kind !== "reference") throw new Error("Speech Take source must be a reference.");
    const resolved = resolveReference(source.path);
    if (resolved === undefined || !sameType(resolved.type, speechTypes.semanticTake)) throw new Error("Speech Take source must be a SemanticTake.");
    return [resolved];
  });
  const inputs = takes.map((_, index) => ({ takeName: `take-${index + 1}` }));
  const fragment = createSpeechTrackFragment({ takes: inputs });
  return {
    records: [{ id: `${id}.header`, type: speechTrackTypes.header, value: { kind: "inline", value: { id } }, range: element.range }],
    fragments: [fragment],
    components: [{ id, fragment: fragment.id, inputs: {
      header: { kind: "record", id: `${id}.header` },
      ...Object.fromEntries(takes.map((take, index) => [inputs[index]!.takeName, take.ref])),
    }, outputs: { semantic: `${id}.semantic`, audio: `${id}.audio` }, range: element.range }],
    exports: [`${id}.semantic`, `${id}.audio`],
  };
};
