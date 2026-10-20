import { sameType } from "@hypit/hypit/protocol";
import { blobTypes } from "@hypit/hypit/blob";
import { modelField, sealModelArtifactBinding, sealModelFieldBuilder } from "@hypit/generation/model-fields";
import type { ModelArtifactField, ModelFieldValue } from "@hypit/generation/model-fields";
import {
  createFieldModelPrimaryFragment,
  modelArtifactInputNames,
  modelTextInputName,
} from "@hypit/generation/model-fields";
import type { FieldModelOperation } from "@hypit/generation/model-fields";
import type { CanonicalValue, TypeRef } from "@hypit/hypit/protocol";
import { isBlobRef } from "@hypit/hypit/protocol";
import type { MarkupAttributeValue, StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";
import { textTypes, verifyText } from "@hypit/hypit/text";

import { grokImagineEndpoints } from "./index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function localName(name: string): string {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
}

function exact(element: StructuredElement, allowed: readonly string[], required = allowed): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  assert(unknown.length === 0, `${element.name} does not accept ${unknown[0]}`);
  const missing = required.filter((name) => element.attributes[name] === undefined);
  assert(missing.length === 0, `${element.name} requires ${missing.join(", ")}`);
}

function text(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  assert(typeof value === "string" && value.trim().length > 0, `${element.name}.${name} must be text`);
  return value.trim();
}

function integer(element: StructuredElement, name: string): number {
  const value = Number(text(element, name));
  assert(Number.isSafeInteger(value), `${element.name}.${name} must be an integer`);
  return value;
}

function ref(
  element: StructuredElement,
  name: string,
  type: TypeRef,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  assert(typeof value === "object" && value.kind === "reference", `${element.name}.${name} must be a reference`);
  const result = resolve(value.path);
  assert(result !== undefined && sameType(result.type, type), `${element.name}.${name} has the wrong type`);
  return result;
}

function decoder(endpoint: FieldModelOperation): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => {
    exact(element, ["id", "prompt", "duration", "aspect-ratio", "resolution"]);
    const id = text(element, "id");
    const prompt = ref(element, "prompt", textTypes.text, resolveReference);
    if (prompt.record !== undefined) {
      assert(true, `${element.name}.prompt must reference Text`);
      verifyText(prompt.record.value);
    }
    const imagePort = modelField(endpoint.ports, "images");
    assert(imagePort.value.kind === "media", "Grok images port is not media");
    const images: SurfaceResolvedReference[] = [];
    for (const child of element.children) {
      if (child.kind === "text") {
        assert(child.value.trim().length === 0, `${element.name} accepts only Reference children`);
        continue;
      }
      assert(localName(child.name) === "Reference", `${element.name} accepts only Reference children`);
      exact(child, ["image"]);
      assert(!child.children.some((item) => item.kind === "element" || item.value.trim()), `${child.name} must be empty`);
      const image = ref(child, "image", blobTypes.blob, resolveReference);
      if (image.record !== undefined) {
        assert(isBlobRef(image.record.value) && image.record.value.mediaType.startsWith("image/"),
          `${child.name}.image must be image media`);
      }
      images.push(image);
    }
    if (imagePort.maxItems !== undefined) {
      assert(images.length <= imagePort.maxItems, `${element.name} accepts at most ${imagePort.maxItems} references`);
    }
    const ports: Record<string, readonly ModelFieldValue[]> = {
      duration: [integer(element, "duration")],
      aspectRatio: [text(element, "aspect-ratio")],
      resolution: [text(element, "resolution")],
    };
    const draft = sealModelFieldBuilder(endpoint.ports, ports);
    const records: Array<{
      id: string;
      type: TypeRef;
      value: CanonicalValue;
      range: StructuredElement["range"];
    }> = [{
      id: `${id}.draft`,
      type: endpoint.draftType,
      value: (draft as unknown as CanonicalValue),
      range: element.range,
    }];
    const inputs: Record<string, SurfaceResolvedReference["ref"] | { kind: "record"; id: string }> = {
      draft: { kind: "record", id: `${id}.draft` },
      [modelTextInputName("prompt")]: prompt.ref,
    };
    const media = images.map((image, index) => {
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
    const fragment = createFieldModelPrimaryFragment(endpoint, media, [{ name: "prompt", port: "prompt" }]);
    return {
      records,
      components: [{
        id,
        fragment,
        inputs,
        outputs: { video: `${id}.video` },
        range: element.range,
      }],
    };
  };
}

export const decodeGrokImagineVideoSurface = decoder(grokImagineEndpoints.video!);
export const decodeGrokImaginePreviewVideoSurface = decoder(grokImagineEndpoints["preview-1.5"]!);
