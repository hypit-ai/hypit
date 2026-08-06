import { contractTypes } from "@svml/contracts";
import type { Narrative, NarrativeSelectionRef } from "@svml/contracts";
import { svsRecipeType } from "@svml/svs";
import type { SvsRecipe } from "@svml/svs";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  TextAttributeValue,
} from "@svml/text";

import { captionTrackSurfaceFragment, plannedCaptionTrackSurfaceFragment } from "./fragment.js";
import { captionTypes } from "./manifest.js";
import { sealCaptionTrackProgram } from "./track.js";
import { resolveCaptionProgram, sealCaptionStyle } from "./style.js";
import type { CaptionStyleApplication } from "./style.js";
import type {
  CaptionFieldDeclaration,
  CaptionFieldValueSchema,
  CaptionPresentationMode,
  CaptionStyleIntent,
} from "./types.js";

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function attributes(element: StructuredElement, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(element.attributes);
  if (required.some((name) => element.attributes[name] === undefined) || actual.some((name) => !allowed.has(name))) {
    throw new Error(`${element.name} requires ${required.join(", ")}${optional.length ? `; optional: ${optional.join(", ")}` : ""}`);
  }
}

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be a non-empty string`);
  return value.trim();
}

function reference(
  element: StructuredElement,
  name: string,
  expected: SurfaceResolvedReference["type"],
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const raw: TextAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${element.name}.${name} must be a whole-value reference`);
  const value = resolveReference(raw.path);
  if (value === undefined) throw new Error(`${element.name}.${name} cannot resolve ${raw.path}`);
  if (!sameType(value.type, expected)) throw new Error(`${element.name}.${name} has the wrong type`);
  return value;
}

function recipe(reference: SurfaceResolvedReference): SvsRecipe {
  if (!sameType(reference.type, svsRecipeType) || reference.record?.value.kind !== "inline") {
    throw new Error("Caption appearance must reference an authored SVS Recipe");
  }
  return reference.record.value.value as unknown as SvsRecipe;
}

function number(value: SvsRecipe, name: string): number {
  const property = value.properties[name];
  if (typeof property !== "number" || !Number.isFinite(property)) throw new Error(`Caption Recipe ${name} must be a number`);
  return property;
}

function integer(value: SvsRecipe, name: string): number {
  const property = number(value, name);
  if (!Number.isSafeInteger(property)) throw new Error(`Caption Recipe ${name} must be an integer`);
  return property;
}

function string(value: SvsRecipe, name: string): string {
  const property = value.properties[name];
  if (typeof property !== "string" || !property.trim()) throw new Error(`Caption Recipe ${name} must be a string`);
  return property.trim();
}

function padding(value: string): { readonly x: number; readonly y: number } {
  const parts = value.trim().split(/\s+/u).map(Number);
  if ((parts.length !== 1 && parts.length !== 2) || parts.some((item) => !Number.isFinite(item) || item < 0)) {
    throw new Error("Caption Recipe padding must contain one or two non-negative pixel numbers");
  }
  return { y: parts[0]!, x: parts[1] ?? parts[0]! };
}

function mode(element: StructuredElement): CaptionPresentationMode {
  const value = element.attributes.mode;
  if (value === undefined) return "whole";
  if (typeof value === "string" && ["whole", "proportional-word", "character-flow"].includes(value)) {
    return value as CaptionPresentationMode;
  }
  throw new Error(`${element.name}.mode is invalid`);
}

function inline<T>(reference: SurfaceResolvedReference, subject: string): T {
  if (reference.record?.value.kind !== "inline") throw new Error(`${subject} must reference an authored inline Record`);
  return reference.record.value.value as unknown as T;
}

function localName(name: string): string {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
}

function body(element: StructuredElement): string {
  if (element.children.some((child) => child.kind === "element")) throw new Error(`${element.name} accepts only natural-language text`);
  const value = element.children.map((child) => child.kind === "text" ? child.value : "").join("").trim();
  if (!value) throw new Error(`${element.name} instruction is empty`);
  return value.replace(/\s+/gu, " ");
}

