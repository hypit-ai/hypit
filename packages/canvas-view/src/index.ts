import type {
  AuthorDeclarationCompiler,
  AuthorEditPlanner,
  AuthorStructureDeclarationNode,
  AuthorStructureDocument,
  AuthorStructureFieldNode,
  AuthorStructureLiteralNode,
  AuthorStructureOperation,
  AuthorStructureRecordEntryNode,
  AuthorStructureRecordNode,
  AuthorStructureReferenceNode,
} from "@hypit/hypit/author";
import type { ModuleManifest } from "@hypit/hypit/protocol";

export const canvasViewModuleRef = { name: "@hypit/canvas-view", version: "1" } as const;

export const canvasViewManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: canvasViewModuleRef.name,
  version: canvasViewModuleRef.version,
  dependencies: [],
  types: [],
  capabilities: [],
  producers: [],
};

/** View validation only; semantic subjects remain owned by their declaration packages. */
export const canvasViewAuthorDeclaration: AuthorDeclarationCompiler = {
  module: canvasViewModuleRef,
  declaration: "View",
  outputs: [],
  shape: {
    summary: "Persists one Canvas membership and layout projection.",
    label: "required",
    fields: [{ name: "scope", kind: "expression", required: false,
      summary: "Optionally curates independently authored subjects into this View." }],
    children: [{
      name: "item",
      label: "required",
      cardinality: "many",
      summary: "Places one independently authored subject in this View.",
      fields: [
        { name: "subject", kind: "reference", required: true,
          summary: "Selects the independently authored subject." },
        { name: "layout", kind: "expression", referenceScope: "declaration", required: true,
          summary: "Stores View-local x/y layout only." },
      ],
    }],
  },
  bindings() { return []; },
  compile() { return { records: [], components: [] }; },
};

export type CanvasViewItem = {
  readonly id: string;
  readonly subject: string;
  readonly x: number;
  readonly y: number;
};

export type CanvasViewProjection = {
  readonly id: string;
  readonly items: readonly CanvasViewItem[];
};

function node<Value extends AuthorStructureDocument["nodes"][number]["kind"]>(
  document: AuthorStructureDocument,
  id: string,
  kind: Value,
): Extract<AuthorStructureDocument["nodes"][number], { readonly kind: Value }> {
  const value = document.nodes.find((candidate) => candidate.node === id);
  if (value?.kind !== kind) throw new Error(`Author endpoint ${id} is not ${kind}.`);
  return value as Extract<AuthorStructureDocument["nodes"][number], { readonly kind: Value }>;
}

function declaration(document: AuthorStructureDocument, id: string, name: string): AuthorStructureDeclarationNode {
  const value = node(document, id, "declaration");
  if (value.name !== name) throw new Error(`Author endpoint ${id} is not ${name}.`);
  return value;
}

function field(document: AuthorStructureDocument, owner: AuthorStructureDeclarationNode,
  name: string): AuthorStructureFieldNode {
  const container = document.containers.find((candidate) => candidate.container === owner.fields);
  const value = container?.items.map((id) => document.nodes.find((candidate) => candidate.node === id))
    .find((candidate): candidate is AuthorStructureFieldNode => candidate?.kind === "field" && candidate.name === name);
  if (value === undefined) throw new Error(`${owner.name} ${owner.label ?? owner.node} has no ${name} field.`);
  return value;
}

function recordEntry(document: AuthorStructureDocument, record: AuthorStructureRecordNode,
  name: string): AuthorStructureRecordEntryNode {
  const container = document.containers.find((candidate) => candidate.container === record.entries);
  const value = container?.items.map((id) => document.nodes.find((candidate) => candidate.node === id))
    .find((candidate): candidate is AuthorStructureRecordEntryNode => candidate?.kind === "entry" && candidate.name === name);
  if (value === undefined) throw new Error(`Canvas layout has no ${name} entry.`);
  return value;
}

