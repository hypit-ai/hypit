import { artifactTypes } from "@narratage/artifact";
import { contractTypes } from "@narratage/video-contracts";
import type { CanonicalValue, StoredValue } from "@narratage/protocol";
import {
  compilePromptKit,
  promptKitTypes,
  verifyPromptKitSpec,
} from "@narratage/prompt-kit";
import type { PromptKitSpec } from "@narratage/prompt-kit";
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
  TextAttributeValue,
} from "@narratage/text";

import { createSeedanceSpeakerTakeFragment } from "./fragment.js";
import {
  bindSpeakerPromptKit,
  renderSpeakerSpeechProgram,
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
  const value: TextAttributeValue | undefined = element.attributes[name];
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

function blob(reference: SurfaceResolvedReference, subject: string) {
  if (!sameType(reference.type, artifactTypes.blob) || reference.record?.value.kind !== "blob") {
    throw new Error(`${subject} must reference an authored BlobArtifact`);
  }
  return reference.record.value;
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
): PromptKitSpec {
  const reference = resolved(element, "kit", resolveReference);
  if (!sameType(reference.type, promptKitTypes.spec)) {
    throw new Error(`${element.name}.kit must reference a PromptKitSpec`);
  }
  const spec = inline<PromptKitSpec>(reference, `${element.name}.kit`);
  verifyPromptKitSpec(spec);
  return spec;
}

function dialogueValue(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
) {
  const reference = resolved(element, "dialogue", resolveReference);
  if (!sameType(reference.type, contractTypes.narrativeDialogueExcerpt)) {
    throw new Error(`${element.name}.dialogue must reference a NarrativeDialogueExcerpt`);
  }
  const value = inline<{
    readonly contract: string;
    readonly id: string;
    readonly tokenStart: number;
    readonly tokenEndExclusive: number;
    readonly dialogue: string;
  }>(reference, `${element.name}.dialogue`);
  if (
    value.contract !== "svml.narrative-dialogue-excerpt@1"
    || typeof value.id !== "string"
    || !Number.isSafeInteger(value.tokenStart)
    || !Number.isSafeInteger(value.tokenEndExclusive)
    || typeof value.dialogue !== "string"
    || value.dialogue.trim().length === 0
  ) {
    throw new Error(`${element.name}.dialogue is invalid`);
  }
  return value;
}

function references(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SpeakerReference[] {
  const result: SpeakerReference[] = [];
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
    const artifact = blob(resolved(child, kind, resolveReference), `${child.name}.${kind}`);
    if (!artifact.mediaType.startsWith(`${kind}/`)) throw new Error(`${child.name}.${kind} is not ${kind} media`);
    const rawRole = child.attributes.role;
    const role = rawRole === undefined
      ? kind === "image" ? "character-and-scene" : "voice-timbre"
      : typeof rawRole === "string" && rawRole.trim().length > 0
        ? rawRole.trim()
        : (() => { throw new Error(`${child.name}.role must be a non-empty string`); })();
    result.push({ kind, artifact, role });
  }
  return result;
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
  attributes(element, ["id", "dialogue", "duration", "recipe", "kit"]);
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
  const dialogue = dialogueValue(element, resolveReference);
  const refs = references(element, resolveReference);
  const optionalPrompt = (name: "action" | "extra") => {
    const value = recipe.properties[name];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Speaker Recipe ${recipe.path}.${name} must be a non-empty string`);
    }
    return value.trim();
  };
  const actionPrompt = optionalPrompt("action");
  const extraPrompt = optionalPrompt("extra");
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
    kit: kit.id,
    recipe: { path: recipe.path },
    model: selectedModel,
    resolution: recipeString(recipe, "resolution", speakerMethodDefaults.resolution) as "480p" | "720p" | "1080p",
    aspectRatio: recipeString(recipe, "aspect-ratio", speakerMethodDefaults.aspectRatio) as "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9" | "adaptive",
    webSearch: recipeBoolean(recipe, "web-search", speakerMethodDefaults.webSearch),
    promptParameters,
    segment: {
      dialogue: dialogue.dialogue,
    },
    references: refs,
    ...(actionPrompt === undefined ? {} : { actionPrompt }),
    ...(extraPrompt === undefined ? {} : { extraPrompt }),
  });
  // All static Kit semantics are lowered here; Runtime never sees axes, defaults or branches.
  const prompt = compilePromptKit(kit, bindSpeakerPromptKit(intent));
  const program = renderSpeakerSpeechProgram(prompt, intent);
  const duration = resolved(element, "duration", resolveReference);
  if (!sameType(duration.type, contractTypes.speechDuration)) {
    throw new Error(`${element.name}.duration must reference a SpeechDuration`);
  }
  const promptId = `${id}.prompt`;
  const programId = `${id}.program`;
  const fragment = createSeedanceSpeakerTakeFragment(
    seedanceEndpointsByModel[selectedModel],
    seedanceSpeechCompileProducers[selectedModel],
  );
  return {
    records: [{
      id: promptId,
      type: promptKitTypes.program,
      value: { kind: "inline", value: prompt as unknown as CanonicalValue },
      range: element.range,
    }, {
      id: programId,
      type: seedanceTypes.speechProgram,
      value: { kind: "inline", value: program as unknown as CanonicalValue },
      range: element.range,
    }],
    components: [{
      id,
      fragment: fragment.id,
      inputs: {
        program: { kind: "record", id: programId },
        duration: duration.ref,
      },
      outputs: {
        video: `${id}.video`,
      },
      range: element.range,
    }],
    fragments: [fragment],
  };
};
