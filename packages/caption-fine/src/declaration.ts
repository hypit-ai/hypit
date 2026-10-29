import {
  declarationField,
  sealGraphFragment,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorRecordDraft,
  type AuthorResolvedReference,
  type FragmentOperation,
} from "@hypit/hypit/author";
import { recipeType, type Recipe } from "@hypit/hypit/recipe";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { captionProducers, captionTypes } from "@hypit/caption";
import { compositionTypes } from "@hypit/composition";
import { assertFontArtifactRef, assertFontStackRef, mediaTypes, type FontArtifactRef, type FontStackRef } from "@hypit/media";
import { spatialSequenceTypes } from "@hypit/spatial-sequence";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { captionFineModuleRef, captionFineProducers, captionFineTypes } from "./manifest.js";
import { fineCaptionStyle } from "./style.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

function field(node: DeclarationNode, name: string) {
  return declarationField(node, name);
}

function literal(node: DeclarationNode, name: string): string {
  const value = field(node, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) throw new Error(`${node.name}.${name} must be non-empty text.`);
  return value.value.trim();
}

async function resolved(
  node: DeclarationNode,
  name: string,
  types: TypeRef | readonly TypeRef[],
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = field(node, name);
  if (value?.kind !== "reference") throw new Error(`${node.name}.${name} must be a reference.`);
  const reference = await resolveReference(value.path);
  const accepted = Array.isArray(types) ? types : [types];
  if (reference === undefined || !accepted.some((type) => sameType(reference.type, type))) {
    throw new Error(`${node.name}.${name} has the wrong Type.`);
  }
  return reference;
}

function recordValue<T>(reference: AuthorResolvedReference, label: string): T {
  if (reference.record === undefined) throw new Error(`${label} must reference an authored Record.`);
  return reference.record.value as unknown as T;
}

