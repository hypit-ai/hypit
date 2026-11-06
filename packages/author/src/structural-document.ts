import type { ModuleRef } from "@hypit/protocol";
import type { SourceRange, SourceUnit } from "@hypit/source";

/** Frontend-local identity. It is valid only for the Source revision that published it. */
export type AuthorStructureNodeId = string;

/** One ordered structural insertion boundary in a lossless author document. */
export type AuthorStructureContainerId = string;

export type AuthorStructureImport = {
  readonly kind: "module" | "source";
  readonly from: string;
  readonly alias: string;
};

export type AuthorStructureLiteralStyle = "bare" | "quoted" | "raw";

export type AuthorStructureValueDraft =
  | {
      readonly kind: "literal";
      readonly value: string;
      readonly style: AuthorStructureLiteralStyle;
    }
  | {
      readonly kind: "reference";
      readonly path: string;
    }
  | {
      readonly kind: "list";
      readonly items: readonly AuthorStructureValueDraft[];
    }
  | {
      readonly kind: "record";
      readonly entries: readonly AuthorStructureRecordEntryDraft[];
    };

export type AuthorStructureRecordEntryDraft = {
  readonly kind: "entry";
  readonly name: string;
  readonly value: AuthorStructureValueDraft;
};

export type AuthorStructureLabelDraft = {
  readonly kind: "label";
  readonly value: string;
};

export type AuthorStructureFieldDraft = {
  readonly kind: "field";
  readonly name: string;
  readonly value: AuthorStructureValueDraft;
};

/**
 * A top-level declaration has a Module. A child omits it and is interpreted
 * exclusively by its nearest package-owned declaration parent.
 */
export type AuthorStructureDeclarationDraft = {
  readonly kind: "declaration";
  readonly module?: ModuleRef;
  readonly name: string;
  readonly label?: string;
  readonly fields: readonly AuthorStructureFieldDraft[];
  readonly children: readonly AuthorStructureDeclarationDraft[];
};

export type AuthorStructureImportDraft =
  | { readonly kind: "module"; readonly from: string; readonly alias: string }
  | { readonly kind: "source"; readonly from: string; readonly alias: string };

export type AuthorStructureNodeDraft =
  | AuthorStructureImportDraft
  | AuthorStructureDeclarationDraft
  | AuthorStructureFieldDraft
  | AuthorStructureValueDraft
  | AuthorStructureRecordEntryDraft
  | AuthorStructureLabelDraft;

type AuthorStructureNodeBase = {
  readonly node: AuthorStructureNodeId;
  readonly range: SourceRange;
};

export type AuthorStructureImportNode = AuthorStructureNodeBase & AuthorStructureImport;

export type AuthorStructureDeclarationNode = AuthorStructureNodeBase & {
  readonly kind: "declaration";
  readonly module?: ModuleRef;
  readonly name: string;
  readonly label?: string;
  readonly labelNode?: AuthorStructureNodeId;
  readonly fields: AuthorStructureContainerId;
  readonly children: AuthorStructureContainerId;
};

export type AuthorStructureFieldNode = AuthorStructureNodeBase & {
  readonly kind: "field";
  readonly name: string;
  readonly value: AuthorStructureNodeId;
};

export type AuthorStructureLiteralNode = AuthorStructureNodeBase & {
  readonly kind: "literal";
  readonly value: string;
  readonly style: AuthorStructureLiteralStyle;
};

export type AuthorStructureReferenceNode = AuthorStructureNodeBase & {
  readonly kind: "reference";
  readonly path: string;
};

export type AuthorStructureListNode = AuthorStructureNodeBase & {
  readonly kind: "list";
  readonly items: AuthorStructureContainerId;
};

export type AuthorStructureRecordNode = AuthorStructureNodeBase & {
  readonly kind: "record";
  readonly entries: AuthorStructureContainerId;
};

export type AuthorStructureRecordEntryNode = AuthorStructureNodeBase & {
  readonly kind: "entry";
  readonly name: string;
  readonly value: AuthorStructureNodeId;
};

export type AuthorStructureLabelNode = AuthorStructureNodeBase & {
  readonly kind: "label";
  readonly value: string;
};

export type AuthorStructureNode =
  | AuthorStructureImportNode
  | AuthorStructureDeclarationNode
  | AuthorStructureFieldNode
  | AuthorStructureLiteralNode
  | AuthorStructureReferenceNode
  | AuthorStructureListNode
  | AuthorStructureRecordNode
  | AuthorStructureRecordEntryNode
  | AuthorStructureLabelNode;

export type AuthorStructureContainerKind =
  | "imports"
  | "declarations"
  | "fields"
  | "values"
  | "entries";

export type AuthorStructureContainer = {
  readonly container: AuthorStructureContainerId;
  readonly kind: AuthorStructureContainerKind;
  readonly owner?: AuthorStructureNodeId;
  readonly items: readonly AuthorStructureNodeId[];
};

/**
 * Lossless structural projection of one Source revision. `representation` is
 * owned by the selected Frontend and never enters AuthorGraph or package code.
 */
export type AuthorStructureDocument = {
  readonly source: SourceUnit;
  readonly imports: AuthorStructureContainerId;
  readonly declarations: AuthorStructureContainerId;
  readonly nodes: readonly AuthorStructureNode[];
  readonly containers: readonly AuthorStructureContainer[];
  readonly representation: unknown;
};

export type AuthorStructureOperation =
  | {
      readonly kind: "insert";
      readonly container: AuthorStructureContainerId;
      readonly before?: AuthorStructureNodeId;
      readonly value: AuthorStructureNodeDraft;
    }
  | {
      readonly kind: "replace";
      readonly node: AuthorStructureNodeId;
      readonly value: AuthorStructureNodeDraft;
    }
  | {
      readonly kind: "remove";
      readonly node: AuthorStructureNodeId;
    }
  | {
      readonly kind: "move";
      readonly node: AuthorStructureNodeId;
      readonly container: AuthorStructureContainerId;
      readonly before?: AuthorStructureNodeId;
    };

export interface AuthorStructureFrontend {
  openStructure(source: SourceUnit): Promise<AuthorStructureDocument>;
  applyStructureOperations(
    document: AuthorStructureDocument,
    operations: readonly AuthorStructureOperation[],
  ): Promise<SourceUnit>;
}

export function authorStructureNode(
  document: AuthorStructureDocument,
  node: AuthorStructureNodeId,
): AuthorStructureNode {
  const value = document.nodes.find((candidate) => candidate.node === node);
  if (value === undefined) throw new Error(`Unknown Author Structure node ${node}.`);
  return value;
}

export function authorStructureContainer(
  document: AuthorStructureDocument,
  container: AuthorStructureContainerId,
): AuthorStructureContainer {
  const value = document.containers.find((candidate) => candidate.container === container);
  if (value === undefined) throw new Error(`Unknown Author Structure container ${container}.`);
  return value;
}
