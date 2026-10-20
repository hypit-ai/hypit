import { sameType } from "@hypit/hypit/protocol";
import { blobTypes } from "@hypit/hypit/blob";
import {
  modelField,
  sealModelArtifactBinding,
} from "@hypit/generation/model-fields";
import type { ModelArtifactField } from "@hypit/generation/model-fields";
import { imageTransformTypes } from "@hypit/image-operations";
import {
  modelArtifactInputNames,
  modelTextInputName,
  createFieldModelPrimaryFragment,
} from "@hypit/generation/model-fields";
import type { MarkupAttributeValue, StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";
import type { CanonicalValue, TypeRef } from "@hypit/hypit/protocol";
import { isBlobRef } from "@hypit/hypit/protocol";
import { textTypes, verifyText } from "@hypit/hypit/text";

import { createGptImageCleanFragment } from "./fragment.js";
import { gptImageCleanupProgram } from "./cleanup-program.js";
import {
  gptImage2Ports,
  gptImageEndpoints,
  sealGptImage2Draft,
} from "./index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function localName(value: string): string {
  return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
}

function exactAttributes(element: StructuredElement, allowed: readonly string[], required: readonly string[]): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  assert(unknown.length === 0, `${element.name} does not accept ${unknown[0]}`);
  const missing = required.filter((name) => element.attributes[name] === undefined);
  assert(missing.length === 0, `${element.name} requires ${missing.join(", ")}`);
}

function textAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  assert(typeof value === "string" && value.trim().length > 0,
    `${element.name}.${name} must be a non-empty string`);
  return value.trim();
}

function referencePath(value: MarkupAttributeValue | undefined, subject: string): string {
  assert(typeof value === "object" && value.kind === "reference" && value.path.length > 0,
    `${subject} must be a whole-value reference`);
  return value.path;
}

function resolve(
  element: StructuredElement,
  attribute: string,
  expected: TypeRef,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const path = referencePath(element.attributes[attribute], `${element.name}.${attribute}`);
  const result = resolveReference(path);
  assert(result !== undefined, `${element.name}.${attribute} cannot resolve ${path}`);
  assert(sameType(result.type, expected), `${element.name}.${attribute} has the wrong type`);
  return result;
}

function prompt(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const result = resolve(element, "prompt", textTypes.text, resolveReference);
  if (result.record !== undefined) {
    assert(true, `${element.name}.prompt must reference Text`);
    verifyText(result.record.value);
  }
  return result;
}

function references(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
  maximum: number | undefined,
): readonly SurfaceResolvedReference[] {
  const result: SurfaceResolvedReference[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      assert(child.value.trim().length === 0, `${element.name} accepts only Reference children`);
      continue;
    }
    assert(localName(child.name) === "Reference", `${element.name} accepts only Reference children`);
    exactAttributes(child, ["image"], ["image"]);
    assert(!child.children.some((item) => item.kind === "element" || item.value.trim().length > 0),
      `${child.name} must be empty`);
    const image = resolve(child, "image", blobTypes.blob, resolveReference);
    if (image.record !== undefined) {
      assert(isBlobRef(image.record.value) && image.record.value.mediaType.startsWith("image/"),
        `${child.name}.image must reference image media`);
    }
    result.push(image);
  }
  if (maximum !== undefined) {
    assert(result.length <= maximum, `${element.name} accepts at most ${maximum} Reference children`);
  }
  return result;
}

function decode(clean: boolean): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => {
    exactAttributes(element, ["id", "prompt", "aspect-ratio", "resolution", "background"],
      ["id", "prompt", "aspect-ratio", "resolution"]);
    const id = textAttribute(element, "id");
    const promptSource = prompt(element, resolveReference);
    const endpoint = gptImageEndpoints.image!;
    const imagePort = modelField(gptImage2Ports, "images");
    assert(imagePort.value.kind === "media", "GPT Image images port is not media");
    const images = references(element, resolveReference, imagePort.maxItems);
    const background = element.attributes.background === undefined
      ? undefined
      : textAttribute(element, "background");
    const draft = sealGptImage2Draft({
      aspectRatio: [textAttribute(element, "aspect-ratio")],
      resolution: [textAttribute(element, "resolution")],
      ...(background === undefined ? {} : { background: [background] }),
    });
    const records: Array<{
      readonly id: string;
      readonly type: TypeRef;
      readonly value: CanonicalValue;
      readonly range: StructuredElement["range"];
    }> = [{
      id: `${id}.draft`,
      type: endpoint.draftType,
      value: (draft as unknown as CanonicalValue),
      range: element.range,
    }];
    const inputs: Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
      draft: { kind: "record", id: `${id}.draft` },
      [modelTextInputName("prompt")]: promptSource.ref,
    };
    const mediaInputs = images.map((image, index) => {
      const name = `image-${String(index + 1).padStart(4, "0")}`;
      const bindingId = `${id}.${name}.binding`;
      records.push({
        id: bindingId,
        type: endpoint.mediaBindings.images!.type,
        value: (sealModelArtifactBinding(imagePort as ModelArtifactField, { role: "image" }) as unknown as CanonicalValue),
        range: element.range,
      });
      const names = modelArtifactInputNames(name);
      inputs[names.binding] = { kind: "record", id: bindingId };
      inputs[names.artifact] = image.ref;
      return { name, port: "images" } as const;
    });
    if (clean) {
      records.push({
        id: `${id}.cleanup`,
        type: imageTransformTypes.program,
        value: (gptImageCleanupProgram as unknown as CanonicalValue),
        range: element.range,
      });
      inputs.cleanup = { kind: "record", id: `${id}.cleanup` };
    }
    const textInputs = [{ name: "prompt", port: "prompt" }] as const;
    const fragment = clean
      ? createGptImageCleanFragment(mediaInputs, textInputs)
      : createFieldModelPrimaryFragment(endpoint, mediaInputs, textInputs);
    return {
      records,
      components: [{
        id,
        fragment,
        inputs,
        outputs: { image: `${id}.image` },
        range: element.range,
      }],
    };
  };
}

export const decodeGptImageSurface = decode(false);
export const decodeCleanGptImageSurface = decode(true);