async function exactFonts(
  declaration: AuthorDeclaration,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<FontArtifactRef[]> {
  const primary = await resolved(declaration, "font", [mediaTypes.fontArtifact, mediaTypes.fontStack], resolveReference);
  const fonts: FontArtifactRef[] = [];
  if (sameType(primary.type, mediaTypes.fontArtifact)) {
    fonts.push(recordValue<FontArtifactRef>(primary, `${declaration.name}.font`));
  } else {
    const stack = recordValue<FontStackRef>(primary, `${declaration.name}.font`);
    assertFontStackRef(stack, `${declaration.name}.font`);
    fonts.push(...stack.faces);
  }
  for (const child of declaration.children) {
    const fallback = await resolved(child, "font", mediaTypes.fontArtifact, resolveReference);
    fonts.push(recordValue<FontArtifactRef>(fallback, `${child.name}.font`));
  }
  for (const [index, font] of fonts.entries()) assertFontArtifactRef(font, `${declaration.name}.font.${index + 1}`);
  return fonts;
}

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

type CaptionUseFragment = { readonly key: string; readonly bounded: boolean };

export function createFineCaptionDeclarationFragment(uses: readonly CaptionUseFragment[], regions: boolean) {
  const inputs: Array<{ readonly name: string; readonly type: TypeRef }> = [
    { name: "document", type: captionTypes.document },
    { name: "timing", type: captionTypes.timing },
    { name: "timeline", type: timelineTypes.timeline },
    { name: "within", type: spatialTypes.frame },
    { name: "header", type: captionTypes.header },
  ];
  const operations: FragmentOperation[] = [{ id: "create", producer: captionProducers.create,
    inputs: { document: input("document"), header: input("header") }, result: { kind: "output", name: "program" } }];
  let previous = "create";
  for (const use of uses) {
    if (use.bounded) inputs.push({ name: `${use.key}-window`, type: temporalTypes.window });
    inputs.push({ name: `${use.key}-style`, type: captionTypes.style }, { name: `${use.key}-filter`, type: captionTypes.filter });
    operations.push({ id: use.key, producer: use.bounded ? captionProducers.append : captionProducers.appendUnbounded,
      inputs: { program: operation(previous), ...(use.bounded ? { window: input(`${use.key}-window`) } : {}),
        style: input(`${use.key}-style`), filter: input(`${use.key}-filter`) }, result: { kind: "output", name: "program" } });
    previous = use.key;
  }
  operations.push({ id: "schedule", producer: captionFineProducers.schedule,
    inputs: { timing: input("timing"), document: input("document"), program: operation(previous) }, result: { kind: "output", name: "schedule" } });
  if (regions) inputs.push(
    { name: "regions", type: spatialSequenceTypes.timelineRegions },
    { name: "regionBindings", type: captionFineTypes.regionBindings },
  );
  operations.push({ id: "render", producer: regions ? captionFineProducers.renderWithRegions : captionFineProducers.render,
    inputs: { schedule: operation("schedule"), document: input("document"), timeline: input("timeline"), within: input("within"),
      program: operation(previous), ...(regions ? {
        regions: input("regions"), regionBindings: input("regionBindings"),
      } : {}) }, result: { kind: "output", name: "track" } });
  return sealGraphFragment({ inputs, operations, exports: [
    { name: "program", type: captionTypes.program, root: operation(previous) },
    { name: "schedule", type: captionFineTypes.schedule, root: operation("schedule") },
    { name: "visual", type: compositionTypes.visualTrack, root: operation("render") },
  ] });
}

function outputBinding(component: string, output: "program" | "schedule" | "visual", type: TypeRef): AuthorDeclarationBinding {
  return { name: `${component}.${output}`, ref: { kind: "component-output", component, output }, type };
}

export const fineCaptionStyleAuthorDeclaration: AuthorDeclarationCompiler = {
  module: captionFineModuleRef,
  declaration: "style",
  outputs: [captionTypes.style],
  shape: {
    summary: "Resolves one Recipe and one exact font stack into a complete fine-grained Caption Style.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names this Style." },
      { name: "recipe", kind: "reference", required: true, accepts: [recipeType], summary: "Selects Caption geometry, paint and local motion." },
      { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontArtifact, mediaTypes.fontStack], summary: "Selects the primary font or Font Stack." },
    ],
    children: [{ name: "Fallback", cardinality: "many", summary: "Appends one exact fallback face.", fields: [
      { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontArtifact], summary: "Selects one fallback face." },
    ] }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: id, ref: { kind: "record", id }, type: captionTypes.style }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const recipeReference = await resolved(declaration, "recipe", recipeType, resolveReference);
    const recipe = recordValue<Recipe>(recipeReference, `${declaration.name}.recipe`);
    const style = fineCaptionStyle(id, recipe, await exactFonts(declaration, resolveReference));
    return { records: [{ id, type: captionTypes.style, value: style as never, range: declaration.range }], components: [] };
  },
};

