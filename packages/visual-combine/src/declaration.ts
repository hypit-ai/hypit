import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { timelineTypes } from "@hypit/timeline";

import { createVisualCombineFragment } from "./fragment.js";
import { visualCombineModuleRef, visualCombineTypes } from "./manifest.js";
import { sealVisualCombineHeader, sealVisualCombineUseSpec } from "./program.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

function field(node: DeclarationNode, name: string) {
  return declarationField(node, name);
}

function literal(node: DeclarationNode, name: string): string {
  const value = field(node, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${node.name}.${name} must be non-empty text.`);
  }
  return value.value.trim();
}

async function resolved(
  node: DeclarationNode,
  name: string,
  type: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = field(node, name);
  if (value?.kind !== "reference") throw new Error(`${node.name}.${name} must be a reference.`);
  const reference = await resolveReference(value.path);
  if (reference === undefined || !sameType(reference.type, type)) throw new Error(`${node.name}.${name} has the wrong Type.`);
  return reference;
}

function outputBinding(component: string): AuthorDeclarationBinding {
  return {
    name: `${component}.visual`,
    ref: { kind: "component-output", component, output: "visual" },
    type: compositionTypes.visualTrack,
  };
}

export const visualCombineAuthorDeclaration: AuthorDeclarationCompiler = {
  module: visualCombineModuleRef,
  declaration: "track",
  outputs: [visualCombineTypes.header, visualCombineTypes.useSpec, compositionTypes.visualTrack],
  shape: {
    summary: "Concatenates completed VisualTrack Item programmes in explicit back-to-front order.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the resulting VisualTrack." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the shared absolute Timeline." },
    ],
    children: [{
      name: "Use",
      cardinality: "many",
      summary: "Places one complete VisualTrack at this position in the combined paint order.",
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names this source occurrence and its Item namespace." },
        { name: "source", kind: "reference", required: true, accepts: [compositionTypes.visualTrack], summary: "Selects the completed VisualTrack." },
      ],
    }],
  },
  bindings(declaration) {
    return [outputBinding(literal(declaration, "id"))];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    if (declaration.children.length === 0) throw new Error(`${declaration.name} requires at least one Use.`);
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const records = [{
      id: `${id}.header`,
      type: visualCombineTypes.header,
      value: sealVisualCombineHeader({ id }),
      range: declaration.range,
    }];
    const inputs: Record<string, AuthorResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
      header: { kind: "record", id: `${id}.header` },
      timeline: timeline.ref,
    };
    const useIds = new Set<string>();
    for (const [index, child] of declaration.children.entries()) {
      const source = await resolved(child, "source", compositionTypes.visualTrack, resolveReference);
      const useId = literal(child, "id");
      if (useIds.has(useId)) throw new Error(`${declaration.name} repeats Use ${useId}.`);
      useIds.add(useId);
      const suffix = String(index + 1).padStart(4, "0");
      const specId = `${id}.use.${suffix}.spec`;
      records.push({
        id: specId,
        type: visualCombineTypes.useSpec,
        value: sealVisualCombineUseSpec({ id: useId }),
        range: child.range ?? declaration.range,
      });
      inputs[`spec-${suffix}`] = { kind: "record", id: specId };
      inputs[`track-${suffix}`] = source.ref;
    }
    return {
      records,
      components: [{
        id,
        fragment: createVisualCombineFragment(declaration.children.length),
        inputs,
        outputs: { visual: `${id}.visual` },
        range: declaration.range,
      }],
    };
  },
};

export const visualCombineAuthorDeclarations = [visualCombineAuthorDeclaration] as const;
export const visualCombineMarkupDeclarations = [{ name: "track", tag: "Track" }] as const;
