import type {
  AuthorDeclarationCompiler,
  AuthorEditPlanner,
  AuthorStructureDeclarationNode,
  AuthorStructureDocument,
  AuthorStructureFieldNode,
  AuthorStructureListNode,
  AuthorStructureOperation,
  AuthorStructureReferenceNode,
} from "@hypit/hypit/author";
import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ModuleManifest } from "@hypit/hypit/protocol";

export {
  assembleNleSubjectProjection,
  assertNleSubjectProjection,
  createNleSubjectProjectorFacet,
  installNleSubjectProjectorFacets,
  nleProjectedActionInvocation,
  prepareNleSubjectProjection,
  projectPreparedNleSubject,
  NleSubjectProjectorRegistry,
  nleSubjectProjectorFacetAbi,
} from "./projection.js";
export type {
  NleProjectedAction,
  NleProjectionValue,
  NleProjectionValueRequirement,
  NlePreparedSubjectProjection,
  NleProjectionObservation,
  NleProjectionObservedRef,
  NleSubjectLocation,
  NleSubjectProjection,
  NleSubjectProjectionContext,
  NleSubjectProjectionRequest,
  NleSubjectProjector,
  NleTemporalProjectionItem,
} from "./projection.js";
export {
  prepareNleViewProjection,
  projectPreparedNleView,
} from "./assembly.js";
export type {
  NlePreparedViewProjection,
  NlePreparedViewSubject,
  NleProjectedView,
  NleProjectedViewSubject,
} from "./assembly.js";

export const nleViewModuleRef = { name: "@hypit/nle-view", version: "1" } as const;

export const nleViewManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: nleViewModuleRef.name,
  version: nleViewModuleRef.version,
  dependencies: [audiovisualDependency],
  types: [],
  capabilities: [],
  producers: [],
};

/** View validation only; it deliberately contributes no Records or graph Components. */
export const nleViewAuthorDeclaration: AuthorDeclarationCompiler = {
  module: nleViewModuleRef,
  declaration: "View",
  outputs: [],
  shape: {
    summary: "Persists one NLE observation of an audiovisual Programme.",
    label: "required",
    fields: [{ name: "programme", kind: "reference", required: true, accepts: [audiovisualTypes.program],
      summary: "Selects the Programme whose facts are projected." }],
    children: [{
      name: "lane",
      label: "required",
      cardinality: "many",
      summary: "Groups projected Programme endpoints for display.",
      fields: [
        { name: "label", kind: "literal", required: true, summary: "Sets the displayed lane label." },
        { name: "items", kind: "expression", referenceScope: "declaration", required: true,
          summary: "Orders Programme-local projected endpoints in this lane." },
      ],
    }],
  },
  bindings() { return []; },
  compile() { return { records: [], components: [] }; },
};

export type NleViewLane = {
  readonly id: string;
  readonly label: string;
  readonly items: readonly string[];
};

export type NleViewProjection = {
  readonly id: string;
  readonly programme: string;
  readonly lanes: readonly NleViewLane[];
};

function declaration(document: AuthorStructureDocument, id: string,
  name: string): AuthorStructureDeclarationNode {
  const value = document.nodes.find((candidate): candidate is AuthorStructureDeclarationNode =>
    candidate.node === id && candidate.kind === "declaration");
  if (value === undefined || value.name !== name) throw new Error(`Author endpoint ${id} is not ${name}.`);
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

function reference(document: AuthorStructureDocument, id: string): AuthorStructureReferenceNode {
  const value = document.nodes.find((candidate): candidate is AuthorStructureReferenceNode =>
    candidate.node === id && candidate.kind === "reference");
  if (value === undefined) throw new Error(`Author endpoint ${id} is not a reference.`);
  return value;
}

function list(document: AuthorStructureDocument, id: string): AuthorStructureListNode {
  const value = document.nodes.find((candidate): candidate is AuthorStructureListNode =>
    candidate.node === id && candidate.kind === "list");
  if (value === undefined) throw new Error(`Author endpoint ${id} is not a list.`);
  return value;
}

function lane(document: AuthorStructureDocument, id: string): NleViewLane {
  const value = declaration(document, id, "lane");
  if (value.label === undefined) throw new Error("NLE lane requires a label identity.");
  const labelValue = document.nodes.find((candidate) => candidate.node === field(document, value, "label").value);
  if (labelValue?.kind !== "literal") throw new Error("NLE lane label must be literal text.");
  const items = list(document, field(document, value, "items").value);
  const container = document.containers.find((candidate) => candidate.container === items.items);
  return {
    id: value.label,
    label: labelValue.value,
    items: (container?.items ?? []).map((item) => reference(document, item).path),
  };
}

export function projectNleView(document: AuthorStructureDocument, viewNode: string): NleViewProjection {
  const view = declaration(document, viewNode, "View");
  if (view.label === undefined) throw new Error("NLE View requires a label.");
  const programme = reference(document, field(document, view, "programme").value).path;
  const children = document.containers.find((candidate) => candidate.container === view.children);
  return {
    id: view.label,
    programme,
    lanes: (children?.items ?? []).map((id) => lane(document, id)),
  };
}

export function planAddNleLaneItem(
  document: AuthorStructureDocument,
  laneNode: string,
  subject: string,
): readonly AuthorStructureOperation[] {
  if (subject.trim().length === 0) throw new Error("NLE lane subject is empty.");
  const value = declaration(document, laneNode, "lane");
  const items = list(document, field(document, value, "items").value);
  return [{
    kind: "insert",
    container: items.items,
    value: { kind: "reference", path: subject },
  }];
}

/** Lane changes are View-only; they never modify Occurrence placement or Picture/Audio graphs. */
export function planMoveNleLaneItem(
  document: AuthorStructureDocument,
  itemNode: string,
  targetLaneNode: string,
): readonly AuthorStructureOperation[] {
  const target = declaration(document, targetLaneNode, "lane");
  const items = list(document, field(document, target, "items").value);
  reference(document, itemNode);
  return [{ kind: "move", node: itemNode, container: items.items }];
}

function editRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("NLE View edit input must be a record.");
  }
  return input as Record<string, unknown>;
}

export const nleViewEditPlanner: AuthorEditPlanner = {
  module: nleViewModuleRef,
  declaration: "View",
  actions: [{
    name: "add-lane-item",
    summary: "Adds one projected Programme endpoint to a lane.",
    input: { kind: "object", fields: {
      endpoint: { schema: { kind: "string", minLength: 1 } },
    } },
    plan({ document, subject }, input) {
      if (subject === undefined) throw new Error("add-lane-item requires a lane subject.");
      const value = editRecord(input);
      if (typeof value.endpoint !== "string") throw new Error("add-lane-item requires endpoint.");
      return planAddNleLaneItem(document, subject.node, value.endpoint);
    },
  }, {
    name: "move-lane-item",
    summary: "Moves only View membership; Programme placement is untouched.",
    input: { kind: "object", fields: {
      lane: { schema: { kind: "string", minLength: 1 } },
    } },
    plan({ document, subject }, input) {
      if (subject === undefined) throw new Error("move-lane-item requires an item subject.");
      const value = editRecord(input);
      if (typeof value.lane !== "string") throw new Error("move-lane-item requires target lane locator.");
      return planMoveNleLaneItem(document, subject.node, value.lane);
    },
  }],
};
