import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationCompiler,
} from "@hypit/hypit/author";
import type { CanonicalValue } from "@hypit/hypit/protocol";

import { captionModuleRef, captionTypes } from "./manifest.js";
import { sealCaptionStyle } from "./style.js";

function idOf(declaration: AuthorDeclaration): string {
  const value = declarationField(declaration, "id");
  if (value?.kind !== "literal") throw new Error("Caption Hidden.id must be literal.");
  return value.value;
}

/** The semantic author declaration is independent of its Markup spelling. */
export const hiddenCaptionStyleAuthorDeclaration: AuthorDeclarationCompiler = {
  module: captionModuleRef,
  declaration: "hidden",
  outputs: [captionTypes.style],
  shape: {
    summary: "Declares a Caption Style that contributes no rendering when selected by a Use.",
    fields: [{
      name: "id",
      kind: "identifier",
      required: true,
      summary: "Names the hidden Caption Style.",
    }],
  },
  bindings(declaration) {
    const id = idOf(declaration);
    return [{ name: id, ref: { kind: "record", id }, type: captionTypes.style }];
  },
  compile({ declaration }) {
    const id = idOf(declaration);
    return {
      records: [{
        id,
        type: captionTypes.style,
        value: sealCaptionStyle({ id, rendering: null }) as unknown as CanonicalValue,
        range: declaration.range,
      }],
      components: [],
    };
  },
};

/** Markup owns this spelling; Caption owns its semantic shape. */
export const hiddenCaptionStyleMarkupDeclaration = { name: "hidden", tag: "Hidden" } as const;
