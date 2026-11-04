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

export type AuthorDocumentTextMark = "bold" | "italic" | "underline" | "strikethrough";

export type AuthorDocumentInline =
  | {
      readonly kind: "text";
      readonly value: string;
      readonly marks: readonly AuthorDocumentTextMark[];
      readonly range: SourceRange;
    }
  | {
      readonly kind: "code" | "math";
      readonly value: string;
      readonly range: SourceRange;
    }
  | {
      readonly kind: "link";
      readonly url: string;
      readonly title?: string;
      readonly children: readonly AuthorDocumentInline[];
      readonly range: SourceRange;
    }
  | {
      readonly kind: "image";
      readonly url: string;
      readonly alt: string;
      readonly title?: string;
      readonly range: SourceRange;
    }
  | {
      readonly kind: "break";
      readonly range: SourceRange;
    }
  | {
      readonly kind: "footnote-reference";
      readonly label: string;
      readonly range: SourceRange;
    }
  | {
      readonly kind: "link-reference";
      readonly label: string;
      readonly referenceType: "shortcut" | "collapsed" | "full";
      readonly children: readonly AuthorDocumentInline[];
      readonly range: SourceRange;
    }
  | {
      readonly kind: "image-reference";
      readonly label: string;
      readonly referenceType: "shortcut" | "collapsed" | "full";
      readonly alt: string;
      readonly range: SourceRange;
    };

type AuthorDocumentBlockBase = {
  readonly node: AuthorDocumentNodeId;
  readonly range: SourceRange;
};

export type AuthorDocumentBlock =
  | (AuthorDocumentBlockBase & {
      readonly kind: "paragraph" | "table-cell";
      readonly content: readonly AuthorDocumentInline[];
    })
  | (AuthorDocumentBlockBase & {
      readonly kind: "heading";
      readonly level: number;
      readonly content: readonly AuthorDocumentInline[];
    })
  | (AuthorDocumentBlockBase & {
      readonly kind: "blockquote";
      readonly children: readonly AuthorDocumentBlock[];
    })
  | (AuthorDocumentBlockBase & {
      readonly kind: "list-item";
      readonly children: readonly AuthorDocumentBlock[];
      readonly checked?: boolean;
    })
  | (AuthorDocumentBlockBase & {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly start?: number;
      readonly children: readonly AuthorDocumentBlock[];
    })
  | (AuthorDocumentBlockBase & {
      readonly kind: "code";
      readonly language?: string;
      readonly meta?: string;
      readonly value: string;
    })
  | (AuthorDocumentBlockBase & {
      readonly kind: "divider";
    })
  | (AuthorDocumentBlockBase & {
      readonly kind: "table";
      readonly align: readonly ("left" | "right" | "center" | null)[];
      readonly children: readonly AuthorDocumentBlock[];
    })
  | (AuthorDocumentBlockBase & {
      readonly kind: "table-row";
      readonly children: readonly AuthorDocumentBlock[];
    })
  | (AuthorDocumentBlockBase & {
      readonly kind: "math";
      readonly value: string;
    })
  | (AuthorDocumentBlockBase & {
      readonly kind: "footnote-definition";
      readonly label: string;
      readonly children: readonly AuthorDocumentBlock[];
    })
  | (AuthorDocumentBlockBase & {
      readonly kind: "link-definition";
      readonly label: string;
      readonly url: string;
      readonly title?: string;
    });

type DistributiveOmit<Value, Keys extends PropertyKey> = Value extends unknown
  ? Omit<Value, Extract<keyof Value, Keys>>
  : never;

export type AuthorDocumentInlineDraft =
  | Omit<Extract<AuthorDocumentInline, { readonly kind: "text" }>, "range">
  | Omit<Extract<AuthorDocumentInline, { readonly kind: "code" | "math" }>, "range">
  | Omit<Extract<AuthorDocumentInline, { readonly kind: "link" }>, "range" | "children"> & {
      readonly children: readonly AuthorDocumentInlineDraft[];
    }
  | Omit<Extract<AuthorDocumentInline, { readonly kind: "image" }>, "range">
  | Omit<Extract<AuthorDocumentInline, { readonly kind: "break" }>, "range">
  | Omit<Extract<AuthorDocumentInline, { readonly kind: "footnote-reference" }>, "range">
  | Omit<Extract<AuthorDocumentInline, { readonly kind: "link-reference" }>, "range" | "children"> & {
      readonly children: readonly AuthorDocumentInlineDraft[];
    }
  | Omit<Extract<AuthorDocumentInline, { readonly kind: "image-reference" }>, "range">;

export type AuthorDocumentBlockDraft =
  | Omit<Extract<AuthorDocumentBlock, { readonly kind: "paragraph" | "table-cell" }>, "node" | "range" | "content"> & {
      readonly content: readonly AuthorDocumentInlineDraft[];
    }
  | Omit<Extract<AuthorDocumentBlock, { readonly kind: "heading" }>, "node" | "range" | "content"> & {
      readonly content: readonly AuthorDocumentInlineDraft[];
    }
  | Omit<Extract<AuthorDocumentBlock, { readonly kind: "blockquote" }>, "node" | "range" | "children"> & {
      readonly children: readonly AuthorDocumentBlockDraft[];
    }
  | Omit<Extract<AuthorDocumentBlock, { readonly kind: "list-item" }>, "node" | "range" | "children"> & {
      readonly children: readonly AuthorDocumentBlockDraft[];
    }
  | Omit<Extract<AuthorDocumentBlock, { readonly kind: "list" }>, "node" | "range" | "children"> & {
      readonly children: readonly AuthorDocumentBlockDraft[];
    }
  | DistributiveOmit<Extract<AuthorDocumentBlock, { readonly kind: "code" | "divider" | "math" | "link-definition" }>, "node" | "range">
  | DistributiveOmit<Extract<AuthorDocumentBlock, { readonly kind: "table" | "table-row" }>, "node" | "range" | "children"> & {
      readonly children: readonly AuthorDocumentBlockDraft[];
    }
  | Omit<Extract<AuthorDocumentBlock, { readonly kind: "footnote-definition" }>, "node" | "range" | "children"> & {
      readonly children: readonly AuthorDocumentBlockDraft[];
    };

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
  readonly blocks: readonly AuthorDocumentBlock[];
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
      readonly kind: "insert-block";
      readonly container: AuthorDocumentNodeId;
      readonly before?: AuthorDocumentNodeId;
      readonly block: AuthorDocumentBlockDraft;
    }
  | {
      readonly kind: "replace-block";
      readonly block: AuthorDocumentNodeId;
      readonly value: AuthorDocumentBlockDraft;
    }
  | {
      readonly kind: "delete-block";
      readonly block: AuthorDocumentNodeId;
    }
  | {
      readonly kind: "move-block";
      readonly block: AuthorDocumentNodeId;
      readonly container: AuthorDocumentNodeId;
      readonly before?: AuthorDocumentNodeId;
    }
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
