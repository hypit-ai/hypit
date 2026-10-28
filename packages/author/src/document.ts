import type { ModuleRef } from "@hypit/protocol";
import type { SourceRange, SourceUnit } from "@hypit/source";

import type {
  AuthorDeclarationChild,
  AuthorDeclarationBodyPart,
  AuthorDeclarationDraft,
  AuthorDeclarationFieldValue,
} from "./declaration.js";

/** Frontend-local locator, valid for one parsed Source revision. */
export type AuthorDocumentNodeId = string;

export type AuthorDocumentField = {
  readonly name: string;
  readonly value: AuthorDeclarationFieldValue;
};

export type AuthorDocumentDeclaration = {
  readonly node: AuthorDocumentNodeId;
  readonly container: AuthorDocumentNodeId;
  readonly module: ModuleRef;
  readonly name: string;
  readonly fields: readonly AuthorDocumentField[];
  readonly children: readonly AuthorDeclarationChild[];
  readonly body?: readonly AuthorDeclarationBodyPart[];
  readonly text?: string;
  readonly textRange?: SourceRange;
  readonly range: SourceRange;
};

export type AuthorDocumentContainer = {
  readonly node: AuthorDocumentNodeId;
  readonly declarations: readonly AuthorDocumentNodeId[];
};

/**
 * Editable projection of one Source. `representation` is owned exclusively by
 * its Frontend and never enters AuthorGraph or package compilers.
 */
export type AuthorDocument = {
  readonly source: SourceUnit;
  /** Frontend-neutral imports visible in this Source revision. */
  readonly imports: readonly AuthorDocumentImport[];
  readonly root: AuthorDocumentContainer;
  readonly containers: readonly AuthorDocumentContainer[];
  readonly declarations: readonly AuthorDocumentDeclaration[];
  readonly representation: unknown;
};

export type AuthorDocumentImport = {
  readonly kind: "module" | "source";
  readonly from: string;
  readonly alias?: string;
};

export type AuthorDocumentOperation =
  | {
      readonly kind: "add-field";
      readonly declaration: AuthorDocumentNodeId;
      readonly name: string;
      readonly value: AuthorDeclarationFieldValue;
    }
  | {
      readonly kind: "replace-field";
      readonly declaration: AuthorDocumentNodeId;
      readonly name: string;
      readonly value: AuthorDeclarationFieldValue;
    }
  | {
      readonly kind: "remove-field";
      readonly declaration: AuthorDocumentNodeId;
      readonly name: string;
    }
  | {
      readonly kind: "replace-text";
      readonly declaration: AuthorDocumentNodeId;
      readonly value: string;
    }
  | {
      readonly kind: "insert-declaration";
      readonly container: AuthorDocumentNodeId;
      readonly before?: AuthorDocumentNodeId;
      readonly declaration: AuthorDeclarationDraft;
    }
  | {
      readonly kind: "delete-declaration";
      readonly declaration: AuthorDocumentNodeId;
    }
  | {
      readonly kind: "move-declaration";
      readonly declaration: AuthorDocumentNodeId;
      readonly container: AuthorDocumentNodeId;
      readonly before?: AuthorDocumentNodeId;
    }
  | {
      readonly kind: "add-import";
      readonly value: AuthorDocumentImport;
    }
  | {
      readonly kind: "remove-import";
      readonly value: AuthorDocumentImport;
    };

export interface AuthorDocumentFrontend {
  openDocument(source: SourceUnit): Promise<AuthorDocument>;
  applyDocumentOperations(
    document: AuthorDocument,
    operations: readonly AuthorDocumentOperation[],
  ): Promise<SourceUnit>;
}
