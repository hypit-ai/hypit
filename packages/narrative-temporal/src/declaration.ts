import {
  declarationField,
  sealGraphFragment,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
  type FragmentOperation,
  type GraphFragment,
} from "@hypit/hypit/author";
import { narrativeTypes } from "@hypit/narrative";
import { canonicalize, sameType, type TypeRef } from "@hypit/hypit/protocol";
import { temporalTypes } from "@hypit/temporal";

import {
  narrativeTemporalModuleRef,
  narrativeTemporalProducers,
  narrativeTemporalTypes,
} from "./manifest.js";

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
  if (reference === undefined) throw new Error(`${node.name}.${name} is unresolved.`);
  if (!sameType(reference.type, type)) throw new Error(`${node.name}.${name} has the wrong Type.`);
  return reference;
}

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createNarrativeTimingFragment(alignmentCount: number): GraphFragment {
  if (!Number.isSafeInteger(alignmentCount) || alignmentCount < 1) {
    throw new Error("Narrative Timing requires at least one Alignment.");
  }
  const ports: Array<{ readonly name: string; readonly type: TypeRef }> = [
    { name: "header", type: narrativeTemporalTypes.narrativeTimingHeader },
    { name: "narrative", type: narrativeTypes.narrative },
    { name: "domain", type: temporalTypes.localDomain },
  ];
  const operations: FragmentOperation[] = [];
  const roots: string[] = [];
  for (let index = 0; index < alignmentCount; index += 1) {
    const name = `alignment-${index + 1}`;
    ports.push({ name, type: narrativeTemporalTypes.narrativeAlignment });
    const id = `entry-${index + 1}`;
    operations.push({ id, producer: narrativeTemporalProducers.collectAlignment,
      inputs: { alignment: input(name), domain: input("domain") },
      result: { kind: "output", name: "parts" } });
    roots.push(id);
  }
  let level = roots;
  let combineIndex = 0;
  while (level.length > 1) {
    const next: string[] = [];
    for (let cursor = 0; cursor < level.length; cursor += 2) {
      const left = level[cursor]!;
      const right = level[cursor + 1];
      if (right === undefined) {
        next.push(left);
        continue;
      }
      const id = `combine-${++combineIndex}`;
      operations.push({ id, producer: narrativeTemporalProducers.combineTimingParts,
        inputs: { left: operation(left), right: operation(right) },
        result: { kind: "output", name: "parts" } });
      next.push(id);
    }
    level = next;
  }
  operations.push({ id: "finalize", producer: narrativeTemporalProducers.finalizeTiming,
    inputs: { header: input("header"), narrative: input("narrative"), domain: input("domain"),
      parts: operation(level[0]!) },
    result: { kind: "output", name: "timing" } });
  return sealGraphFragment({ inputs: ports, operations,
    exports: [{ name: "timing", type: narrativeTemporalTypes.narrativeLocalTiming,
      root: operation("finalize") }] });
}

function outputBinding(name: string, component: string, output: string, type: TypeRef): AuthorDeclarationBinding {
  return { name, ref: { kind: "component-output", component, output }, type };
}

export const narrativeTimingAuthorDeclaration: AuthorDeclarationCompiler = {
  module: narrativeTemporalModuleRef,
  declaration: "narrative-timing",
  outputs: [
    narrativeTemporalTypes.narrativeTimingHeader,
    narrativeTemporalTypes.narrativeTimingParts,
    narrativeTemporalTypes.narrativeLocalTiming,
  ],
  shape: {
    summary: "Assembles Narrative Alignments that already share one exact local domain.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names this local timing value." },
      { name: "narrative", kind: "reference", required: true, accepts: [narrativeTypes.narrative],
        summary: "Selects the Narrative identity." },
      { name: "domain", kind: "reference", required: true, accepts: [temporalTypes.localDomain],
        summary: "Selects the source-local coordinate domain." },
    ],
    children: [{ name: "Alignment", cardinality: "many",
      summary: "Adds one Segment Alignment already measured in the selected domain.",
      fields: [{ name: "value", kind: "reference", required: true,
        accepts: [narrativeTemporalTypes.narrativeAlignment], summary: "Selects one Alignment." }] }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [outputBinding(id, id, "timing", narrativeTemporalTypes.narrativeLocalTiming)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    if (declaration.children.length === 0) throw new Error(`${declaration.name} requires at least one Alignment.`);
    const narrative = await resolved(declaration, "narrative", narrativeTypes.narrative, resolveReference);
    const domain = await resolved(declaration, "domain", temporalTypes.localDomain, resolveReference);
    const inputs: Record<string, AuthorResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
      header: { kind: "record", id: `${id}.__header` }, narrative: narrative.ref, domain: domain.ref,
    };
    for (const [index, child] of declaration.children.entries()) {
      inputs[`alignment-${index + 1}`] = (await resolved(child, "value",
        narrativeTemporalTypes.narrativeAlignment, resolveReference)).ref;
    }
    return {
      records: [{ id: `${id}.__header`, type: narrativeTemporalTypes.narrativeTimingHeader,
        value: canonicalize({ id }), range: declaration.range }],
      components: [{ id, fragment: createNarrativeTimingFragment(declaration.children.length), inputs,
        outputs: { timing: id }, range: declaration.range }],
    };
  },
};

export const narrativeTemporalAuthorDeclarations = [narrativeTimingAuthorDeclaration] as const;

export const narrativeTemporalMarkupDeclarations = [
  { name: "narrative-timing", tag: "Timing" },
] as const;
