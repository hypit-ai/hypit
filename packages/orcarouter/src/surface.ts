import { artifactTypes } from "@hypit/artifact";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/markup";
import { localName } from "@hypit/markup";
import type { CanonicalValue, TypeRef } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";
import { textTypes, verifyText } from "@hypit/text";

import { orcaRouterFragment } from "./fragment.js";
import { orcaRouterTypes } from "./manifest.js";
import { assertOrcaRouterChatRequest, assertOrcaRouterModel } from "./program.js";
import type { OrcaRouterChatRequest } from "./types.js";

const MAX_REFERENCES = 8;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.name === right.name
    && left.module.name === right.module.name
    && left.module.version === right.module.version;
}

export const decodeOrcaRouterGenerateSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const unknown = Object.keys(element.attributes).filter((name) => !["id", "model", "prompt"].includes(name));
  assert(unknown.length === 0, `${element.name} does not accept ${unknown[0]}`);
  const id = element.attributes.id;
  assert(typeof id === "string" && id.trim().length > 0, `${element.name}.id must be text`);
  const model = element.attributes.model;
  assertOrcaRouterModel(model);
  const rawPrompt = element.attributes.prompt;
  assert(typeof rawPrompt === "object" && rawPrompt.kind === "reference", `${element.name}.prompt must be a reference`);
  const prompt: SurfaceResolvedReference = resolveReference(rawPrompt.path)!;
  assert(prompt !== undefined && sameType(prompt.type, textTypes.text), `${element.name}.prompt must reference Text`);
  if (prompt.record !== undefined) {
    assert(prompt.record.value.kind === "inline", `${element.name}.prompt must reference Text`);
    verifyText(prompt.record.value.value);
  }
  const images: SurfaceResolvedReference[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      assert(child.value.trim().length === 0, `${element.name} accepts only Reference children`);
      continue;
    }
    assert(localName(child.name) === "Reference", `${element.name} accepts only Reference children`);
    const attributes = Object.keys(child.attributes);
    assert(attributes.every((name) => name === "image"), `${child.name} does not accept ${attributes.find((name) => name !== "image")}`);
    assert(child.children.length === 0, `${child.name} must be empty`);
    const rawImage = child.attributes.image;
    assert(typeof rawImage === "object" && rawImage.kind === "reference", `${child.name}.image must be a reference`);
    const image = resolveReference(rawImage.path);
    assert(image !== undefined && sameType(image.type, artifactTypes.blob), `${child.name}.image must be a Blob Artifact`);
    if (image.record !== undefined) {
      assert(image.record.value.kind === "blob" && image.record.value.mediaType.startsWith("image/"),
        `${child.name}.image must reference image media`);
    }
    images.push(image);
  }
  assert(images.length <= MAX_REFERENCES, `${element.name} accepts at most ${MAX_REFERENCES} references`);
  const promptRecord = prompt.record;
  assert(promptRecord !== undefined && promptRecord.value.kind === "inline"
    && typeof (promptRecord.value.value as { readonly value?: unknown }).value === "string",
    `${element.name}.prompt must resolve to a literal Text value`);
  const request: OrcaRouterChatRequest = {
    model: model.trim(),
    prompt: (promptRecord.value.value as { readonly value: string }).value,
    images: images.flatMap((image) => image.record?.value.kind === "blob" ? [image.record.value] : []),
  };
  assertOrcaRouterChatRequest(request);
  const record = {
    id: `${id.trim()}.request`,
    type: orcaRouterTypes.chatRequest,
    value: { kind: "inline" as const, value: canonicalize(request) as unknown as CanonicalValue },
    range: element.range,
  };
  return {
    records: [record],
    fragments: [orcaRouterFragment],
    components: [{
      id: id.trim(),
      fragment: orcaRouterFragment.id,
      inputs: { request: { kind: "record", id: record.id } },
      outputs: { chat: `${id.trim()}.chat` },
      range: element.range,
    }],
  };
};
