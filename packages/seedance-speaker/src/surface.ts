import { speechTypes } from "@narratage/speech";
import type { SpeechDuration } from "@narratage/speech";
import { artifactTypes } from "@narratage/artifact";
import type { CanonicalValue, StoredValue } from "@narratage/protocol";
import { generationPort, sealGenerationMediaBinding } from "@narratage/generation";
import type { GenerationMediaPort } from "@narratage/generation";
import { exactModelMediaInputNames, exactModelTextInputName } from "@narratage/model-kit";
import type { ExactModelEndpoint, ExactModelMediaInput } from "@narratage/model-kit";
import {
  createTextRenderFragment,
  sealTextBinding,
  textTypes,
  verifyText,
  verifyTextTemplate,
} from "@narratage/text";
import type { TextTemplate } from "@narratage/text";
import {
  seedanceEndpointsByModel,
  seedanceSpeechCompileProducers,
  seedanceTypes,
} from "@narratage/seedance";
import type { SeedanceModel } from "@narratage/seedance";
import { svsRecipeType } from "@narratage/svs";
import type { SvsRecipe } from "@narratage/svs";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@narratage/markup";

import { createSeedanceSpeakerTakeFragment } from "./fragment.js";
import {
  createSpeakerSpeechProgram,
  createSpeakerTextBindings,
  sealSpeakerTakeIntent,
  speakerMethodDefaults,
} from "./kit.js";
import type { SpeakerReference } from "./types.js";

function localName(value: string): string {
  return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
}

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

function attributes(element: StructuredElement, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.has(name));
  if (unknown.length > 0 || required.some((name) => element.attributes[name] === undefined)) {
    throw new Error(
      `${element.name} requires ${required.join(", ")}`
      + (optional.length === 0 ? "" : `; optional: ${optional.join(", ")}`),
    );
  }
}

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be a non-empty string`);
  }
  return value.trim();
}

function referencePath(element: StructuredElement, name: string): string {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference" || value.path.length === 0) {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  return value.path;
}

function resolved(
  element: StructuredElement,
  name: string,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const path = referencePath(element, name);
  const value = resolveReference(path);
  if (value === undefined) throw new Error(`${element.name}.${name} cannot resolve ${path}`);
  return value;
}

function inline<T>(reference: SurfaceResolvedReference, subject: string): T {
  const value: StoredValue | undefined = reference.record?.value;
  if (value?.kind !== "inline") throw new Error(`${subject} must reference an authored inline value`);
  return value.value as unknown as T;
}

function mediaReference(reference: SurfaceResolvedReference, kind: "image" | "audio", subject: string) {
  if (!sameType(reference.type, artifactTypes.blob)) {
    throw new Error(`${subject} must reference a BlobArtifact`);
  }
  const value = reference.record?.value;
  if (value !== undefined && (value.kind !== "blob" || !value.mediaType.startsWith(`${kind}/`))) {
    throw new Error(`${subject} is not ${kind} media`);
  }
  return reference;
}

function recipeValue(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
) {
  const reference = resolved(element, "recipe", resolveReference);
  if (!sameType(reference.type, svsRecipeType)) {
    throw new Error(`${element.name}.recipe must reference an SVS Recipe`);
  }
  const recipe = inline<SvsRecipe>(reference, `${element.name}.recipe`);
  if (recipe.contract !== "svml.svs-recipe@1") throw new Error(`${element.name}.recipe is invalid`);
  return recipe;
}

function kitValue(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): { readonly reference: SurfaceResolvedReference; readonly template: TextTemplate } {
  const reference = resolved(element, "kit", resolveReference);
  if (!sameType(reference.type, textTypes.template)) {
    throw new Error(`${element.name}.kit must reference a TextTemplate`);
  }
  const template = inline<TextTemplate>(reference, `${element.name}.kit`);
  verifyTextTemplate(template);
  return { reference, template };
}

function optionalTextValue(
  element: StructuredElement,
  name: string,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference | undefined {
  if (element.attributes[name] === undefined) return undefined;
  const reference = resolved(element, name, resolveReference);
  if (!sameType(reference.type, textTypes.text)) {
    throw new Error(`${element.name}.${name} must reference Text`);
  }
  const value = reference.record?.value;
  if (value !== undefined) {
    if (value.kind !== "inline") throw new Error(`${element.name}.${name} has an invalid authored Text value`);
    verifyText(value.value);
  }
  return reference;
}

function requiredTextValue(
  element: StructuredElement,
  name: string,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
) {
  const reference = resolved(element, name, resolveReference);
  if (!sameType(reference.type, textTypes.text)) {
    throw new Error(`${element.name}.${name} must reference Text`);
  }
  const value = reference.record?.value;
  if (value !== undefined) {
    if (value.kind !== "inline") throw new Error(`${element.name}.${name} has an invalid authored Text value`);
    verifyText(value.value);
  }
  return reference;
}

type ResolvedSpeakerReference = SpeakerReference & { readonly source: SurfaceResolvedReference };

function references(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): ResolvedSpeakerReference[] {
  const result: ResolvedSpeakerReference[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Reference children`);
      continue;
    }
    if (localName(child.name) !== "Reference") throw new Error(`${element.name} accepts only Reference children`);
    attributes(child, [], ["image", "audio", "role"]);
    const kinds = (["image", "audio"] as const).filter((kind) => child.attributes[kind] !== undefined);
    if (kinds.length !== 1) throw new Error(`${child.name} requires exactly one of image or audio`);
    const kind = kinds[0]!;
    const source = mediaReference(resolved(child, kind, resolveReference), kind, `${child.name}.${kind}`);
    const rawRole = child.attributes.role;
    const role = rawRole === undefined
      ? kind === "image" ? "character-and-scene" : "voice-timbre"
      : typeof rawRole === "string" && rawRole.trim().length > 0
        ? rawRole.trim()
        : (() => { throw new Error(`${child.name}.role must be a non-empty string`); })();
    result.push({ kind, source, role });
  }
  return result;
}

