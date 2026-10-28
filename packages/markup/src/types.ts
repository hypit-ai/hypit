import type { SourceRange } from "@hypit/source";

/** Decoder-local Markup text; Source identity and closure ownership stay outside the parser. */
export type MarkupSource = {
  readonly id?: string;
  readonly name: string;
  readonly text: string;
};

export type MarkupImportRequest = {
  readonly kind: "module" | "source";
  readonly from: string;
  readonly alias?: string;
  readonly range: SourceRange;
};

export type MarkupDiscovery = {
  readonly imports: readonly MarkupImportRequest[];
  readonly rootStart: number;
  readonly bodyStart: number;
};

export type MarkupReference = {
  readonly kind: "reference";
  readonly path: string;
};

export type MarkupAttributeValue = string | MarkupReference;

export type StructuredText = {
  readonly kind: "text";
  readonly value: string;
  readonly range: SourceRange;
};

export type StructuredElement = {
  readonly kind: "element";
  readonly name: string;
  readonly attributes: Readonly<Record<string, MarkupAttributeValue>>;
  /** Exact ranges of literal/reference values in the opening tag. */
  readonly attributeValueRanges?: Readonly<Record<string, SourceRange>>;
  readonly children: readonly StructuredNode[];
  readonly range: SourceRange;
};

export type StructuredNode = StructuredText | StructuredElement;
