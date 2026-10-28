import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/hypit/protocol";
import { compositionTypes } from "@hypit/composition";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { createVisualAdjustmentFragment } from "./fragment.js";
import { visualAdjustmentModuleRef, visualAdjustmentTypes } from "./manifest.js";
import { sealVisualAdjustmentHeader } from "./program.js";
import type { VisualAdjustmentEffect } from "./types.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

function literal(node: DeclarationNode, name: string): string {
  const value = declarationField(node, name);
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
  const value = declarationField(node, name);
  if (value?.kind !== "reference") throw new Error(`${node.name}.${name} must be a reference.`);
  const reference = await resolveReference(value.path);
  if (reference === undefined || !sameType(reference.type, type)) throw new Error(`${node.name}.${name} has the wrong Type.`);
  return reference;
}

function authoredEffect(reference: AuthorResolvedReference, label: string): VisualAdjustmentEffect {
  const value = reference.record?.value;
  if (value === undefined || value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${label} must reference an authored Visual Adjustment Effect.`);
  }
  return value as unknown as VisualAdjustmentEffect;
}

function outputBinding(component: string): AuthorDeclarationBinding {
  return {
    name: `${component}.visual`,
    ref: { kind: "component-output", component, output: "visual" },
    type: compositionTypes.visualTrack,
  };
}

export const visualAdjustmentAuthorDeclaration: AuthorDeclarationCompiler = {
  module: visualAdjustmentModuleRef,
  declaration: "track",
  outputs: [visualAdjustmentTypes.header, visualAdjustmentTypes.spec, compositionTypes.visualTrack],
  shape: {
    summary: "Authors ordered transformations of the picture accumulated below this VisualTrack.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Adjustment Track." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects its absolute Timeline." },
    ],
    children: [{
      name: "Adjustment",
      cardinality: "many",
      summary: "Applies one package-owned unary Picture effect during one resolved Window.",
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the adjustment occurrence." },
        { name: "effect", kind: "reference", required: true, accepts: [visualAdjustmentTypes.effect], summary: "Selects the package-owned unary Picture effect." },
        { name: "during", kind: "reference", required: true, accepts: [temporalTypes.window], summary: "Selects its resolved Window." },
      ],
    }],
  },
  bindings(declaration) {
    return [outputBinding(literal(declaration, "id"))];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    if (declaration.children.length === 0) throw new Error(`${declaration.name} requires at least one Adjustment.`);
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const records: { id: string; type: TypeRef; value: CanonicalValue; range: AuthorDeclaration["range"] }[] = [{
      id: `${id}.header`,
      type: visualAdjustmentTypes.header,
      value: sealVisualAdjustmentHeader({ id }),
      range: declaration.range,
    }];
    const inputs: Record<string, AuthorResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
      header: { kind: "record", id: `${id}.header` },
      timeline: timeline.ref,
    };
    for (const [index, child] of declaration.children.entries()) {
      const suffix = String(index + 1).padStart(4, "0");
      const effect = await resolved(child, "effect", visualAdjustmentTypes.effect, resolveReference);
      const window = await resolved(child, "during", temporalTypes.window, resolveReference);
      const specId = `${id}.adjustment.${suffix}.spec`;
      records.push({
        id: specId,
        type: visualAdjustmentTypes.spec,
        value: { id: literal(child, "id"), effect: authoredEffect(effect, `${child.name}.effect`) } as unknown as CanonicalValue,
        range: child.range ?? declaration.range,
      });
      inputs[`spec-${suffix}`] = { kind: "record", id: specId };
      inputs[`window-${suffix}`] = window.ref;
    }
    return {
      records,
      components: [{
        id,
        fragment: createVisualAdjustmentFragment(declaration.children.length),
        inputs,
        outputs: { visual: `${id}.visual` },
        range: declaration.range,
      }],
    };
  },
};

export const visualAdjustmentAuthorDeclarations = [visualAdjustmentAuthorDeclaration] as const;

export const visualAdjustmentMarkupDeclarations = [{ name: "track", tag: "Track" }] as const;
