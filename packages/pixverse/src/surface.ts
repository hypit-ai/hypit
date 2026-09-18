import { artifactTypes } from "@hypit/artifact";
import { generationPort, sealGenerationMediaBinding, sealGenerationRequestDraft } from "@hypit/generation";
import type { GenerationMediaPort, GenerationPortValue } from "@hypit/generation";
import {
  createExactModelPrimaryGenerationFragment,
  exactModelMediaInputNames,
  exactModelTextInputName,
} from "@hypit/model-kit";
import type { ExactModelEndpoint } from "@hypit/model-kit";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@hypit/markup";
import type { CanonicalValue, TypeRef } from "@hypit/protocol";
import { textTypes, verifyText } from "@hypit/text";

import { pixverseEndpoints } from "./index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.name === right.name && left.module.name === right.module.name && left.module.version === right.module.version;
}

const attributes = ["id", "prompt", "first-frame", "last-frame", "duration", "quality",
  "aspect-ratio", "generate-audio", "multi-clip", "seed"] as const;

function exact(element: StructuredElement): void {
  const unknown = Object.keys(element.attributes).filter((name) => !attributes.includes(name as typeof attributes[number]));
  assert(unknown.length === 0, `${element.name} does not accept ${unknown[0]}`);
  const missing = ["id", "prompt", "duration", "quality"].filter((name) => element.attributes[name] === undefined);
  assert(missing.length === 0, `${element.name} requires ${missing.join(", ")}`);
}

function text(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  assert(typeof value === "string" && value.trim().length > 0, `${element.name}.${name} must be text`);
  return value.trim();
}

/** An absent optional attribute leaves its port unstated, which the model reads as its own default. */
function optionalText(element: StructuredElement, name: string): readonly GenerationPortValue[] | undefined {
  return element.attributes[name] === undefined ? undefined : [text(element, name)];
}

function optionalFlag(element: StructuredElement, name: string): readonly GenerationPortValue[] | undefined {
  if (element.attributes[name] === undefined) return undefined;
  const value = text(element, name);
  assert(value === "true" || value === "false", `${element.name}.${name} must be true or false`);
  return [value === "true"];
}

function integer(element: StructuredElement, name: string): readonly GenerationPortValue[] {
  const value = text(element, name);
  assert(/^\d+$/u.test(value), `${element.name}.${name} must be a whole number`);
  return [Number(value)];
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

function frame(
  element: StructuredElement,
  name: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference | undefined {
  if (element.attributes[name] === undefined) return undefined;
  const image = ref(element, name, artifactTypes.blob, resolve);
  if (image.record !== undefined) {
    assert(image.record.value.kind === "blob" && image.record.value.mediaType.startsWith("image/"),
      `${element.name}.${name} must reference image media`);
  }
  return image;
}

function decoder(endpoint: ExactModelEndpoint): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => {
    exact(element);
    assert(!element.children.some((item) => item.kind === "element" || item.value.trim()),
      `${element.name} accepts no children`);
    const id = text(element, "id");
    const prompt = ref(element, "prompt", textTypes.text, resolveReference);
    if (prompt.record !== undefined) {
      assert(prompt.record.value.kind === "inline", `${element.name}.prompt must reference Text`);
      verifyText(prompt.record.value.value);
    }
    const frames = ([["firstFrame", "first-frame"], ["lastFrame", "last-frame"]] as const)
      .flatMap(([port, attribute]) => {
        const image = frame(element, attribute, resolveReference);
        return image === undefined ? [] : [{ port, image }];
      });
    const stated: Record<string, readonly GenerationPortValue[] | undefined> = {
      duration: integer(element, "duration"),
      quality: [text(element, "quality")],
      aspectRatio: optionalText(element, "aspect-ratio"),
      generateAudio: optionalFlag(element, "generate-audio"),
      multiClip: optionalFlag(element, "multi-clip"),
      seed: element.attributes["seed"] === undefined ? undefined : integer(element, "seed"),
    };
    const draft = sealGenerationRequestDraft(endpoint.ports, Object.fromEntries(
      Object.entries(stated).filter((entry): entry is [string, readonly GenerationPortValue[]] => entry[1] !== undefined),
    ));
    const records: Array<{ id: string; type: TypeRef; value: { kind: "inline"; value: CanonicalValue }; range: StructuredElement["range"] }> = [{
      id: `${id}.draft`, type: endpoint.draftType,
      value: { kind: "inline", value: draft as unknown as CanonicalValue }, range: element.range,
    }];
    const inputs: Record<string, SurfaceResolvedReference["ref"] | { kind: "record"; id: string }> = {
      draft: { kind: "record", id: `${id}.draft` }, [exactModelTextInputName("prompt")]: prompt.ref,
    };
    const media = frames.map(({ port, image }, index) => {
      const name = `media-${String(index + 1).padStart(4, "0")}`;
      const bindingId = `${id}.${name}.binding`;
      const mediaPort = generationPort(endpoint.ports, port);
      assert(mediaPort.value.kind === "media", `PixVerse port ${port} is not media`);
      records.push({
        id: bindingId, type: endpoint.mediaBindings[port]!.type,
        value: { kind: "inline", value: sealGenerationMediaBinding(mediaPort as GenerationMediaPort, { role: "image" }) as unknown as CanonicalValue },
        range: element.range,
      });
      const names = exactModelMediaInputNames(name);
      inputs[names.binding] = { kind: "record", id: bindingId };
      inputs[names.artifact] = image.ref;
      return { name, port } as const;
    });
    const fragment = createExactModelPrimaryGenerationFragment(endpoint, media, [{ name: "prompt", port: "prompt" }]);
    return { records, fragments: [fragment], components: [{
      id, fragment: fragment.id, inputs, outputs: { video: `${id}.video` }, range: element.range,
    }] };
  };
}

export const decodePixverseVideoSurface = decoder(pixverseEndpoints.video!);