function assembledReferences(
  id: string,
  endpoint: ExactModelEndpoint,
  values: readonly ResolvedSpeakerReference[],
  range: StructuredElement["range"],
) {
  const mediaInputs: ExactModelMediaInput[] = [];
  const records: Array<{
    readonly id: string;
    readonly type: SurfaceResolvedReference["type"];
    readonly value: { readonly kind: "inline"; readonly value: CanonicalValue };
    readonly range: StructuredElement["range"];
  }> = [];
  const inputs: Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {};
  values.forEach((value, index) => {
    const name = `media-${String(index + 1).padStart(4, "0")}`;
    const portName = value.kind === "image" ? "referenceImage" : "referenceAudio";
    const endpointBinding = endpoint.mediaBindings[portName];
    if (endpointBinding === undefined) throw new Error(`${endpoint.ports.model} has no media port ${portName}`);
    const port = generationPort(endpoint.ports, portName);
    if (port.value.kind !== "media") throw new Error(`${endpoint.ports.model} port ${portName} is not media`);
    const bindingId = `${id}.${name}.binding`;
    records.push({
      id: bindingId,
      type: endpointBinding.type,
      value: {
        kind: "inline",
        value: sealGenerationMediaBinding(port as GenerationMediaPort, { role: value.kind }) as unknown as CanonicalValue,
      },
      range,
    });
    const names = exactModelMediaInputNames(name);
    inputs[names.binding] = { kind: "record", id: bindingId };
    inputs[names.artifact] = value.source.ref;
    mediaInputs.push({ name, port: portName });
  });
  return { mediaInputs, records, inputs };
}

