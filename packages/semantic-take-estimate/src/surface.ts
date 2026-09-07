import { estimateTypes, speechEstimatePolicyFromAttributes, speechEstimatePolicyFromRecipe, speechEstimatePolicyProperties } from "@hypit/estimate";
import type { SpeechEstimatePolicy } from "@hypit/estimate";
import { textAttribute } from "@hypit/markup";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@hypit/markup";
import { mediaTypes } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import type { NarrativeExcerpt } from "@hypit/narrative";
import type { CanonicalValue } from "@hypit/protocol";
import { sameType } from "@hypit/protocol";
import { svsRecipeType } from "@hypit/svs";
import type { SvsRecipe } from "@hypit/svs";

import { semanticTakeEstimateBoundaryFragment, semanticTakeEstimateFragment } from "./fragment.js";

function reference(
  element: StructuredElement,
  name: string,
  expected: SurfaceResolvedReference["type"],
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const raw: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  const resolved = resolveReference(raw.path);
  if (resolved === undefined) throw new Error(`${element.name}.${name} cannot resolve ${raw.path}`);
  if (!sameType(resolved.type, expected)) throw new Error(`${element.name}.${name} has the wrong type`);
  return resolved;
}

function authoredExcerpt(value: SurfaceResolvedReference): NarrativeExcerpt | undefined {
  return value.record?.value.kind === "inline"
    ? value.record.value.value as unknown as NarrativeExcerpt
    : undefined;
}

/**
 * The delivery policy the estimate weights Tokens with: an SVS Recipe named by `policy`, or the same
 * properties written inline. The element owns its policy; nothing elsewhere in the graph computes it.
 */
function policyOf(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SpeechEstimatePolicy {
  const inline = speechEstimatePolicyProperties.filter((name) => element.attributes[name] !== undefined);
  if (element.attributes.policy !== undefined) {
    if (inline.length > 0) throw new Error(`${element.name}.policy cannot be combined with ${inline.join(", ")}`);
    const resolved = reference(element, "policy", svsRecipeType, resolveReference);
    const value = resolved.record?.value;
    if (value?.kind !== "inline") throw new Error(`${element.name}.policy must reference an authored SVS Recipe`);
    return speechEstimatePolicyFromRecipe(value.value as unknown as SvsRecipe, `${element.name}.policy`);
  }
  const attributes = Object.fromEntries(inline.map((name) => [name, element.attributes[name]]));
  return speechEstimatePolicyFromAttributes(attributes, element.name);
}

export const decodeSemanticTakeEstimateSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const required = ["id", "narrative", "segment", "media"];
  const missing = required.filter((name) => element.attributes[name] === undefined);
  if (missing.length > 0) {
    throw new Error(`${element.name} requires ${required.join(", ")}`);
  }
  const narrative = reference(element, "narrative", narrativeTypes.narrative, resolveReference);
  const segment = reference(element, "segment", narrativeTypes.excerpt, resolveReference);
  const media = reference(element, "media", mediaTypes.synchronized, resolveReference);
  const excerpt = authoredExcerpt(segment);
  const hasNoTokens = excerpt !== undefined && excerpt.tokenStart === excerpt.tokenEndExclusive;
  const allowed = new Set(hasNoTokens ? required : [...required, "policy", ...speechEstimatePolicyProperties]);
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.has(name));
  if (unknown.length > 0) {
    throw new Error(`${element.name} has unknown or inapplicable attributes ${unknown.join(", ")}`);
  }
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty`);
  }
  const id = textAttribute(element, "id");
  if (hasNoTokens) {
    return {
      records: [],
      components: [{
        id,
        fragment: semanticTakeEstimateBoundaryFragment.id,
        inputs: { narrative: narrative.ref, segment: segment.ref, media: media.ref },
        outputs: { take: `${id}.take` },
        range: element.range,
      }],
      fragments: [semanticTakeEstimateBoundaryFragment],
    };
  }
  const policyId = `${id}.policy`;
  return {
    records: [{
      id: policyId,
      type: estimateTypes.speechPolicy,
      value: { kind: "inline", value: policyOf(element, resolveReference) as unknown as CanonicalValue },
      range: element.range,
    }],
    components: [{
      id,
      fragment: semanticTakeEstimateFragment.id,
      inputs: {
        narrative: narrative.ref,
        segment: segment.ref,
        media: media.ref,
        policy: { kind: "record", id: policyId },
      },
      outputs: { take: `${id}.take` },
      range: element.range,
    }],
    fragments: [semanticTakeEstimateFragment],
  };
};
