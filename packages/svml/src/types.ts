import type { SourceRange, SourceUnit } from "@hypit/generation-authoring/source";

type SvmlSyntaxNode = {
  readonly range: SourceRange;
  /** Leading trivia owned when this node is removed or moved. */
  readonly ownedRange: SourceRange;
};

export type SvmlImportSyntax = SvmlSyntaxNode & {
  readonly kind: "module" | "source";
  readonly alias: string;
  readonly from: string;
};

export type SvmlLiteralSyntax = SvmlSyntaxNode & {
  readonly kind: "literal";
  readonly value: string;
  readonly style: "bare" | "quoted" | "raw";
};

export type SvmlReferenceSyntax = SvmlSyntaxNode & {
  readonly kind: "reference";
  readonly path: string;
};

export type SvmlListSyntax = SvmlSyntaxNode & {
  readonly kind: "list";
  readonly items: readonly SvmlValueSyntax[];
  readonly contentRange: SourceRange;
};

export type SvmlRecordEntrySyntax = SvmlSyntaxNode & {
  readonly kind: "entry";
  readonly name: string;
  readonly value: SvmlValueSyntax;
};

export type SvmlRecordSyntax = SvmlSyntaxNode & {
  readonly kind: "record";
  readonly entries: readonly SvmlRecordEntrySyntax[];
  readonly contentRange: SourceRange;
};

export type SvmlValueSyntax =
  | SvmlLiteralSyntax
  | SvmlReferenceSyntax
  | SvmlListSyntax
  | SvmlRecordSyntax;

export type SvmlFieldSyntax = SvmlSyntaxNode & {
  readonly kind: "field";
  readonly name: string;
  readonly value: SvmlValueSyntax;
};

export type SvmlDeclarationSyntax = SvmlSyntaxNode & {
  readonly kind: "declaration";
  /** Present only for an independent root subject. */
  readonly moduleAlias?: string;
  readonly name: string;
  readonly label?: string;
  readonly labelRange?: SourceRange;
  readonly fields: readonly SvmlFieldSyntax[];
  readonly children: readonly SvmlDeclarationSyntax[];
  readonly contentRange: SourceRange;
};

export type SvmlDocumentSyntax = {
  readonly source: SourceUnit;
  readonly text: string;
  readonly imports: readonly SvmlImportSyntax[];
  readonly declarations: readonly SvmlDeclarationSyntax[];
};