function recipeString(
  recipe: SvsRecipe,
  name: string,
  fallback: string,
): string {
  const value = recipe.properties[name] ?? fallback;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Speaker Recipe ${recipe.path}.${name} must be a non-empty string`);
  }
  return value.trim();
}

function recipeBoolean(recipe: SvsRecipe, name: string, fallback: boolean): boolean {
  const value = recipe.properties[name] ?? fallback;
  if (typeof value !== "boolean") throw new Error(`Speaker Recipe ${recipe.path}.${name} must be boolean`);
  return value;
}

function model(recipe: SvsRecipe): SeedanceModel {
  const value = recipeString(recipe, "model", "mini");
  if (value === "mini" || value === "seedance-2-mini") return "seedance-2-mini";
  if (value === "fast" || value === "seedance-2-fast") return "seedance-2-fast";
  if (value === "standard" || value === "seedance-2") return "seedance-2";
  throw new Error(`Speaker Recipe ${recipe.path}.model is not supported`);
}

export const decodeSeedanceSpeakerTakeSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "dialogue", "duration", "recipe", "kit"], ["action", "extra"]);
  const id = stringAttribute(element, "id");
  const kit = kitValue(element, resolveReference);
  const recipe = recipeValue(element, resolveReference);
  const reserved = new Set([
    "kind", "model", "resolution", "aspect-ratio", "web-search", "action", "extra",
  ]);
  if (recipeString(recipe, "kind", "ugc-talking-head") !== "ugc-talking-head") {
    throw new Error(`Speaker Recipe ${recipe.path}.kind must be ugc-talking-head`);
  }
  const selectedModel = model(recipe);
  const dialogue = requiredTextValue(element, "dialogue", resolveReference);
  const action = optionalTextValue(element, "action", resolveReference);
  const extra = optionalTextValue(element, "extra", resolveReference);
  const refs = references(element, resolveReference);
  for (const name of ["action", "extra"] as const) {
    if (recipe.properties[name] !== undefined) {
      throw new Error(`Speaker Recipe ${recipe.path}.${name} is content; pass it through ${element.name}.${name} as Text`);
    }
  }
  const promptParameters: Record<string, CanonicalValue> = {};
  for (const [name, value] of Object.entries(recipe.properties)) {
    if (reserved.has(name)) continue;
    if (typeof value !== "string" && typeof value !== "boolean" && !(typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`Speaker Recipe ${recipe.path}.${name} must be a finite scalar`);
    }
    promptParameters[name] = value;
  }
  const intent = sealSpeakerTakeIntent({
    contract: "svml.seedance-speaker-take-intent@1",
    kit: kit.reference.path.split(".").at(-1) ?? "speaker-kit",
    recipe: { path: recipe.path },
    model: selectedModel,
    resolution: recipeString(recipe, "resolution", speakerMethodDefaults.resolution) as "480p" | "720p" | "1080p",
    aspectRatio: recipeString(recipe, "aspect-ratio", speakerMethodDefaults.aspectRatio) as "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9" | "adaptive",
    webSearch: recipeBoolean(recipe, "web-search", speakerMethodDefaults.webSearch),
    promptParameters,
    references: refs.map(({ source: _source, ...reference }) => reference),
  });
  const bindings = createSpeakerTextBindings(intent);
  // Static template semantics remain an ordinary deterministic graph step.
  const program = createSpeakerSpeechProgram(intent);
  const duration = resolved(element, "duration", resolveReference);
  if (!sameType(duration.type, speechTypes.duration)) {
    throw new Error(`${element.name}.duration must reference a SpeechDuration`);
  }
  const bindingsId = `${id}.bindings`;
  const programId = `${id}.program`;
  const endpoint = seedanceEndpointsByModel[selectedModel];
  const assembled = assembledReferences(id, endpoint, refs, element.range);
  const dynamicText = [
    { name: "dialogue", source: dialogue.ref },
    ...(action === undefined ? [] : [{ name: "action", source: action.ref }]),
    ...(extra === undefined ? [] : [{ name: "extra", source: extra.ref }]),
  ];
  const promptFragment = createTextRenderFragment(dynamicText.map(({ name }) => ({ name })));
  const generationFragment = createSeedanceSpeakerTakeFragment(
    endpoint,
    seedanceSpeechCompileProducers[selectedModel],
    assembled.mediaInputs,
  );
  return {
    records: [{
      id: bindingsId,
      type: textTypes.bindings,
      value: { kind: "inline", value: bindings as unknown as CanonicalValue },
      range: element.range,
    }, {
      id: programId,
      type: seedanceTypes.speechSpine,
      value: { kind: "inline", value: program as unknown as CanonicalValue },
      range: element.range,
    }, ...dynamicText.map(({ name }) => ({
      id: `${id}.${name}-binding`,
      type: textTypes.binding,
      value: {
        kind: "inline" as const,
        value: sealTextBinding({ name, mode: "set" }) as unknown as CanonicalValue,
      },
      range: element.range,
    })), ...assembled.records],
    components: [{
      id: `${id}.render-prompt`,
      fragment: promptFragment.id,
      inputs: {
        template: kit.reference.ref,
        bindings: { kind: "record", id: bindingsId },
        ...Object.fromEntries(dynamicText.flatMap(({ name, source }) => [[
          `binding:${name}:spec`, { kind: "record" as const, id: `${id}.${name}-binding` },
        ], [
          `binding:${name}:text`, source,
        ]])),
      },
      outputs: { text: `${id}.prompt` },
      range: element.range,
    }, {
      id,
      fragment: generationFragment.id,
      inputs: {
        program: { kind: "record", id: programId },
        duration: duration.ref,
        [exactModelTextInputName("prompt")]: {
          kind: "component-output",
          component: `${id}.render-prompt`,
          output: "text",
        },
        ...assembled.inputs,
      },
      outputs: {
        video: `${id}.video`,
      },
      range: element.range,
    }],
    fragments: [promptFragment, generationFragment],
  };
};
