import { captionTypes } from "@svml/caption";
import { contractTypes } from "@svml/contracts";
import type {
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  TextAttributeValue,
} from "@svml/text";

import { captionGeminiPlanningFragment } from "./fragment.js";
import { captionGeminiTypes } from "./manifest.js";
import { sealCaptionGeminiProgram } from "./program.js";
import type { CaptionGeminiModel } from "./types.js";

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function reference(
  element: Parameters<StructuredSurfaceHandler>[0]["element"],
  name: string,
  expected: SurfaceResolvedReference["type"],
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const raw: TextAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${element.name}.${name} must be a whole-value reference`);
  const value = resolve(raw.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`${element.name}.${name} cannot resolve the required type`);
  return value;
}

export const decodeCaptionGeminiPlannerSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const required = ["id", "narrative", "program", "model"];
  if (required.some((name) => element.attributes[name] === undefined)
    || Object.keys(element.attributes).some((name) => !required.includes(name))) {
    throw new Error(`${element.name} requires ${required.join(", ")}`);
  }
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} does not accept children`);
  }
  const id = element.attributes.id;
  const model = element.attributes.model;
  if (typeof id !== "string" || !id.trim()) throw new Error(`${element.name}.id must be a non-empty string`);
  if (model !== "gemini-2.5-flash" && model !== "gemini-3.1-pro-preview") {
    throw new Error(`${element.name}.model is unsupported`);
  }
  const narrative = reference(element, "narrative", contractTypes.narrative, resolveReference);
  const captionProgram = reference(element, "program", captionTypes.program, resolveReference);
  const optionsId = `${id}.gemini`;
  const options = sealCaptionGeminiProgram({
    contract: "svml.caption-gemini-program@1",
    model: model as CaptionGeminiModel,
  });
  return {
    records: [{ id: optionsId, type: captionGeminiTypes.program, value: { kind: "inline", value: options }, range: element.range }],
    components: [{
      id,
      fragment: captionGeminiPlanningFragment.id,
      inputs: {
        narrative: narrative.ref,
        captionProgram: captionProgram.ref,
        program: { kind: "record", id: optionsId },
      },
      outputs: { plan: `${id}.plan` },
      range: element.range,
    }],
    fragments: [captionGeminiPlanningFragment],
  };
};