function item(document: AuthorStructureDocument, value: AuthorStructureDeclarationNode): CanvasViewItem {
  const subject = node(document, field(document, value, "subject").value, "reference") as AuthorStructureReferenceNode;
  const layout = node(document, field(document, value, "layout").value, "record") as AuthorStructureRecordNode;
  const x = node(document, recordEntry(document, layout, "x").value, "literal") as AuthorStructureLiteralNode;
  const y = node(document, recordEntry(document, layout, "y").value, "literal") as AuthorStructureLiteralNode;
  const xValue = Number(x.value);
  const yValue = Number(y.value);
  if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) throw new Error("Canvas item position must be finite.");
  if (value.label === undefined) throw new Error("Canvas item requires a label.");
  return { id: value.label, subject: subject.path, x: xValue, y: yValue };
}

export function projectCanvasView(document: AuthorStructureDocument, viewNode: string): CanvasViewProjection {
  const view = declaration(document, viewNode, "View");
  if (view.label === undefined) throw new Error("Canvas View requires a label.");
  const children = document.containers.find((candidate) => candidate.container === view.children);
  const items = (children?.items ?? []).map((id) => declaration(document, id, "item"));
  return { id: view.label, items: items.map((value) => item(document, value)) };
}

export function planAddCanvasViewItem(
  document: AuthorStructureDocument,
  viewNode: string,
  value: CanvasViewItem,
): readonly AuthorStructureOperation[] {
  const view = declaration(document, viewNode, "View");
  if (value.id.trim().length === 0 || value.subject.trim().length === 0
    || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new Error("Canvas View item is invalid.");
  }
  return [{
    kind: "insert",
    container: view.children,
    value: {
      kind: "declaration",
      name: "item",
      label: value.id,
      fields: [
        { kind: "field", name: "subject", value: { kind: "reference", path: value.subject } },
        { kind: "field", name: "layout", value: { kind: "record", entries: [
          { kind: "entry", name: "x", value: { kind: "literal", value: String(value.x), style: "bare" } },
          { kind: "entry", name: "y", value: { kind: "literal", value: String(value.y), style: "bare" } },
        ] } },
      ],
      children: [],
    },
  }];
}

export function planMoveCanvasViewItem(
  document: AuthorStructureDocument,
  itemNode: string,
  layout: { readonly x: number; readonly y: number },
): readonly AuthorStructureOperation[] {
  if (!Number.isFinite(layout.x) || !Number.isFinite(layout.y)) {
    throw new Error("Canvas View item position must be finite.");
  }
  const value = declaration(document, itemNode, "item");
  const record = node(document, field(document, value, "layout").value, "record") as AuthorStructureRecordNode;
  const x = recordEntry(document, record, "x");
  const y = recordEntry(document, record, "y");
  return [
    { kind: "replace", node: x.value, value: { kind: "literal", value: String(layout.x), style: "bare" } },
    { kind: "replace", node: y.value, value: { kind: "literal", value: String(layout.y), style: "bare" } },
  ];
}

function editRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Canvas View edit input must be a record.");
  }
  return input as Record<string, unknown>;
}

export const canvasViewEditPlanner: AuthorEditPlanner = {
  module: canvasViewModuleRef,
  declaration: "View",
  actions: [{
    name: "add-item",
    summary: "Adds an independently authored subject to this Canvas layout.",
    input: { kind: "object", fields: {
      id: { schema: { kind: "string", minLength: 1 } },
      subject: { schema: { kind: "string", minLength: 1 } },
      x: { schema: { kind: "number" } },
      y: { schema: { kind: "number" } },
    } },
    plan({ document, subject }, input) {
      if (subject === undefined) throw new Error("add-item requires a Canvas View subject.");
      const value = editRecord(input);
      if (typeof value.id !== "string" || typeof value.subject !== "string"
        || typeof value.x !== "number" || typeof value.y !== "number") {
        throw new Error("add-item requires id, subject, x and y.");
      }
      return planAddCanvasViewItem(document, subject.node, {
        id: value.id, subject: value.subject, x: value.x, y: value.y,
      });
    },
  }, {
    name: "move-item",
    summary: "Changes only one Canvas View item's local layout.",
    input: { kind: "object", fields: {
      x: { schema: { kind: "number" } },
      y: { schema: { kind: "number" } },
    } },
    plan({ document, subject }, input) {
      if (subject === undefined) throw new Error("move-item requires a Canvas item subject.");
      const value = editRecord(input);
      if (typeof value.x !== "number" || typeof value.y !== "number") {
        throw new Error("move-item requires x and y.");
      }
      return planMoveCanvasViewItem(document, subject.node, { x: value.x, y: value.y });
    },
  }],
};
