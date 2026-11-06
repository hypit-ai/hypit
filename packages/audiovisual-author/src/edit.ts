import type {
  AuthorEditPlanner,
  AuthorStructureDeclarationNode,
  AuthorStructureDocument,
  AuthorStructureFieldNode,
  AuthorStructureOperation,
} from "@hypit/hypit/author";

import { audiovisualAuthorModuleRef } from "./manifest.js";

function declaration(
  document: AuthorStructureDocument,
  node: string,
  expected: string,
): AuthorStructureDeclarationNode {
  const value = document.nodes.find((candidate): candidate is AuthorStructureDeclarationNode =>
    candidate.node === node && candidate.kind === "declaration");
  if (value === undefined || value.name !== expected) {
    throw new Error(`Author endpoint ${node} is not an audiovisual ${expected}.`);
  }
  return value;
}

function field(
  document: AuthorStructureDocument,
  owner: AuthorStructureDeclarationNode,
  name: string,
): AuthorStructureFieldNode {
  const container = document.containers.find((candidate) => candidate.container === owner.fields);
  const value = container?.items.map((id) => document.nodes.find((candidate) => candidate.node === id))
    .find((candidate): candidate is AuthorStructureFieldNode => candidate?.kind === "field" && candidate.name === name);
  if (value === undefined) throw new Error(`${owner.name} ${owner.label ?? owner.node} has no ${name} field.`);
  return value;
}

/** Lower an NLE move into one exact Source edit; lane geometry never participates. */
export function planMoveAudiovisualOccurrence(
  document: AuthorStructureDocument,
  occurrenceNode: string,
  at: string,
): readonly AuthorStructureOperation[] {
  if (at.trim().length === 0) throw new Error("Occurrence placement is empty.");
  const occurrence = declaration(document, occurrenceNode, "occurrence");
  const placement = field(document, occurrence, "at");
  const current = document.nodes.find((candidate) => candidate.node === placement.value);
  if (current?.kind !== "literal") {
    throw new Error("Attached occurrence placement cannot be replaced by move-occurrence; move its anchor owner or detach it explicitly.");
  }
  return [{
    kind: "replace",
    node: placement.value,
    value: { kind: "literal", value: at, style: "bare" },
  }];
}

export const audiovisualProgramEditPlanner: AuthorEditPlanner = {
  module: audiovisualAuthorModuleRef,
  declaration: "Program",
  actions: [{
    name: "move-occurrence",
    summary: "Moves one owned occurrence to an exact Programme-local position.",
    input: { kind: "object", fields: {
      at: { schema: { kind: "string", minLength: 1 } },
    } },
    plan({ document, subject }, input) {
      if (subject === undefined) throw new Error("move-occurrence requires an occurrence subject.");
      if (typeof input !== "object" || input === null || Array.isArray(input)
        || typeof input.at !== "string") {
        throw new Error("move-occurrence input requires string field at.");
      }
      return planMoveAudiovisualOccurrence(document, subject.node, input.at);
    },
  }],
};
