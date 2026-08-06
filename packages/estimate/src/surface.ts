import { contractTypes } from "@svml/contracts";
import type { CanonicalValue } from "@svml/protocol";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  TextAttributeValue,
} from "@svml/text";

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
  const optional = ["language", "pace", "padding", "min", "max", "rounding"];
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((name) => element.attributes[name] === undefined)
    || Object.keys(element.attributes).some((name) => !allowed.has(name))
  ) {
    throw new Error(`${element.name} requires id and source; optional: ${optional.join(", ")}`);
  }
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty`);
  }
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
  if (result === undefined || !sameType(result.type, contractTypes.narrativeSpeechExcerpt)) {
    throw new Error(`${element.name}.source must reference a NarrativeSpeechExcerpt`);
  }
  return result;
}

export const decodeSpeechEstimateSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element);
  const id = text(element, "id");
  const source = reference(element, resolveReference);
  const language = text(element, "language", "auto") as SpeechEstimateLanguage;
  const pace = text(element, "pace", "normal") as SpeechEstimatePace;
  const rounding = text(element, "rounding", "ceil") as SpeechEstimateRounding;
  const policy = sealSpeechEstimatePolicy({
    contract: "svml.speech-estimate-policy@1",
    language,
    pace,
    paddingSec: number(element, "padding", 0.3),
    minimumSec: number(element, "min", 4),
    maximumSec: number(element, "max", 15),
    rounding,
  });
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
