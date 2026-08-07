import type { CanonicalValue, SourceRange } from "@narratage/protocol";

export type SvsRecipe = {
  readonly contract: "svml.svs-recipe@1";
  readonly path: string;
  readonly properties: Readonly<Record<string, CanonicalValue>>;
};

export type ParsedSvsRecipe = {
  readonly value: SvsRecipe;
  readonly range: SourceRange;
};

export type ParsedSvsSheet = {
  readonly id?: string;
  readonly recipes: readonly ParsedSvsRecipe[];
};
