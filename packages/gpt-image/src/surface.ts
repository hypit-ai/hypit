import { artifactTypes } from "@narratage/artifact";
import {
  generationPort,
  sealGenerationMediaBinding,
} from "@narratage/generation";
import type { GenerationMediaPort } from "@narratage/generation";
import {
  gptImageDenoiseV1,
  imageTransformTypes,
} from "@narratage/image-transform";
import {
  exactModelMediaInputNames,
  exactModelTextInputName,
  createExactModelPrimaryGenerationFragment,
} from "@narratage/model-kit";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@narratage/markup";
import type { CanonicalValue, TypeRef } from "@narratage/protocol";
import { textTypes, verifyText } from "@narratage/text";

import { createGptImageCleanFragment } from "./fragment.js";
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

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
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
    assert(result.record.value.kind === "inline", `${element.name}.prompt must reference Text`);
    verifyText(result.record.value.value);
  }
  return result;
}

function references(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
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
    const image = resolve(child, "image", artifactTypes.blob, resolveReference);
    if (image.record !== undefined) {
      assert(image.record.value.kind === "blob" && image.record.value.mediaType.startsWith("image/"),
        `${child.name}.image must reference image media`);
    }
    result.push(image);
  }
  assert(result.length <= 16, `${element.name} accepts at most 16 Reference children`);
  return result;
}

function decode(clean: boolean): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => {
    exactAttributes(element, ["id", "prompt", "aspect-ratio", "resolution"],
      ["id", "prompt", "aspect-ratio", "resolution"]);
    const id = textAttribute(element, "id");
    const promptSource = prompt(element, resolveReference);
    const images = references(element, resolveReference);
    const endpoint = gptImageEndpoints.image!;
    const imagePort = generationPort(gptImage2Ports, "images");
    assert(imagePort.value.kind === "media", "GPT Image images port is not media");
    const draft = sealGptImage2Draft({
      aspectRatio: [textAttribute(element, "aspect-ratio")],
      resolution: [textAttribute(element, "resolution")],
    });
    const records: Array<{
      readonly id: string;
      readonly type: TypeRef;
      readonly value: { readonly kind: "inline"; readonly value: CanonicalValue };
      readonly range: StructuredElement["range"];
    }> = [{
      id: `${id}.draft`,
      type: endpoint.draftType,
      value: { kind: "inline", value: draft as unknown as CanonicalValue },
      range: element.range,
    }];
    const inputs: Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
      draft: { kind: "record", id: `${id}.draft` },
      [exactModelTextInputName("prompt")]: promptSource.ref,
    };
    const mediaInputs = images.map((image, index) => {
      const name = `image-${String(index + 1).padStart(4, "0")}`;
      const bindingId = `${id}.${name}.binding`;
      records.push({
        id: bindingId,
        type: endpoint.mediaBindings.images!.type,
        value: {
          kind: "inline",
          value: sealGenerationMediaBinding(imagePort as GenerationMediaPort, { role: "image" }) as unknown as CanonicalValue,
        },
        range: element.range,
      });
      const names = exactModelMediaInputNames(name);
      inputs[names.binding] = { kind: "record", id: bindingId };
      inputs[names.artifact] = image.ref;
      return { name, port: "images" } as const;
    });
    if (clean) {
      records.push({
        id: `${id}.cleanup`,
        type: imageTransformTypes.program,
        value: { kind: "inline", value: gptImageDenoiseV1 as unknown as CanonicalValue },
        range: element.range,
      });
      inputs.cleanup = { kind: "record", id: `${id}.cleanup` };
    }
    const textInputs = [{ name: "prompt", port: "prompt" }] as const;
    const fragment = clean
      ? createGptImageCleanFragment(mediaInputs, textInputs)
      : createExactModelPrimaryGenerationFragment(endpoint, mediaInputs, textInputs);
    return {
      records,
      components: [{
        id,
        fragment: fragment.id,
        inputs,
        outputs: { image: `${id}.image` },
        range: element.range,
      }],
      fragments: [fragment],
    };
  };
}

export const decodeGptImageSurface = decode(false);
export const decodeCleanGptImageSurface = decode(true);
