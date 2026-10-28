import {
  declarationField,
  type AuthorDeclarationBinding,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { compositionTypes } from "@hypit/composition";
import { timelineTypes } from "@hypit/timeline";

import { htmlDocumentFragment } from "./fragment.js";
import { htmlDocumentModuleRef, htmlDocumentTypes } from "./manifest.js";

function literal(declaration: Parameters<typeof declarationField>[0], name: string): string {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${declaration.name}.${name} must be non-empty text.`);
  }
  return value.value.trim();
}

async function resolved(
  declaration: Parameters<typeof declarationField>[0],
  name: string,
  type: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = declarationField(declaration, name);
  if (value?.kind !== "reference") throw new Error(`${declaration.name}.${name} must be a reference.`);
  const reference = await resolveReference(value.path);
  if (reference === undefined || !sameType(reference.type, type)) throw new Error(`${declaration.name}.${name} has the wrong Type.`);
  return reference;
}

function outputBinding(component: string): AuthorDeclarationBinding {
  return {
    name: `${component}.document`,
    ref: { kind: "component-output", component, output: "document" },
    type: htmlDocumentTypes.document,
  };
}

export const htmlDocumentAuthorDeclaration: AuthorDeclarationCompiler = {
  module: htmlDocumentModuleRef,
  declaration: "document",
  outputs: [htmlDocumentTypes.document],
  shape: {
    summary: "Compiles one Composition and Timeline into a browser-playable document.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the document component." },
      { name: "composition", kind: "reference", required: true, accepts: [compositionTypes.composition], summary: "Selects the picture and sound." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the absolute frame clock and duration." },
    ],
  },
  bindings(declaration) {
    return [outputBinding(literal(declaration, "id"))];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const composition = await resolved(declaration, "composition", compositionTypes.composition, resolveReference);
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    return {
      records: [],
      components: [{
        id,
        fragment: htmlDocumentFragment,
        inputs: { composition: composition.ref, timeline: timeline.ref },
        outputs: { document: `${id}.document` },
        range: declaration.range,
      }],
    };
  },
};

export const htmlDocumentAuthorDeclarations = [htmlDocumentAuthorDeclaration] as const;

export const htmlDocumentMarkupDeclarations = [{ name: "document", tag: "Document" }] as const;
