import type {
  AuthorDeclarationChild,
  AuthorDocument,
  AuthorDocumentDeclaration,
  AuthorElementProvenance,
  AuthorValueRef,
} from "@hypit/hypit/author";
import type { CompiledAuthorSource } from "@hypit/hypit/compiler";
import type { TypeRef } from "@hypit/hypit/protocol";
import { decodeSourceText } from "@hypit/hypit/source";
import type {
  StudioObservedValue,
  StudioPlacement,
  StudioPlacementChild,
  StudioTemporalDomainSourceMap,
} from "@hypit/studio-companion";

import type { StudioCompanionRegistry } from "./studio-registry.js";

export type ObservedValue = StudioObservedValue;
export type Placement = StudioPlacement;

export type Observations = {
  readonly placements: readonly Placement[];
  readonly temporalDomains: readonly StudioTemporalDomainSourceMap[];
};

type DeclarationNode = AuthorDocumentDeclaration | AuthorDeclarationChild;

function rangeOf(node: DeclarationNode): { readonly start: number; readonly end: number } {
  if (node.range === undefined) throw new Error(`Author declaration ${node.name} has no source range.`);
  return node.range;
}

function literals(node: DeclarationNode): Readonly<Record<string, string>> {
  return Object.fromEntries(node.fields.flatMap((field) =>
    field.value.kind === "literal" ? [[field.name, field.value.value]] : []));
}

function referenceAttributes(node: DeclarationNode): Readonly<Record<string, string>> {
  return Object.fromEntries(node.fields.flatMap((field) =>
    field.value.kind === "reference" ? [[field.name, field.value.path]] : []));
}

function attributeValueRanges(
  node: DeclarationNode,
): Readonly<Record<string, { readonly start: number; readonly end: number }>> {
  return Object.fromEntries(node.fields.flatMap((field) =>
    field.value.range === undefined ? [] : [[field.name, { ...field.value.range }]]));
}

function authoredAttributes(node: DeclarationNode): Readonly<Record<string, unknown>> {
  return Object.fromEntries(node.fields.map((field) => [field.name, field.value.kind === "literal"
    ? field.value.value
    : { kind: "reference", path: field.value.path }]));
}

function provenanceFor(
  compiled: CompiledAuthorSource,
  sourceName: string,
  range: { readonly start: number; readonly end: number },
): AuthorElementProvenance | undefined {
  return compiled.provenance.elements.find((element) => element.sourceName === sourceName
    && element.range.start === range.start && element.range.end === range.end);
}

function typeForRef(compiled: CompiledAuthorSource, ref: AuthorValueRef): TypeRef | undefined {
  if (ref.kind === "record") return compiled.program.records.find((record) => record.id === ref.id)?.type;
  const output = compiled.provenance.elements.flatMap((element) => element.outputs)
    .find((candidate) => candidate.component === ref.component && candidate.name === ref.output);
  return output === undefined ? undefined : compiled.graph.outputs.find((candidate) => candidate.id === output.id)?.type;
}

function observed(
  compiled: CompiledAuthorSource,
  provenance: AuthorElementProvenance | undefined,
): readonly ObservedValue[] {
  if (provenance === undefined) return [];
  return provenance.records.flatMap((record) => {
    const value = compiled.program.records.find((candidate) => candidate.id === record.id);
    return value === undefined ? [] : [{ id: record.local, type: value.type, value: structuredClone(value.value) }];
  });
}

function referenceTypes(
  compiled: CompiledAuthorSource,
  provenance: AuthorElementProvenance | undefined,
): Readonly<Record<string, string>> {
  if (provenance === undefined) return {};
  return Object.fromEntries(provenance.inputs.flatMap((input) => {
    if (input.ref === undefined) return [];
    const type = typeForRef(compiled, input.ref);
    return type === undefined ? [] : [[input.name, type.name]];
  }));
}

function childPlacement(
  child: AuthorDeclarationChild,
  sourceName: string,
  compiled: CompiledAuthorSource,
): StudioPlacementChild {
  const range = rangeOf(child);
  const provenance = provenanceFor(compiled, sourceName, range);
  const attributes = literals(child);
  const references = referenceAttributes(child);
  return {
    tag: child.name,
    sourcePath: sourceName,
    ...(typeof attributes.id === "string" ? { id: attributes.id } : {}),
    range: { ...range },
    attributes,
    attributeValueRanges: attributeValueRanges(child),
    references: Object.values(references),
    referenceAttributes: references,
    referenceTypes: referenceTypes(compiled, provenance),
    values: observed(compiled, provenance),
    ...(provenance === undefined ? {} : {
      authorElement: provenance.id,
      authorEndpoints: Object.fromEntries(provenance.inputs.map((input) => [input.name, input.id])),
      records: provenance.records.map((record) => record.local),
      outputs: provenance.outputs.map((output) => output.local),
    }),
    children: child.children.map((descendant) => childPlacement(descendant, sourceName, compiled)),
  };
}

/** Build Studio placement facts from the exact lossless document and compiled provenance. */
export function observeAuthorDocument(
  document: AuthorDocument,
  compiled: CompiledAuthorSource,
  registry: StudioCompanionRegistry,
): Observations {
  const sourceName = document.source.name;
  const source = decodeSourceText(document.source);
  const temporalDomains: StudioTemporalDomainSourceMap[] = [];
  const placements = document.declarations.map((declaration): Placement => {
    const range = rangeOf(declaration);
    const provenance = provenanceFor(compiled, sourceName, range);
    const attributes = literals(declaration);
    const references = referenceAttributes(declaration);
    const children = declaration.children.map((child) => childPlacement(child, sourceName, compiled));
    const temporalDomain = registry.observeTemporalDomain(declaration.module, declaration.name, {
      sourceName,
      source,
      tag: declaration.name,
      range: { ...range },
      ...(declaration.textRange === undefined ? {} : { contentStart: declaration.textRange.start }),
      nextOffset: range.end,
      attributes: authoredAttributes(declaration),
    });
    if (temporalDomain !== undefined) temporalDomains.push(temporalDomain);
    return {
      tag: declaration.name,
      module: { ...declaration.module },
      sourcePath: sourceName,
      declaration: declaration.name,
      ...(typeof attributes.id === "string" ? { id: attributes.id } : {}),
      range: { ...range },
      records: provenance?.records.map((record) => record.local) ?? [],
      values: observed(compiled, provenance),
      outputs: provenance?.outputs.map((output) => output.local) ?? [],
      outputPorts: provenance?.outputs.map((output) => ({ name: output.name, ref: output.local })) ?? [],
      attributes,
      attributeValueRanges: attributeValueRanges(declaration),
      referenceAttributes: references,
      referenceTypes: referenceTypes(compiled, provenance),
      references: [...Object.values(references), ...children.flatMap((child) => child.references)],
      children,
      ...(provenance === undefined ? {} : {
        authorElement: provenance.id,
        authorEndpoints: Object.fromEntries(provenance.inputs.map((input) => [input.name, input.id])),
      }),
    };
  });
  return { placements, temporalDomains };
}
