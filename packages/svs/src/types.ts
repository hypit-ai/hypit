import type { CanonicalValue, SourceRange } from "@narratage/protocol";

export type SvsRecipe = {
  readonly path: string;
  readonly properties: Readonly<Record<string, CanonicalValue>>;
};

export type ParsedSvsRecipe = {
  readonly value: SvsRecipe;
  readonly range: SourceRange;
  /** Exact author-source spans, for editors that must preserve surrounding trivia. */
  readonly properties: readonly ParsedSvsProperty[];
};

export type ParsedSvsProperty = {
  readonly name: string;
  /** From the property name through its terminating semicolon. */
  readonly range: SourceRange;
  /** The trimmed value only; replacing this span preserves author formatting. */
  readonly valueRange: SourceRange;
};

export type ParsedSvsSheet = {
  readonly id?: string;
  readonly recipes: readonly ParsedSvsRecipe[];
};