export const fineCaptionTrackAuthorDeclaration: AuthorDeclarationCompiler = {
  module: captionFineModuleRef,
  declaration: "caption",
  outputs: [captionTypes.header, captionTypes.filter, captionTypes.program, captionFineTypes.schedule,
    captionFineTypes.regionBindings, compositionTypes.visualTrack],
  shape: {
    summary: "Renders a CaptionDocument at its resolved CaptionTiming as one peer VisualTrack.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names this Caption Track." },
      { name: "document", kind: "reference", required: true, accepts: [captionTypes.document], summary: "Selects the CaptionDocument." },
      { name: "timing", kind: "reference", required: true, accepts: [captionTypes.timing], summary: "Selects resolved Caption timing." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the absolute Timeline." },
      { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Selects the picture-plane Frame." },
      { name: "regions", kind: "reference", required: false, accepts: [spatialSequenceTypes.timelineRegions], summary: "Optionally selects one Timeline-attached spatial sequence." },
    ],
    children: [
      { name: "Use", cardinality: "many", summary: "Presents matching complete Cues with one Style.", fields: [
        { name: "id", kind: "identifier", required: false, summary: "Optionally names this Use." },
        { name: "style", kind: "reference", required: true, accepts: [captionTypes.style], summary: "Selects a complete Caption Style." },
        { name: "role", kind: "literal", required: false, summary: "Optionally filters by speaker Role." },
        { name: "during", kind: "reference", required: false, accepts: [temporalTypes.window], summary: "Optionally narrows presentation to one Window." },
      ] },
      { name: "Follow", cardinality: "many", summary: "Explicitly binds one Script Role to one named spatial series.", fields: [
        { name: "role", kind: "literal", required: true, summary: "Selects the Script Role whose Cues follow this series." },
        { name: "series", kind: "literal", required: true, summary: "Names one series in the selected spatial sequence." },
        { name: "missing", kind: "literal", required: true, values: ["hide", "authored-placement"], summary: "States what a null observation means." },
      ] },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [
      outputBinding(id, "program", captionTypes.program),
      outputBinding(id, "schedule", captionFineTypes.schedule),
      outputBinding(id, "visual", compositionTypes.visualTrack),
    ];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const document = await resolved(declaration, "document", captionTypes.document, resolveReference);
    const timing = await resolved(declaration, "timing", captionTypes.timing, resolveReference);
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const within = await resolved(declaration, "within", spatialTypes.frame, resolveReference);
    const regions = field(declaration, "regions") === undefined ? undefined
      : await resolved(declaration, "regions", spatialSequenceTypes.timelineRegions, resolveReference);
    const headerId = `${id}.header`;
    const records: AuthorRecordDraft[] = [{ id: headerId, type: captionTypes.header, value: { id }, range: declaration.range }];
    const inputs: Record<string, AuthorResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
      document: document.ref, timing: timing.ref, timeline: timeline.ref, within: within.ref,
      header: { kind: "record", id: headerId },
      ...(regions === undefined ? {} : { regions: regions.ref }),
    };
    const uses: CaptionUseFragment[] = [];
    const useChildren = declaration.children.filter((child) => child.name === "Use");
    for (const [index, child] of useChildren.entries()) {
      const number = index + 1, key = `use-${number}`;
      const useId = field(child, "id") === undefined ? `${id}.use.${number}` : literal(child, "id");
      const style = await resolved(child, "style", captionTypes.style, resolveReference);
      const window = field(child, "during") === undefined ? undefined : await resolved(child, "during", temporalTypes.window, resolveReference);
      const role = field(child, "role") === undefined ? undefined : literal(child, "role");
      const filterId = `${useId}.filter`;
      records.push({ id: filterId, type: captionTypes.filter,
        value: { id: useId, ...(role === undefined ? {} : { role }) }, range: child.range ?? declaration.range });
      inputs[`${key}-style`] = style.ref;
      inputs[`${key}-filter`] = { kind: "record", id: filterId };
      if (window !== undefined) inputs[`${key}-window`] = window.ref;
      uses.push({ key, bounded: window !== undefined });
    }
    const followChildren = declaration.children.filter((child) => child.name === "Follow");
    if ((regions === undefined) !== (followChildren.length === 0)) {
      throw new Error(`${declaration.name}.regions and at least one Follow must be declared together.`);
    }
    if (regions !== undefined) {
      const roles = new Set<string>();
      const bindings = followChildren.map((child) => {
        const role = literal(child, "role");
        if (roles.has(role)) throw new Error(`${declaration.name} repeats Follow role ${role}.`);
        roles.add(role);
        const missing = literal(child, "missing");
        if (missing !== "hide" && missing !== "authored-placement") {
          throw new Error(`${child.name}.missing must be hide or authored-placement.`);
        }
        return { role, seriesId: literal(child, "series"), missing };
      });
      const bindingId = `${id}.region-bindings`;
      records.push({ id: bindingId, type: captionFineTypes.regionBindings,
        value: { bindings }, range: declaration.range });
      inputs.regionBindings = { kind: "record", id: bindingId };
    }
    return { records, components: [{
      id,
      fragment: createFineCaptionDeclarationFragment(uses, regions !== undefined),
      inputs,
      outputs: { program: `${id}.program`, schedule: `${id}.schedule`, visual: `${id}.visual` },
      range: declaration.range,
    }] };
  },
};

export const captionFineAuthorDeclarations = [fineCaptionStyleAuthorDeclaration, fineCaptionTrackAuthorDeclaration] as const;

export const captionFineMarkupDeclarations = [
  { name: "style", tag: "Style" },
  { name: "caption", tag: "Caption" },
] as const;