function optionalString(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be a non-empty string`);
  return value.trim();
}

function nonNegativeInteger(element: StructuredElement, name: string): number {
  const value = Number(stringAttribute(element, name));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${element.name}.${name} must be a non-negative integer`);
  return value;
}

function fieldValue(element: StructuredElement): CaptionFieldValueSchema {
  const type = stringAttribute(element, "type");
  if (type === "boolean") return { kind: "boolean" };
  if (type === "enum") {
    const values = stringAttribute(element, "values").split(",").map((item) => item.trim()).filter(Boolean);
    if (!values.length) throw new Error(`${element.name}.values is empty`);
    return { kind: "enum", values };
  }
  if (type === "number") {
    const minimum = optionalString(element, "minimum");
    const maximum = optionalString(element, "maximum");
    const min = minimum === undefined ? undefined : Number(minimum);
    const max = maximum === undefined ? undefined : Number(maximum);
    if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max))) {
      throw new Error(`${element.name} number bounds must be finite`);
    }
    return { kind: "number", ...(min === undefined ? {} : { minimum: min }), ...(max === undefined ? {} : { maximum: max }) };
  }
  throw new Error(`${element.name}.type must be boolean, enum or number`);
}

function captionAppearance(element: StructuredElement, value: SvsRecipe) {
  const expected = ["align", "background", "fill", "font", "line-height", "padding", "radius", "size", "stack-order", "weight", "width", "x", "y"];
  if (Object.keys(value.properties).sort().join("\u0000") !== expected.sort().join("\u0000")) {
    throw new Error(`Caption Recipe requires exactly ${expected.join(", ")}`);
  }
  const align = string(value, "align");
  if (align !== "left" && align !== "center" && align !== "right") throw new Error("Caption Recipe align is invalid");
  const pad = padding(string(value, "padding"));
  return {
    mode: mode(element),
    stackingOrder: integer(value, "stack-order"),
    style: {
      fontFamily: string(value, "font"),
      fontSizePx: number(value, "size"),
      fontWeight: integer(value, "weight"),
      color: string(value, "fill"),
      backgroundColor: string(value, "background"),
      paddingXPx: pad.x,
      paddingYPx: pad.y,
      borderRadiusPx: number(value, "radius"),
      bottomPercent: 0,
      maxWidthPercent: number(value, "width") * 100,
      leftPercent: number(value, "x") * 100,
      topPercent: number(value, "y") * 100,
      widthPercent: number(value, "width") * 100,
      lineHeight: number(value, "line-height"),
      textAlign: align,
    },
  } as const;
}

