import { narrativeTypes } from "@narratage/narrative";
import type { NarrativeSpeechExcerpt } from "@narratage/narrative";
import type { CanonicalValue } from "@narratage/protocol";
import { svsRecipeType } from "@narratage/svs";
import type { SvsRecipe } from "@narratage/svs";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  TextAttributeValue,
} from "@narratage/text";

import { speechEstimateFragment } from "./fragment.js";
import { estimateTypes } from "./manifest.js";
import { sealSpeechEstimatePolicy } from "./program.js";
import type {
  SpeechEstimateLanguage,
  SpeechEstimatePace,
  SpeechEstimateRounding,
} from "./types.js";

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function attributes(element: StructuredElement): void {
  const required = ["id", "source"];
  const direct = ["language", "pace", "padding", "min", "max", "rounding"];
  const optional = ["policy", ...direct];
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((name) => element.attributes[name] === undefined)
    || Object.keys(element.attributes).some((name) => !allowed.has(name))
  ) {
    throw new Error(`${element.name} requires id and source; optional: ${optional.join(", ")}`);
  }
  if (element.attributes.policy !== undefined && direct.some((name) => element.attributes[name] !== undefined)) {
    throw new Error(`${element.name}.policy cannot be combined with inline estimate parameters`);
  }
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty`);
  }
}

function wholeReference(element: StructuredElement, name: string): string {
  const raw: TextAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference" || raw.path.length === 0) {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  return raw.path;
}

function inline<T>(reference: SurfaceResolvedReference, subject: string): T {
  const value = reference.record?.value;
  if (value?.kind !== "inline") throw new Error(`${subject} must reference an authored inline value`);
  return value.value as unknown as T;
}

function recipePolicy(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
) {
  const path = wholeReference(element, "policy");
  const reference = resolveReference(path);
  if (reference === undefined || !sameType(reference.type, svsRecipeType)) {
    throw new Error(`${element.name}.policy must reference an SVS Recipe`);
  }
  const recipe = inline<SvsRecipe>(reference, `${element.name}.policy`);
  if (recipe.contract !== "svml.svs-recipe@1") throw new Error(`${element.name}.policy Recipe is invalid`);
  return speechEstimatePolicyFromRecipe(recipe, `${element.name}.policy`);
}

export function speechEstimatePolicyFromRecipe(
  recipe: SvsRecipe,
  subject = `SVS Recipe ${recipe.path}`,
) {
  if (recipe.contract !== "svml.svs-recipe@1") throw new Error(`${subject} is invalid`);
  const allowed = new Set(["language", "pace", "padding", "min", "max", "rounding"]);
  const unknown = Object.keys(recipe.properties).filter((name) => !allowed.has(name));
  if (unknown.length > 0) throw new Error(`${subject} contains unknown property ${unknown[0]}`);
  const string = (name: string, fallback: string): string => {
    const value = recipe.properties[name] ?? fallback;
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${subject}.${name} must be a non-empty string`);
    }
    return value.trim();
  };
  const finite = (name: string, fallback: number): number => {
    const value = recipe.properties[name] ?? fallback;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${subject}.${name} must be a finite number`);
    }
    return value;
  };
  return sealSpeechEstimatePolicy({
    contract: "svml.speech-estimate-policy@1",
    language: string("language", "auto") as SpeechEstimateLanguage,
    pace: string("pace", "normal") as SpeechEstimatePace,
    paddingSec: finite("padding", 0.3),
    minimumSec: finite("min", 4),
    maximumSec: finite("max", 15),
    rounding: string("rounding", "ceil") as SpeechEstimateRounding,
  });
}

function text(element: StructuredElement, name: string, fallback?: string): string {
  const value = element.attributes[name] ?? fallback;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be a non-empty string`);
  }
  return value.trim();
}

function number(element: StructuredElement, name: string, fallback: number): number {
  const value = Number(text(element, name, String(fallback)));
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be a finite number`);
  return value;
}

function reference(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const raw: TextAttributeValue | undefined = element.attributes.source;
  if (typeof raw !== "object" || raw.kind !== "reference") {
    throw new Error(`${element.name}.source must be a whole-value reference`);
  }
  const result = resolveReference(raw.path);
  if (result === undefined || !sameType(result.type, narrativeTypes.speechExcerpt)) {
    throw new Error(`${element.name}.source must reference a NarrativeSpeechExcerpt`);
  }
  return result;
}

export const decodeSpeechEstimateSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element);
  const id = text(element, "id");
  const source = reference(element, resolveReference);
  const policy = element.attributes.policy === undefined
    ? sealSpeechEstimatePolicy({
        contract: "svml.speech-estimate-policy@1",
        language: text(element, "language", "auto") as SpeechEstimateLanguage,
        pace: text(element, "pace", "normal") as SpeechEstimatePace,
        paddingSec: number(element, "padding", 0.3),
        minimumSec: number(element, "min", 4),
        maximumSec: number(element, "max", 15),
        rounding: text(element, "rounding", "ceil") as SpeechEstimateRounding,
      })
    : recipePolicy(element, resolveReference);
  const policyId = `${id}.policy`;
  return {
    records: [{
      id: policyId,
      type: estimateTypes.speechPolicy,
      value: { kind: "inline", value: policy as unknown as CanonicalValue },
      range: element.range,
    }],
    components: [{
      id,
      fragment: speechEstimateFragment.id,
      inputs: {
        speech: source.ref,
        policy: { kind: "record", id: policyId },
      },
      outputs: { duration: `${id}.duration` },
      range: element.range,
    }],
    fragments: [speechEstimateFragment],
  };
};
