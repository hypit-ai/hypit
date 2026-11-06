import type {
  AuthorEditPlanner,
  AuthorStructureDeclarationNode,
  AuthorStructureDocument,
  AuthorStructureOperation,
  AuthorStructureValueDraft,
} from "@hypit/hypit/author";

import { captionModuleRef } from "./manifest.js";

function component(document: AuthorStructureDocument, node: string): AuthorStructureDeclarationNode {
  const value = document.nodes.find((candidate): candidate is AuthorStructureDeclarationNode =>
    candidate.node === node && candidate.kind === "declaration");
  if (value === undefined || value.name !== "Component") {
    throw new Error(`Author endpoint ${node} is not a Caption Component.`);
  }
  return value;
}

function record(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Caption edit input must be a record.");
  }
  return input as Record<string, unknown>;
}

function strings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0
    || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`Caption edit ${label} must be a non-empty string list.`);
  }
  return value as string[];
}

function list(values: readonly string[]): AuthorStructureValueDraft {
  return { kind: "list", items: values.map((value) => ({ kind: "literal", value, style: "bare" })) };
}

function planOverride(
  document: AuthorStructureDocument,
  node: string,
  value: { readonly id: string; readonly selector: "cues" | "roles";
    readonly ids: readonly string[]; readonly style?: string },
): readonly AuthorStructureOperation[] {
  const owner = component(document, node);
  if (value.id.trim().length === 0) throw new Error("Caption override id is empty.");
  return [{
    kind: "insert",
    container: owner.children,
    value: {
      kind: "declaration",
      name: "override",
      label: value.id,
      fields: [
        { kind: "field", name: value.selector, value: list(value.ids) },
        value.style === undefined
          ? { kind: "field", name: "hidden", value: { kind: "literal", value: "true", style: "bare" } }
          : { kind: "field", name: "style", value: { kind: "reference", path: value.style } },
      ],
      children: [],
    },
  }];
}

const selectorInput = { kind: "array", minItems: 1, items: { kind: "string", minLength: 1 } } as const;

/** NLE actions edit the Caption owner declaration; projected Cues are not independent Source nodes. */
export const captionComponentEditPlanner: AuthorEditPlanner = {
  module: captionModuleRef,
  declaration: "Component",
  actions: [{
    name: "hide-cues",
    summary: "Adds an ordered rule that suppresses selected Cues while preserving their timing.",
    input: { kind: "object", fields: {
      id: { schema: { kind: "string", minLength: 1 } },
      cues: { schema: selectorInput },
    } },
    plan({ document, subject }, input) {
      if (subject === undefined) throw new Error("hide-cues requires a Caption Component subject.");
      const value = record(input);
      if (typeof value.id !== "string") throw new Error("hide-cues requires id.");
      return planOverride(document, subject.node, {
        id: value.id, selector: "cues", ids: strings(value.cues, "cues"),
      });
    },
  }, {
    name: "style-cues",
    summary: "Adds an ordered Style rule for selected Cues.",
    input: { kind: "object", fields: {
      id: { schema: { kind: "string", minLength: 1 } },
      cues: { schema: selectorInput },
      style: { schema: { kind: "string", minLength: 1 } },
    } },
    plan({ document, subject }, input) {
      if (subject === undefined) throw new Error("style-cues requires a Caption Component subject.");
      const value = record(input);
      if (typeof value.id !== "string" || typeof value.style !== "string") {
        throw new Error("style-cues requires id and style.");
      }
      return planOverride(document, subject.node, {
        id: value.id, selector: "cues", ids: strings(value.cues, "cues"), style: value.style,
      });
    },
  }, {
    name: "style-roles",
    summary: "Adds an ordered Style rule for all Cues authored with selected roles.",
    input: { kind: "object", fields: {
      id: { schema: { kind: "string", minLength: 1 } },
      roles: { schema: selectorInput },
      style: { schema: { kind: "string", minLength: 1 } },
    } },
    plan({ document, subject }, input) {
      if (subject === undefined) throw new Error("style-roles requires a Caption Component subject.");
      const value = record(input);
      if (typeof value.id !== "string" || typeof value.style !== "string") {
        throw new Error("style-roles requires id and style.");
      }
      return planOverride(document, subject.node, {
        id: value.id, selector: "roles", ids: strings(value.roles, "roles"), style: value.style,
      });
    },
  }],
};
