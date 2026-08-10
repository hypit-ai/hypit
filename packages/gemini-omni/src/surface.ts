import { artifactTypes } from "@narratage/artifact";
import { generationPort, sealGenerationMediaBinding, sealGenerationRequestDraft } from "@narratage/generation";
import type { GenerationMediaPort, GenerationPortValue } from "@narratage/generation";
import {
  createExactModelPrimaryGenerationFragment,
  exactModelMediaInputNames,
  exactModelTextInputName,
} from "@narratage/model-kit";
import type { ExactModelMediaInput } from "@narratage/model-kit";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@narratage/markup";
import type { CanonicalValue, TypeRef } from "@narratage/protocol";
import { textTypes, verifyText } from "@narratage/text";

import { geminiOmniEndpoints } from "./index.js";

type Media = {
  readonly port: "images" | "excerpts";
  readonly role: "image" | "video";
  readonly source: SurfaceResolvedReference;
  readonly fields?: Readonly<Record<string, number>>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function localName(name: string): string {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
}

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.name === right.name
    && left.module.name === right.module.name
    && left.module.version === right.module.version;
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

function number(element: StructuredElement, name: string): number {
  const value = Number(text(element, name));
  assert(Number.isFinite(value), `${element.name}.${name} must be a number`);
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

function mediaRef(
  element: StructuredElement,
  name: string,
  role: "image" | "video",
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const result = ref(element, name, artifactTypes.blob, resolve);
  if (result.record !== undefined) {
    assert(result.record.value.kind === "blob" && result.record.value.mediaType.startsWith(`${role}/`),
      `${element.name}.${name} must be ${role} media`);
  }
  return result;
}

function empty(element: StructuredElement): void {
  assert(!element.children.some((item) => item.kind === "element" || item.value.trim()), `${element.name} must be empty`);
}

export const decodeGeminiOmniVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, ["id", "prompt", "duration", "aspect-ratio", "resolution", "seed"],
    ["id", "prompt", "duration", "aspect-ratio", "resolution"]);
  const id = text(element, "id");
  const endpoint = geminiOmniEndpoints.video!;
  const prompt = ref(element, "prompt", textTypes.text, resolveReference);
  if (prompt.record !== undefined) {
    assert(prompt.record.value.kind === "inline", `${element.name}.prompt must reference Text`);
    verifyText(prompt.record.value.value);
  }

  const ports: Record<string, readonly GenerationPortValue[]> = {
    duration: [integer(element, "duration")],
    aspectRatio: [text(element, "aspect-ratio")],
    resolution: [text(element, "resolution")],
  };
  if (element.attributes.seed !== undefined) ports.seed = [integer(element, "seed")];
  const media: Media[] = [];
  const audioIds: string[] = [];
  const characterIds: string[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      assert(child.value.trim().length === 0, `${element.name} accepts only Image, Excerpt, AudioId or CharacterId children`);
      continue;
    }
    switch (localName(child.name)) {
      case "Image":
        exact(child, ["image"]);
        empty(child);
        media.push({ port: "images", role: "image", source: mediaRef(child, "image", "image", resolveReference) });
        break;
      case "Excerpt": {
        exact(child, ["video", "start-sec", "end-sec"]);
        empty(child);
        const startSec = number(child, "start-sec");
        const endSec = number(child, "end-sec");
        assert(startSec < endSec, `${child.name}.start-sec must be before end-sec`);
        media.push({
          port: "excerpts",
          role: "video",
          source: mediaRef(child, "video", "video", resolveReference),
          fields: { startSec, endSec },
        });
        break;
      }
      case "AudioId":
        exact(child, ["value"]);
        empty(child);
        audioIds.push(text(child, "value"));
        break;
      case "CharacterId":
        exact(child, ["value"]);
        empty(child);
        characterIds.push(text(child, "value"));
        break;
      default:
        throw new Error(`${element.name} does not accept ${child.name}`);
    }
  }
  if (audioIds.length > 0) ports.audioIds = audioIds;
  if (characterIds.length > 0) ports.characterIds = characterIds;
  const imageCount = media.filter((item) => item.port === "images").length;
  const excerptCount = media.filter((item) => item.port === "excerpts").length;
  assert(imageCount <= generationPort(endpoint.ports, "images").maxItems,
    `${element.name} accepts at most 7 Image children`);
  assert(excerptCount <= generationPort(endpoint.ports, "excerpts").maxItems,
    `${element.name} accepts at most one Excerpt child`);
  assert(imageCount + excerptCount * 2 + characterIds.length <= 7,
    `${element.name} exceeds Gemini Omni's shared reference budget`);

  const draft = sealGenerationRequestDraft(endpoint.ports, ports);
  const records: Array<{
    id: string;
    type: TypeRef;
    value: { kind: "inline"; value: CanonicalValue };
    range: StructuredElement["range"];
  }> = [{
    id: `${id}.draft`,
    type: endpoint.draftType,
    value: { kind: "inline", value: draft as unknown as CanonicalValue },
    range: element.range,
  }];
  const inputs: Record<string, SurfaceResolvedReference["ref"] | { kind: "record"; id: string }> = {
    draft: { kind: "record", id: `${id}.draft` },
    [exactModelTextInputName("prompt")]: prompt.ref,
  };
  const mediaInputs = media.map((item, index): ExactModelMediaInput => {
    const name = `media-${String(index + 1).padStart(4, "0")}`;
    const bindingId = `${id}.${name}.binding`;
    const port = generationPort(endpoint.ports, item.port);
    assert(port.value.kind === "media", `${item.port} is not a media port`);
    records.push({
      id: bindingId,
      type: endpoint.mediaBindings[item.port]!.type,
      value: {
        kind: "inline",
        value: sealGenerationMediaBinding(port as GenerationMediaPort, {
          role: item.role,
          ...(item.fields === undefined ? {} : { fields: item.fields }),
        }) as unknown as CanonicalValue,
      },
      range: element.range,
    });
    const names = exactModelMediaInputNames(name);
    inputs[names.binding] = { kind: "record", id: bindingId };
    inputs[names.artifact] = item.source.ref;
    return { name, port: item.port };
  });
  const fragment = createExactModelPrimaryGenerationFragment(endpoint, mediaInputs, [{ name: "prompt", port: "prompt" }]);
  return {
    records,
    fragments: [fragment],
    components: [{
      id,
      fragment: fragment.id,
      inputs,
      outputs: { video: `${id}.video` },
      range: element.range,
    }],
  };
};
