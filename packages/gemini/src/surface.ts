import { artifactTypes } from "@hypit/artifact";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@hypit/markup";
import type { TypeRef } from "@hypit/protocol";
import { textTypes } from "@hypit/text";

import { createGeminiFragment } from "./fragment.js";
import { geminiModels } from "./manifest.js";
import type { GeminiModel } from "./manifest.js";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function localName(value: string): string { return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value; }
function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}
function reference(value: MarkupAttributeValue | undefined, subject: string,
  expected: TypeRef, resolveReference: (path: string) => SurfaceResolvedReference | undefined): SurfaceResolvedReference {
  assert(typeof value === "object" && value.kind === "reference", `${subject} must be a reference`);
  const resolved = resolveReference(value.path);
  assert(resolved !== undefined && sameType(resolved.type, expected), `${subject} has the wrong type`);
  return resolved;
}
function literal(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  assert(typeof value === "string" && value.trim().length > 0, `${element.name}.${name} must be non-empty text`);
  return value.trim();
}

export const decodeGeminiGenerateSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const allowed = ["id", "instruction", "model", "prompt"];
  const unknown = Object.keys(element.attributes).find((name) => !allowed.includes(name));
  assert(unknown === undefined, `${element.name} does not accept ${unknown}`);
  const id = literal(element, "id");
  const model = literal(element, "model");
  assert(geminiModels.includes(model as GeminiModel), `${element.name}.model is unsupported`);
  const instruction = reference(element.attributes.instruction, `${element.name}.instruction`, textTypes.text, resolveReference);
  const prompt = reference(element.attributes.prompt, `${element.name}.prompt`, textTypes.text, resolveReference);
  const media: SurfaceResolvedReference[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      assert(child.value.trim().length === 0, `${element.name} accepts only Reference children`);
      continue;
    }
    assert(localName(child.name) === "Reference", `${element.name} accepts only Reference children`);
    assert(Object.keys(child.attributes).join(",") === "media", `${child.name} requires only media`);
    assert(!child.children.some((item) => item.kind === "element" || item.value.trim().length > 0), `${child.name} must be empty`);
    const resolved = reference(child.attributes.media, `${child.name}.media`, artifactTypes.blob, resolveReference);
    if (resolved.record?.value.kind === "blob") {
      assert(/^(?:image|video|audio)\//u.test(resolved.record.value.mediaType), `${child.name}.media must be image, video or audio`);
    }
    media.push(resolved);
  }
  const fragment = createGeminiFragment(model as GeminiModel, media.length);
  return {
    records: [],
    fragments: [fragment],
    components: [{
      id,
      fragment: fragment.id,
      inputs: {
        instruction: instruction.ref,
        prompt: prompt.ref,
        ...Object.fromEntries(media.map((item, index) => [`media-${String(index + 1).padStart(4, "0")}`, item.ref])),
      },
      outputs: { observation: `${id}.observation` },
      range: element.range,
    }],
  };
};
