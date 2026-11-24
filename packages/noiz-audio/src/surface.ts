import { blobTypes } from "@hypit/hypit/blob";
import { generationPort, sealGenerationMediaBinding, sealGenerationRequestDraft } from "@hypit/generation";
import type { GenerationMediaPort, GenerationPortValue } from "@hypit/generation";
import {
  createExactModelPrimaryGenerationFragment,
  exactModelMediaInputNames,
  exactModelTextInputName,
} from "@hypit/generation/model";
import type { ExactModelEndpoint, ExactModelMediaInput, ExactModelTextInput } from "@hypit/generation/model";
import type { CanonicalValue, TypeRef } from "@hypit/hypit/protocol";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@hypit/hypit/markup";
import { textTypes, verifyText } from "@hypit/hypit/text";
import type { Text } from "@hypit/hypit/text";
import { noizAudioEndpoints } from "./index.js";
import { validateNoizCoverSourceAudio } from "./validation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameType(a: TypeRef, b: TypeRef): boolean {
  return a.name === b.name && a.module.name === b.module.name && a.module.version === b.module.version;
}

function exact(element: StructuredElement, allowed: readonly string[], required: readonly string[]): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  assert(unknown.length === 0, `${element.name} does not accept ${unknown[0]}`);
  const missing = required.filter((name) => element.attributes[name] === undefined);
  assert(missing.length === 0, `${element.name} requires ${missing.join(", ")}`);
}

function empty(element: StructuredElement): void {
  assert(
    !element.children.some((item) => item.kind === "element" || item.value.trim().length > 0),
    `${element.name} must be empty`,
  );
}

function textAttr(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  assert(typeof value === "string" && value.trim().length > 0, `${element.name}.${name} must be non-empty text`);
  return value.trim();
}

function optionalTextAttr(element: StructuredElement, name: string): string | undefined {
  return element.attributes[name] === undefined ? undefined : textAttr(element, name);
}

function numberAttr(element: StructuredElement, name: string): number {
  const value = Number(textAttr(element, name));
  assert(Number.isFinite(value), `${element.name}.${name} must be a finite number`);
  return value;
}

function booleanAttr(element: StructuredElement, name: string): boolean {
  const value = textAttr(element, name);
  assert(value === "true" || value === "false", `${element.name}.${name} must be true or false`);
  return value === "true";
}

function refAttr(
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

function textRefAttr(
  element: StructuredElement,
  name: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
  maxChars?: number,
): SurfaceResolvedReference {
  const result = refAttr(element, name, textTypes.text, resolve);
  if (result.record !== undefined) {
    assert(result.record.value.kind === "inline", `${element.name}.${name} must reference Text`);
    verifyText(result.record.value.value);
    const content = (result.record.value.value as Text).value;
    assert(content.trim().length > 0, `${element.name}.${name} must contain non-whitespace text`);
    if (maxChars !== undefined) {
      assert(content.length <= maxChars, `${element.name}.${name} must be at most ${maxChars} characters`);
    }
  }
  return result;
}

function audioRefAttr(
  element: StructuredElement,
  name: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const result = refAttr(element, name, blobTypes.blob, resolve);
  if (result.record !== undefined) {
    assert(
      result.record.value.kind === "blob" && result.record.value.mediaType.startsWith("audio/"),
      `${element.name}.${name} must reference audio media`,
    );
    validateNoizCoverSourceAudio(result.record.value);
  }
  return result;
}

function output(
  element: StructuredElement,
  endpoint: ExactModelEndpoint,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
  textInputs: readonly { readonly input: ExactModelTextInput; readonly source: SurfaceResolvedReference }[],
  mediaInputs: readonly { readonly input: ExactModelMediaInput; readonly source: SurfaceResolvedReference }[] = [],
) {
  const id = textAttr(element, "id");
  const draft = sealGenerationRequestDraft(endpoint.ports, ports);
  const draftId = `${id}.draft`;
  const records: Array<{
    readonly id: string;
    readonly type: TypeRef;
    readonly value: { readonly kind: "inline"; readonly value: CanonicalValue };
    readonly range: StructuredElement["range"];
  }> = [{
    id: draftId,
    type: endpoint.draftType,
    value: { kind: "inline", value: draft as unknown as CanonicalValue },
    range: element.range,
  }];
  const inputs: Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
    draft: { kind: "record", id: draftId },
  };
  for (const item of textInputs) {
    inputs[exactModelTextInputName(item.input.name)] = item.source.ref;
  }
  for (const item of mediaInputs) {
    const binding = endpoint.mediaBindings[item.input.port];
    assert(binding !== undefined, `${endpoint.ports.model} has no media port ${item.input.port}`);
    const port = generationPort(endpoint.ports, item.input.port);
    assert(port.value.kind === "media", `${item.input.port} is not media`);
    const names = exactModelMediaInputNames(item.input.name);
    const bindingId = `${id}.${item.input.name}.binding`;
    records.push({
      id: bindingId,
      type: binding.type,
      value: {
        kind: "inline",
        value: sealGenerationMediaBinding(port as GenerationMediaPort, { role: "audio" }) as unknown as CanonicalValue,
      },
      range: element.range,
    });
    inputs[names.binding] = { kind: "record", id: bindingId };
    inputs[names.artifact] = item.source.ref;
  }
  const fragment = createExactModelPrimaryGenerationFragment(
    endpoint,
    mediaInputs.map((item) => item.input),
    textInputs.map((item) => item.input),
  );
  return {
    records,
    fragments: [fragment],
    components: [{
      id,
      fragment: fragment.id,
      inputs,
      outputs: { audio: `${id}.audio` },
      range: element.range,
    }],
  };
}

export const decodeNoizSoundEffectSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, ["id", "prompt", "duration", "output-format"], ["id", "prompt"]);
  empty(element);
  const prompt = textRefAttr(element, "prompt", resolveReference, 500);
  const ports: Record<string, readonly GenerationPortValue[]> = {};
  if (element.attributes.duration !== undefined) {
    ports.duration = [numberAttr(element, "duration")];
  }
  const format = optionalTextAttr(element, "output-format");
  if (format !== undefined) {
    ports.outputFormat = [format.toLowerCase()];
  }
  return output(
    element,
    noizAudioEndpoints.soundEffect,
    ports,
    [{ input: { name: "prompt", port: "prompt" }, source: prompt }],
  );
};

export const decodeNoizMusicSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(
    element,
    [
      "id",
      "prompt",
      "lyrics",
      "lyrics-prompt",
      "abc",
      "cot",
      "title",
      "tags",
      "negative-tags",
      "vocal-gender",
      "lyric-timestamps",
    ],
    ["id", "prompt"],
  );
  empty(element);

  const hasLyrics = element.attributes.lyrics !== undefined;
  const hasLyricsPrompt = element.attributes["lyrics-prompt"] !== undefined;
  assert(hasLyrics !== hasLyricsPrompt, `${element.name} requires exactly one of lyrics or lyrics-prompt`);

  const textInputs: Array<{ readonly input: ExactModelTextInput; readonly source: SurfaceResolvedReference }> = [
    { input: { name: "prompt", port: "prompt" }, source: textRefAttr(element, "prompt", resolveReference) },
  ];
  if (hasLyrics) {
    textInputs.push({
      input: { name: "lyrics", port: "lyrics" },
      source: textRefAttr(element, "lyrics", resolveReference),
    });
  }
  if (hasLyricsPrompt) {
    textInputs.push({
      input: { name: "lyricsPrompt", port: "lyricsPrompt" },
      source: textRefAttr(element, "lyrics-prompt", resolveReference),
    });
  }
  const hasAbc = element.attributes.abc !== undefined;
  if (hasAbc) {
    textInputs.push({
      input: { name: "abc", port: "abc" },
      source: textRefAttr(element, "abc", resolveReference, 64_000),
    });
  }

  const ports: Record<string, readonly GenerationPortValue[]> = {};
  const cot = optionalTextAttr(element, "cot");
  if (cot !== undefined) {
    const normalizedCot = cot.toLowerCase();
    assert(!(hasAbc && normalizedCot === "off"), `${element.name} cannot combine abc with cot="off"`);
    ports.cot = [normalizedCot];
  }
  const title = optionalTextAttr(element, "title");
  if (title !== undefined) ports.title = [title];
  const tags = optionalTextAttr(element, "tags");
  if (tags !== undefined) ports.tags = [tags];
  const negativeTags = optionalTextAttr(element, "negative-tags");
  if (negativeTags !== undefined) ports.negativeTags = [negativeTags];
  const vocalGender = optionalTextAttr(element, "vocal-gender");
  if (vocalGender !== undefined) ports.vocalGender = [vocalGender];
  if (element.attributes["lyric-timestamps"] !== undefined) {
    ports.lyricTimestamps = [booleanAttr(element, "lyric-timestamps")];
  }

  return output(element, noizAudioEndpoints.music, ports, textInputs);
};

export const decodeNoizMusicCoverSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(
    element,
    [
      "id",
      "source-audio",
      "lyrics",
      "music-description",
      "style",
      "melody-adherence",
      "title",
      "vocal-gender",
      "lyric-timestamps",
    ],
    ["id", "source-audio", "lyrics", "melody-adherence"],
  );
  empty(element);

  const hasDescription = element.attributes["music-description"] !== undefined;
  const style = optionalTextAttr(element, "style");
  assert(hasDescription || style !== undefined, `${element.name} requires either music-description or style`);

  const sourceAudio = audioRefAttr(element, "source-audio", resolveReference);
  const lyrics = textRefAttr(element, "lyrics", resolveReference);
  const textInputs: Array<{ readonly input: ExactModelTextInput; readonly source: SurfaceResolvedReference }> = [
    { input: { name: "lyrics", port: "lyrics" }, source: lyrics },
  ];
  if (hasDescription) {
    textInputs.push({
      input: { name: "musicDescription", port: "musicDescription" },
      source: textRefAttr(element, "music-description", resolveReference),
    });
  }

  const ports: Record<string, readonly GenerationPortValue[]> = {
    melodyAdherence: [textAttr(element, "melody-adherence").toLowerCase()],
  };
  if (style !== undefined) ports.style = [style];
  const title = optionalTextAttr(element, "title");
  if (title !== undefined) ports.title = [title];
  const vocalGender = optionalTextAttr(element, "vocal-gender");
  if (vocalGender !== undefined) ports.vocalGender = [vocalGender];
  if (element.attributes["lyric-timestamps"] !== undefined) {
    ports.lyricTimestamps = [booleanAttr(element, "lyric-timestamps")];
  }

  return output(
    element,
    noizAudioEndpoints.musicCover,
    ports,
    textInputs,
    [{ input: { name: "sourceAudio", port: "sourceAudio" }, source: sourceAudio }],
  );
};
