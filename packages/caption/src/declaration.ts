import {
  createAuthorDeclarationFacet,
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { audiovisualTypes } from "@hypit/audiovisual";
import { canonicalize, sameType, type TypeRef } from "@hypit/hypit/protocol";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import { temporalTypes } from "@hypit/temporal";

import { createCaptionSourceFragment, captionUnitEventFragment } from "./fragment.js";
import { captionModuleRef, captionTypes } from "./manifest.js";
import type {
  CaptionComponentSpec,
  CaptionPresentationOverrideSpec,
  CaptionSelection,
  CaptionUnitEventSpec,
} from "./types.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

function label(declaration: AuthorDeclaration): string {
  if (declaration.label === undefined || declaration.label.trim().length === 0) {
    throw new Error(`Caption ${declaration.name} requires a non-empty label.`);
  }
  return declaration.label;
}

function literal(declaration: AuthorDeclaration, name: string): string {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`Caption ${label(declaration)}.${name} must be a non-empty literal.`);
  }
  return value.value.trim();
}

function childLabel(declaration: AuthorDeclarationChild): string {
  if (declaration.label === undefined || declaration.label.trim().length === 0) {
    throw new Error(`Caption ${declaration.name} requires a non-empty label.`);
  }
  return declaration.label.trim();
}

function literalList(declaration: DeclarationNode, name: string): readonly string[] | undefined {
  const value = declarationField(declaration, name);
  if (value === undefined) return undefined;
  if (value.kind !== "list" || value.items.length === 0) {
    throw new Error(`Caption ${declaration.name}.${name} must be a non-empty list.`);
  }
  return value.items.map((item) => {
    if (item.kind !== "literal" || item.value.trim().length === 0) {
      throw new Error(`Caption ${declaration.name}.${name} must contain identities.`);
    }
    return item.value.trim();
  });
}

