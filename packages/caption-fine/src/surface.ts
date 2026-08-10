import { captionTypes } from "@narratage/caption";
import { assertFontArtifactRef, assertFontStackRef, mediaTypes } from "@narratage/media";
import type { FontArtifactRef, FontStackRef } from "@narratage/media";
import { narrativeTypes } from "@narratage/narrative";
import { programSpaceTypes } from "@narratage/program-space";
import { semanticMapTypes } from "@narratage/semantic-map";
import { svsRecipeType } from "@narratage/svs";
import type { SvsRecipe } from "@narratage/svs";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@narratage/markup";

import { fineCaptionTrackFragment } from "./fragment.js";
import { fineCaptionStyle } from "./style.js";

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function attributes(element: StructuredElement, required: readonly string[], optional: readonly string[] = []): void {
  const actual = Object.keys(element.attributes);
  const allowed = new Set([...required, ...optional]);
  if (required.some((name) => element.attributes[name] === undefined) || actual.some((name) => !allowed.has(name))) {
    const suffix = optional.length === 0 ? "" : `, with optional ${optional.join(", ")}`;
    throw new Error(`${element.name} requires ${required.join(", ")}${suffix}`);
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
  const raw: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  const value = resolveReference(raw.path);
  if (value === undefined) throw new Error(`${element.name}.${name} cannot resolve ${raw.path}`);
  if (!sameType(value.type, expected)) throw new Error(`${element.name}.${name} has the wrong type`);
  return value;
}

function inline<T>(referenceValue: SurfaceResolvedReference, subject: string): T {
  if (referenceValue.record?.value.kind !== "inline") throw new Error(`${subject} must reference an authored inline Record`);
  return referenceValue.record.value.value as unknown as T;
}

function localName(name: string): string {
  const colon = name.lastIndexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}

function exactFonts(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): FontArtifactRef[] {
  const result: FontArtifactRef[] = [];
  const primary = element.attributes.font;
  if (primary === undefined) throw new Error(`${element.name} requires font`);
  if (typeof primary !== "object" || primary.kind !== "reference") {
    throw new Error(`${element.name}.font must be a whole-value reference`);
  }
  const resolved = resolveReference(primary.path);
  if (resolved === undefined) throw new Error(`${element.name}.font cannot resolve ${primary.path}`);
  if (sameType(resolved.type, mediaTypes.fontArtifact)) {
    result.push(inline<FontArtifactRef>(resolved, `${element.name}.font`));
  } else if (sameType(resolved.type, mediaTypes.fontStack)) {
    const stack = inline<FontStackRef>(resolved, `${element.name}.font`);
    assertFontStackRef(stack, `${element.name}.font`);
    result.push(...stack.faces);
  } else {
    throw new Error(`${element.name}.font has the wrong type`);
  }
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Fallback children`);
      continue;
    }
    if (localName(child.name) !== "Fallback") throw new Error(`${element.name} accepts only Fallback children`);
    attributes(child, ["font"]);
    if (child.children.some((nested) => nested.kind === "element" || nested.value.trim())) {
      throw new Error(`${child.name} does not accept children`);
    }
    result.push(inline<FontArtifactRef>(
      reference(child, "font", mediaTypes.fontArtifact, resolveReference),
      `${child.name}.font`,
    ));
  }
  for (const [index, font] of result.entries()) assertFontArtifactRef(font, `${element.name}.font.${index + 1}`);
  return result;
}

export const decodeFineCaptionStyleSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "recipe"], ["font"]);
  const id = stringAttribute(element, "id");
  const recipe = inline<SvsRecipe>(reference(element, "recipe", svsRecipeType, resolveReference), `${element.name}.recipe`);
  const style = fineCaptionStyle(id, recipe, exactFonts(element, resolveReference));
  return {
    records: [{ id, type: captionTypes.style, value: { kind: "inline", value: style }, range: element.range }],
    components: [],
    fragments: [],
  };
};

export const decodeFineCaptionTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "display", "correspondence", "map", "program", "plan", "space"]);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} does not accept children`);
  }
  const id = stringAttribute(element, "id");
  const display = reference(element, "display", narrativeTypes.captionDisplay, resolveReference);
  const correspondence = reference(
    element,
    "correspondence",
    narrativeTypes.captionCorrespondence,
    resolveReference,
  );
  const map = reference(element, "map", semanticMapTypes.complete, resolveReference);
  const program = reference(element, "program", captionTypes.program, resolveReference);
  const plan = reference(element, "plan", captionTypes.plan, resolveReference);
  const space = reference(element, "space", programSpaceTypes.programSpace, resolveReference);
  return {
    records: [],
    components: [{
      id,
      fragment: fineCaptionTrackFragment.id,
      inputs: {
        display: display.ref, correspondence: correspondence.ref, map: map.ref,
        program: program.ref, plan: plan.ref, space: space.ref,
      },
      outputs: { track: `${id}.track` },
      range: element.range,
    }],
    fragments: [fineCaptionTrackFragment],
  };
};
