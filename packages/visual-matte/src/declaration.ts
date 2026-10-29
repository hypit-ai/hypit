import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationCompiler,
} from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";

import { visualMatteModuleRef } from "./manifest.js";
import { visualMatteEffect, type VisualMatteChannel } from "./program.js";

function literal(declaration: AuthorDeclaration, name: string, fallback?: string): string {
  const value = declarationField(declaration, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${declaration.name}.${name} must be non-empty text.`);
  }
  return value.value.trim();
}

function boolean(declaration: AuthorDeclaration, name: string, fallback: boolean): boolean {
  const value = literal(declaration, name, String(fallback));
  if (value !== "true" && value !== "false") throw new Error(`${declaration.name}.${name} must be true or false.`);
  return value === "true";
}

export const visualMatteAuthorDeclaration: AuthorDeclarationCompiler = {
  module: visualMatteModuleRef,
  declaration: "effect",
  outputs: [compositionTypes.visualProcessEffect],
  shape: {
    summary: "Interprets one sibling Picture as the alpha or luminance matte of another Picture.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names this reusable matte effect." },
      { name: "channel", kind: "literal", required: false, values: ["alpha", "luminance"], fallback: "alpha",
        summary: "Selects the matte signal read from the matte Picture." },
      { name: "invert", kind: "literal", required: false, values: ["false", "true"], fallback: "false",
        summary: "Inverts the selected matte signal before applying it." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: id, ref: { kind: "record", id }, type: compositionTypes.visualProcessEffect }];
  },
  compile({ declaration }) {
    const id = literal(declaration, "id");
    return {
      records: [{
        id,
        type: compositionTypes.visualProcessEffect,
        value: visualMatteEffect(
          literal(declaration, "channel", "alpha") as VisualMatteChannel,
          boolean(declaration, "invert", false),
        ) as never,
        range: declaration.range,
      }],
      components: [],
    };
  },
};

export const visualMatteAuthorDeclarations = [visualMatteAuthorDeclaration] as const;
export const visualMatteMarkupDeclarations = [{ name: "effect", tag: "Effect" }] as const;