function dimension(declaration: AuthorDeclaration, name: string): number {
  const value = Number(literal(declaration, name).replace(/px$/u, ""));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Caption ${label(declaration)}.${name} must be a positive integer px value.`);
  }
  return value;
}

function selection(declaration: AuthorDeclaration): CaptionSelection {
  const value = declarationField(declaration, "selection");
  if (value?.kind === "literal" && value.value.trim() === "all") return { kind: "all" };
  if (value?.kind !== "record" || value.entries.length !== 1) {
    throw new Error(`Caption ${label(declaration)}.selection must be all, { cues: [...] }, or { units: [...] }.`);
  }
  const [entry] = value.entries;
  if ((entry?.name !== "cues" && entry?.name !== "units") || entry.value.kind !== "list"
    || entry.value.items.length === 0) {
    throw new Error(`Caption ${label(declaration)}.selection must contain a non-empty cues or units list.`);
  }
  const ids = entry.value.items.map((item) => {
    if (item.kind !== "literal" || item.value.trim().length === 0) {
      throw new Error(`Caption ${label(declaration)}.selection ${entry.name} must contain identities.`);
    }
    return item.value.trim();
  });
  return { kind: entry.name, ids };
}

async function typedReference(
  declaration: DeclarationNode,
  name: string,
  type: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
) {
  const value = declarationField(declaration, name);
  if (value?.kind !== "reference") throw new Error(`Caption ${declaration.name}.${name} must be a reference.`);
  const resolved = await resolve(value.path);
  if (resolved === undefined || !sameType(resolved.type, type)) {
    throw new Error(`Caption ${declaration.name}.${name} has the wrong Type.`);
  }
  return resolved;
}

export const captionComponentDeclaration: AuthorDeclarationCompiler = {
  module: captionModuleRef,
  declaration: "Component",
  outputs: [audiovisualTypes.programSource, captionTypes.componentSpec,
    captionTypes.presentationOverrideSpec, captionTypes.presentation, captionTypes.schedule],
  shape: {
    summary: "Authors one data-driven Caption Picture Source without expanding cues into parent objects.",
    label: "required",
    fields: [
      { name: "document", kind: "reference", required: true, accepts: [captionTypes.document],
        summary: "Selects the structured caption content." },
      { name: "timing", kind: "reference", required: true, accepts: [captionTypes.timing],
        summary: "Selects source-local timing for the caption units." },
      { name: "style", kind: "reference", required: true, accepts: [captionTypes.style],
        summary: "Selects the component-owned caption presentation." },
      { name: "selection", kind: "expression", required: true,
        summary: "Selects which caption content the component owns." },
      { name: "width", kind: "literal", required: true,
        summary: "Sets the component Picture width in pixels." },
      { name: "height", kind: "literal", required: true,
        summary: "Sets the component Picture height in pixels." },
    ],
    children: [{
      name: "override",
      label: "required",
      cardinality: "many",
      summary: "Changes presentation for selected source-local roles or cues; later matches win.",
      fields: [
        { name: "roles", kind: "expression", required: false,
          summary: "Selects one or more authored Cue roles." },
        { name: "cues", kind: "expression", required: false,
          summary: "Selects one or more authored Cue identities." },
        { name: "style", kind: "reference", required: false, accepts: [captionTypes.style],
          summary: "Uses another Style from the same presentation family." },
        { name: "hidden", kind: "literal", required: false, values: ["true"],
          summary: "Suppresses matching cues without deleting their content or timing." },
      ],
    }],
  },
  bindings(declaration) {
    const id = label(declaration);
    return [
      { name: id, ref: { kind: "component-output", component: `${id}:caption`, output: "source" },
        type: audiovisualTypes.programSource },
      { name: `${id}.presentation`, ref: { kind: "component-output", component: `${id}:caption`,
        output: "presentation" }, type: captionTypes.presentation },
      { name: `${id}.schedule`, ref: { kind: "component-output", component: `${id}:caption`,
        output: "schedule" }, type: captionTypes.schedule },
    ];
  },
  async compile({ declaration, resolveReference }) {
    const id = label(declaration);
    const document = await typedReference(declaration, "document", captionTypes.document, resolveReference);
    const timing = await typedReference(declaration, "timing", captionTypes.timing, resolveReference);
    const style = await typedReference(declaration, "style", captionTypes.style, resolveReference);
    const records: Array<{ id: string; type: TypeRef; value: ReturnType<typeof canonicalize>;
      range: AuthorDeclaration["range"] }> = [];
    const inputs: Record<string, AuthorResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
      spec: { kind: "record", id: `${id}:spec` }, document: document.ref, timing: timing.ref, style: style.ref,
    };
    const overrides: Array<{ readonly key: string; readonly kind: "style" | "hidden" }> = [];
    const overrideIds = new Set<string>();
    for (const [index, child] of declaration.children.entries()) {
      const overrideId = childLabel(child);
      if (overrideIds.has(overrideId)) throw new Error(`Caption ${id} repeats override ${overrideId}.`);
      overrideIds.add(overrideId);
      const roles = literalList(child, "roles");
      const cues = literalList(child, "cues");
      if (roles === undefined && cues === undefined) {
        throw new Error(`Caption ${id} override ${overrideId} must select roles or cues.`);
      }
      const styleField = declarationField(child, "style");
      const hiddenField = declarationField(child, "hidden");
      if ((styleField === undefined) === (hiddenField === undefined)) {
        throw new Error(`Caption ${id} override ${overrideId} must declare exactly one of style or hidden.`);
      }
      const key = `override-${index + 1}`;
      const overrideSpec: CaptionPresentationOverrideSpec = { id: overrideId, selector: {
        ...(roles === undefined ? {} : { roles }), ...(cues === undefined ? {} : { cues }),
      } };
      const specId = `${id}:override:${overrideId}:spec`;
      records.push({ id: specId, type: captionTypes.presentationOverrideSpec,
        value: canonicalize(overrideSpec), range: child.range ?? declaration.range });
      inputs[`${key}-spec`] = { kind: "record", id: specId };
      if (styleField !== undefined) {
        const overrideStyle = await typedReference(child, "style", captionTypes.style, resolveReference);
        inputs[`${key}-style`] = overrideStyle.ref;
        overrides.push({ key, kind: "style" });
      } else {
        overrides.push({ key, kind: "hidden" });
      }
    }
    const spec: CaptionComponentSpec = {
      id,
      pictureDomain: sealLocalSpatialDomain({ id: `${id}:picture-space`, region: {
        x: 0, y: 0, width: dimension(declaration, "width"), height: dimension(declaration, "height"),
      } }),
      selection: selection(declaration),
    };
    return {
      records: [{ id: `${id}:spec`, type: captionTypes.componentSpec,
        value: canonicalize(spec), range: declaration.range }, ...records],
      components: [{
        id: `${id}:caption`, fragment: createCaptionSourceFragment(overrides), inputs,
        outputs: { source: id, presentation: `${id}.presentation`, schedule: `${id}.schedule` },
        range: declaration.range,
      }],
    };
  },
};

export const captionUnitEventDeclaration: AuthorDeclarationCompiler = {
  module: captionModuleRef,
  declaration: "UnitEvent",
  outputs: [temporalTypes.regionSet, captionTypes.unitEventSpec],
  shape: {
    summary: "Projects one caption unit edge as a domain-bearing source-local event set.",
    label: "required",
    fields: [
      { name: "timing", kind: "reference", required: true, accepts: [captionTypes.timing],
        summary: "Selects the source-local caption timing." },
      { name: "unit", kind: "literal", required: true,
        summary: "Selects one caption unit by identity." },
      { name: "edge", kind: "literal", required: true, values: ["start", "end"],
        summary: "Selects the unit boundary published as an event." },
    ],
  },
  bindings(declaration) {
    const id = label(declaration);
    return [{ name: id, ref: { kind: "component-output", component: `${id}:caption-event`, output: "event" },
      type: temporalTypes.regionSet }];
  },
  async compile({ declaration, resolveReference }) {
    const id = label(declaration);
    const timing = await typedReference(declaration, "timing", captionTypes.timing, resolveReference);
    const spec: CaptionUnitEventSpec = {
      unitId: literal(declaration, "unit"), edge: literal(declaration, "edge") as "start" | "end",
    };
    return {
      records: [{ id: `${id}:spec`, type: captionTypes.unitEventSpec,
        value: canonicalize(spec), range: declaration.range }],
      components: [{
        id: `${id}:caption-event`, fragment: captionUnitEventFragment,
        inputs: { timing: timing.ref, spec: { kind: "record", id: `${id}:spec` } },
        outputs: { event: id }, range: declaration.range,
      }],
    };
  },
};

export const captionAuthorFacets = [
  captionComponentDeclaration,
  captionUnitEventDeclaration,
].map((declaration) => createAuthorDeclarationFacet(declaration));