export const decodeCaptionStyleSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "appearance"], ["mode"]);
  const id = stringAttribute(element, "id");
  const appearance = recipe(reference(element, "appearance", svsRecipeType, resolveReference));
  let cueInstruction: string | undefined;
  const fields: CaptionFieldDeclaration[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Cues and Field children`);
      continue;
    }
    if (localName(child.name) === "Cues") {
      attributes(child, []);
      if (cueInstruction !== undefined) throw new Error(`${element.name} repeats Cues`);
      cueInstruction = body(child);
    } else if (localName(child.name) === "Field") {
      attributes(child, ["id", "type", "min-per-cue", "max-per-cue"], ["values", "minimum", "maximum"]);
      fields.push({
        id: stringAttribute(child, "id"),
        value: fieldValue(child),
        instruction: body(child),
        minimumPerCue: nonNegativeInteger(child, "min-per-cue"),
        maximumPerCue: nonNegativeInteger(child, "max-per-cue"),
      });
    } else {
      throw new Error(`${element.name} accepts only Cues and Field children`);
    }
  }
  if (cueInstruction === undefined) throw new Error(`${element.name} requires one Cues instruction`);
  const style = sealCaptionStyle({
    contract: "svml.caption-style@1",
    id,
    planning: { cueInstruction, fields },
    presentation: captionAppearance(element, appearance),
  });
  return {
    records: [{ id, type: captionTypes.style, value: { kind: "inline", value: style }, range: element.range }],
    components: [],
    fragments: [],
  };
};

export const decodeCaptionProgramSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "narrative", "default"]);
  const id = stringAttribute(element, "id");
  const narrativeRef = reference(element, "narrative", contractTypes.narrative, resolveReference);
  const defaultRef = reference(element, "default", captionTypes.style, resolveReference);
  const applications: CaptionStyleApplication[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Use children`);
      continue;
    }
    if (localName(child.name) !== "Use") throw new Error(`${element.name} accepts only Use children`);
    attributes(child, ["style"], ["role", "on"]);
    const role = optionalString(child, "role");
    const on = child.attributes.on;
    if ((role === undefined) === (on === undefined)) throw new Error(`${child.name} requires exactly one of role or on`);
    const styleRef = reference(child, "style", captionTypes.style, resolveReference);
    const selector = role !== undefined
      ? { kind: "role" as const, role }
      : {
          kind: "selection" as const,
          selection: inline<NarrativeSelectionRef>(
            reference(child, "on", contractTypes.narrativeSelection, resolveReference),
            `${child.name}.on`,
          ),
        };
    applications.push({
      id: `${id}.use.${applications.length + 1}`,
      selector,
      style: inline<CaptionStyleIntent>(styleRef, `${child.name}.style`),
    });
  }
  const program = resolveCaptionProgram(
    inline<Narrative>(narrativeRef, `${element.name}.narrative`),
    id,
    inline<CaptionStyleIntent>(defaultRef, `${element.name}.default`),
    applications,
  );
  return {
    records: [{ id, type: captionTypes.program, value: { kind: "inline", value: program }, range: element.range }],
    components: [],
    fragments: [],
  };
};

export const decodeCaptionTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  if (element.attributes.program !== undefined) {
    attributes(element, ["id", "narrative", "map", "program", "plan"]);
    if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
      throw new Error(`${element.name} with a Caption Program does not accept children`);
    }
    const id = stringAttribute(element, "id");
    const narrative = reference(element, "narrative", contractTypes.narrative, resolveReference);
    const map = reference(element, "map", contractTypes.completeSemanticMap, resolveReference);
    const program = reference(element, "program", captionTypes.program, resolveReference);
    const plan = reference(element, "plan", captionTypes.plan, resolveReference);
    return {
      records: [],
      components: [{
        id,
        fragment: plannedCaptionTrackSurfaceFragment.id,
        inputs: { narrative: narrative.ref, map: map.ref, program: program.ref, plan: plan.ref },
        outputs: { track: `${id}.track` },
        range: element.range,
      }],
      fragments: [plannedCaptionTrackSurfaceFragment],
    };
  }
  attributes(element, ["id", "narrative", "map", "appearance"], ["mode"]);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} provider-free base does not accept Role children`);
  }
  const id = stringAttribute(element, "id");
  const narrative = reference(element, "narrative", contractTypes.narrative, resolveReference);
  const map = reference(element, "map", contractTypes.completeSemanticMap, resolveReference);
  const appearance = recipe(reference(element, "appearance", svsRecipeType, resolveReference));
  const resolvedAppearance = captionAppearance(element, appearance);
  const program = sealCaptionTrackProgram({
    contract: "svml.caption-track-program@1",
    id,
    mode: resolvedAppearance.mode,
    stacking: { order: resolvedAppearance.stackingOrder, tieBreak: id },
    style: resolvedAppearance.style,
  });
  const programId = `${id}.program`;
  return {
    records: [{ id: programId, type: captionTypes.trackProgram, value: { kind: "inline", value: program }, range: element.range }],
    components: [{
      id,
      fragment: captionTrackSurfaceFragment.id,
      inputs: {
        narrative: narrative.ref,
        map: map.ref,
        program: { kind: "record", id: programId },
      },
      outputs: { track: `${id}.track` },
      range: element.range,
    }],
    fragments: [captionTrackSurfaceFragment],
  };
};
