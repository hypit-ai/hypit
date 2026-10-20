import { sameType } from "@hypit/hypit/protocol";
import { captionProducers, captionTypes } from "@hypit/caption";
import { assertFontArtifactRef, assertFontStackRef, mediaTypes } from "@hypit/media";
import type { FontArtifactRef, FontStackRef } from "@hypit/media";
import { timelineTypes } from "@hypit/timeline";
import { regionEvidenceTypes } from "@hypit/region-evidence";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import type { Recipe } from "@hypit/hypit/recipe";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference, MarkupAttributeValue } from "@hypit/hypit/markup";

import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation } from "@hypit/hypit/author";
import type { SurfaceRecordDraft, SurfaceComponentDraft } from "@hypit/hypit/markup";
import { assertEmptyElement, optionalTextAttribute } from "@hypit/hypit/markup";
import { resolveTemporalContext, resolveTemporalWindowReference, temporalWindowAttributeNames } from "@hypit/temporal/markup";
import { temporalTypes } from "@hypit/temporal";
import { compositionTypes } from "@hypit/composition";
import { captionFineProducers, captionFineTypes } from "./manifest.js";
const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });
import { fineCaptionStyle } from "./style.js";

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

function valueOf<T>(referenceValue: SurfaceResolvedReference, subject: string): T {
  if (referenceValue.record === undefined) throw new Error(`${subject} must reference an authored Record`);
  return referenceValue.record.value as unknown as T;
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
    result.push(valueOf<FontArtifactRef>(resolved, `${element.name}.font`));
  } else if (sameType(resolved.type, mediaTypes.fontStack)) {
    const stack = valueOf<FontStackRef>(resolved, `${element.name}.font`);
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
    result.push(valueOf<FontArtifactRef>(
      reference(child, "font", mediaTypes.fontArtifact, resolveReference),
      `${child.name}.font`,
    ));
  }
  for (const [index, font] of result.entries()) assertFontArtifactRef(font, `${element.name}.font.${index + 1}`);
  return result;
}

export const decodeFineCaptionStyleSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "recipe", "font"]);
  const id = stringAttribute(element, "id");
  const recipe = valueOf<Recipe>(reference(element, "recipe", recipeType, resolveReference), `${element.name}.recipe`);
  const style = fineCaptionStyle(id, recipe, exactFonts(element, resolveReference));
  return {
    records: [{ id, type: captionTypes.style, value: (style), range: element.range }],
    components: [],
  };
};

export const decodeFineCaptionTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "document", "timing", "timeline", "within"], ["regions"]);
  const id = stringAttribute(element, "id");
  const document = reference(element, "document", captionTypes.document, resolveReference);
  const timing = reference(element, "timing", captionTypes.timing, resolveReference);
  const within = reference(element, "within", spatialTypes.frame, resolveReference);
  const context = resolveTemporalContext({ element, resolveReference });
  const regions = element.attributes.regions === undefined ? undefined : reference(element, "regions", regionEvidenceTypes.evidence, resolveReference);
  const records: SurfaceRecordDraft[] = [{ id: `${id}.header`, type: captionTypes.header,
    value: ({ id }), range: element.range }];
  const components: SurfaceComponentDraft[] = [];
  const inputs: { name: string; type: SurfaceResolvedReference["type"] }[] = [{ name: "document", type: captionTypes.document }, { name: "timing", type: captionTypes.timing }, { name: "timeline", type: timelineTypes.timeline }, { name: "within", type: spatialTypes.frame }, { name: "header", type: captionTypes.header }];
  const bindings: Record<string, SurfaceResolvedReference["ref"]> = { document: document.ref, timing: timing.ref, timeline: context.timeline.ref, within: within.ref, header: { kind: "record", id: `${id}.header` } };
  const operations: FragmentOperation[] = [{ id: "create", producer: captionProducers.create,
    inputs: { document: input("document"), header: input("header") }, result: { kind: "output" as const, name: "program" } }];
  let previous = "create", index = 0;
  for (const child of element.children) {
    if (child.kind === "text") { if (child.value.trim()) throw new Error("Caption accepts Use children."); continue; }
    if (localName(child.name) !== "Use") throw new Error("Caption accepts Use children.");
    attributes(child, ["style"], ["id", "role", ...temporalWindowAttributeNames]);
    assertEmptyElement(child);
    index += 1;
    const useId = optionalTextAttribute(child, "id") ?? `${id}.use.${index}`;
    const window = child.attributes.during === undefined
      ? undefined
      : resolveTemporalWindowReference({ element: child, resolveReference });
    const style = reference(child, "style", captionTypes.style, resolveReference);
    const role = optionalTextAttribute(child, "role");
    const filterId = `${useId}.filter`;
    records.push({ id: filterId, type: captionTypes.filter, value: ({
      id: useId, ...(role === undefined ? {} : { role }),
    }), range: child.range });
    const key = `use-${index}`;
    inputs.push(...(window === undefined ? [] : [{ name: `${key}-window`, type: temporalTypes.window }]),
      { name: `${key}-style`, type: captionTypes.style }, { name: `${key}-filter`, type: captionTypes.filter });
    if (window !== undefined) bindings[`${key}-window`] = window.ref;
    bindings[`${key}-style`] = style.ref; bindings[`${key}-filter`] = { kind: "record", id: filterId };
    operations.push({ id: key, producer: window === undefined ? captionProducers.appendUnbounded : captionProducers.append,
      inputs: { program: operation(previous), ...(window === undefined ? {} : { window: input(`${key}-window`) }),
        style: input(`${key}-style`), filter: input(`${key}-filter`) }, result: { kind: "output" as const, name: "program" } });
    previous = key;
  }
  operations.push({ id: "schedule", producer: captionFineProducers.schedule,
    inputs: { timing: input("timing"), document: input("document"), program: operation(previous) }, result: { kind: "output" as const, name: "schedule" } });
  if (regions !== undefined) { inputs.push({ name: "regions", type: regionEvidenceTypes.evidence }); bindings.regions = regions.ref; }
  operations.push({ id: "render", producer: regions === undefined ? captionFineProducers.render : captionFineProducers.renderWithRegions,
    inputs: { schedule: operation("schedule"), document: input("document"), timeline: input("timeline"), within: input("within"), program: operation(previous), ...(regions === undefined ? {} : { regions: input("regions") }) }, result: { kind: "output" as const, name: "track" } });
  const collector = sealGraphFragment({ inputs, operations, exports: [
    { name: "program", type: captionTypes.program, root: operation(previous) },
    { name: "schedule", type: captionFineTypes.schedule, root: operation("schedule") },
    { name: "visual", type: compositionTypes.visualTrack, root: operation("render") },
  ] });
  components.push({ id, fragment: collector, inputs: bindings,
    outputs: { program: `${id}.program`, schedule: `${id}.schedule`, visual: `${id}.visual` }, range: element.range });
  return { records, components, exports: [`${id}.program`, `${id}.schedule`, `${id}.visual`] };
};
