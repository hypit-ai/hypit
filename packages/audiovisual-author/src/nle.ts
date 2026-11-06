import type { AudiovisualProgram } from "@hypit/audiovisual";
import type {
  AuthorElementProvenance,
  AuthorProvenance,
  AuthorStructureDeclarationNode,
  AuthorStructureDocument,
  AuthorStructureFieldNode,
  AuthorStructureReferenceNode,
  AuthorValueRef,
} from "@hypit/hypit/author";
import { moduleKey } from "@hypit/hypit/protocol";
import type { TemporalMap } from "@hypit/temporal/algebra";

import { audiovisualAuthorModuleRef } from "./manifest.js";

export type AudiovisualNleSubjectReference = {
  readonly programme: string;
  readonly endpoint: string;
  readonly occurrence: string;
  readonly output: string;
  /** Exact authored value used by the Programme Source declaration. */
  readonly owner: AuthorValueRef;
};

export type AudiovisualNleSubjectLocation = AudiovisualNleSubjectReference & {
  /** Constants have no occurrence-to-source temporal mapping. */
  readonly target?: { readonly id: string; readonly mapping: TemporalMap };
};

function container(document: AuthorStructureDocument, id: string): readonly string[] {
  const found = document.containers.find((candidate) => candidate.container === id);
  if (found === undefined) throw new Error(`Author structure container ${id} is unavailable.`);
  return found.items;
}

function declarations(document: AuthorStructureDocument, id: string): readonly AuthorStructureDeclarationNode[] {
  return container(document, id).map((node) => document.nodes.find((candidate) => candidate.node === node))
    .filter((node): node is AuthorStructureDeclarationNode => node?.kind === "declaration");
}

function field(document: AuthorStructureDocument, owner: AuthorStructureDeclarationNode,
  name: string): AuthorStructureFieldNode {
  const found = container(document, owner.fields)
    .map((node) => document.nodes.find((candidate) => candidate.node === node))
    .find((node): node is AuthorStructureFieldNode => node?.kind === "field" && node.name === name);
  if (found === undefined) throw new Error(`${owner.name} ${owner.label ?? owner.node} has no ${name} field.`);
  return found;
}

function reference(document: AuthorStructureDocument, id: string): AuthorStructureReferenceNode {
  const found = document.nodes.find((candidate): candidate is AuthorStructureReferenceNode =>
    candidate.node === id && candidate.kind === "reference");
  if (found === undefined) throw new Error(`Author structure node ${id} is not a reference.`);
  return found;
}

function child(document: AuthorStructureDocument, owner: AuthorStructureDeclarationNode,
  name: string, label: string): AuthorStructureDeclarationNode {
  const found = declarations(document, owner.children)
    .find((candidate) => candidate.name === name && candidate.label === label);
  if (found === undefined) throw new Error(`Audiovisual Program ${owner.label} has no ${name} ${label}.`);
  return found;
}

function provenanceFor(document: AuthorStructureDocument, provenance: AuthorProvenance,
  node: AuthorStructureDeclarationNode): AuthorElementProvenance {
  const matches = provenance.elements.filter((element) => element.source === document.source.id
    && element.range.start === node.range.start && element.range.end === node.range.end);
  if (matches.length !== 1) {
    throw new Error(`Author provenance for ${node.name} ${node.label ?? node.node} is not unique.`);
  }
  return matches[0]!;
}

/**
 * Resolve one Programme-local occurrence endpoint back to the declaration that authored its Source.
 * This follows authored references only; Source ids and runtime values are never searched by shape.
 */
export function locateAudiovisualNleSubject(input: {
  readonly document: AuthorStructureDocument;
  readonly provenance: AuthorProvenance;
  readonly programme: string;
  readonly endpoint: string;
}): AudiovisualNleSubjectReference {
  const prefix = `${input.programme}.occurrence.`;
  if (!input.endpoint.startsWith(prefix)) {
    throw new Error(`NLE endpoint ${input.endpoint} does not belong to Programme ${input.programme}.`);
  }
  const parts = input.endpoint.slice(prefix.length).split(".");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw new Error(`NLE endpoint ${input.endpoint} must address one occurrence output.`);
  }
  const [occurrenceId, output] = parts as [string, string];
  const programmes = declarations(input.document, input.document.declarations).filter((candidate) =>
    candidate.module !== undefined
    && moduleKey(candidate.module) === moduleKey(audiovisualAuthorModuleRef)
    && candidate.name === "Program" && candidate.label === input.programme);
  if (programmes.length !== 1) {
    throw new Error(`Audiovisual Program ${input.programme} is not unique in ${input.document.source.id}.`);
  }
  const programme = programmes[0]!;
  const occurrence = child(input.document, programme, "occurrence", occurrenceId);
  const sourcePath = reference(input.document, field(input.document, occurrence, "source").value).path;
  if (!sourcePath.startsWith("source.") || sourcePath.length === "source.".length) {
    throw new Error(`Audiovisual occurrence ${occurrenceId} has an invalid Source reference.`);
  }
  const sourceName = sourcePath.slice("source.".length);
  const source = child(input.document, programme, "source", sourceName);
  const sourceProvenance = provenanceFor(input.document, input.provenance, source);
  const valueInput = sourceProvenance.inputs.filter((candidate) => candidate.name === "value");
  if (valueInput.length !== 1 || valueInput[0]!.ref === undefined) {
    throw new Error(`Audiovisual Source ${sourceName} has no exact authored value provenance.`);
  }
  return {
    programme: input.programme,
    endpoint: input.endpoint,
    occurrence: occurrenceId,
    output,
    owner: valueInput[0]!.ref,
  };
}

/** Add only the factual occurrence Mapping after the Programme has closed. */
export function realizeAudiovisualNleSubject(
  reference: AudiovisualNleSubjectReference,
  value: AudiovisualProgram,
): AudiovisualNleSubjectLocation {
  if (value.id !== reference.programme) {
    throw new Error(`Observed Programme ${value.id} does not match ${reference.programme}.`);
  }
  const occurrence = value.occurrences[reference.occurrence];
  const selection = occurrence?.selections[reference.output];
  if (selection === undefined) {
    throw new Error(`Observed Programme ${reference.programme} has no endpoint occurrence.${reference.occurrence}.${reference.output}.`);
  }
  return {
    ...reference,
    ...(selection.kind === "signal" ? {
      target: { id: reference.endpoint, mapping: selection.mapping },
    } : {}),
  };
}

/** Convenience for callers that already hold a closed Programme. */
export function resolveAudiovisualNleSubject(input: {
  readonly document: AuthorStructureDocument;
  readonly provenance: AuthorProvenance;
  readonly programme: string;
  readonly endpoint: string;
  readonly value: AudiovisualProgram;
}): AudiovisualNleSubjectLocation {
  return realizeAudiovisualNleSubject(locateAudiovisualNleSubject(input), input.value);
}
