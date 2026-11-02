import { declarationField, sealGraphFragment, type AuthorDeclarationCompiler } from "@hypit/hypit/author";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { sealText, textTypes } from "@hypit/hypit/text";
import { assertCaptionDocumentIdentity } from "./identity.js";
import { captionModuleRef, captionProducers, captionTypes } from "./manifest.js";
import type { CaptionDocument } from "./types.js";

export function captionCueText(document: CaptionDocument, cueId: string) {
  assertCaptionDocumentIdentity(document);
  const cue = document.cues.find(cue => cue.id === cueId);
  if (!cue) throw new Error(`Caption Cue is unavailable: ${cueId}`);
  const units = new Set(cue.unitIds), words = document.words.filter(word => units.has(word.unitId));
  return sealText(words.map((word, index) => `${index ? word.separatorBefore : ""}${word.text}`).join(""));
}

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const fragment = sealGraphFragment({
  inputs: [{ name: "document", type: captionTypes.document }, { name: "cue", type: captionTypes.cueSelection }],
  operations: [{ id: "text", producer: captionProducers.cueText, inputs: { document: input("document"), cue: input("cue") }, result: { kind: "output", name: "text" } }],
  exports: [{ name: "text", type: textTypes.text, root: { kind: "fragment-operation", operation: "text" } }],
});
function literal(node: Parameters<AuthorDeclarationCompiler["bindings"]>[0], name: string) {
  const value = declarationField(node, name);
  if (value?.kind !== "literal") throw new Error(`Caption Text.${name} must be literal.`);
  return value.value;
}
export const captionTextAuthorDeclaration: AuthorDeclarationCompiler = {
  module: captionModuleRef, declaration: "text", outputs: [textTypes.text, captionTypes.cueSelection],
  shape: { summary: "The displayed text of one Caption Cue.", fields: [
    { name: "id", kind: "identifier", required: true, summary: "Text identity." },
    { name: "document", kind: "reference", required: true, accepts: [captionTypes.document], summary: "Caption content." },
    { name: "cue", kind: "literal", required: true, summary: "Cue identity in the caption document." },
  ] },
  bindings(declaration) { const id = literal(declaration, "id"); return [{ name: id, type: textTypes.text, ref: { kind: "component-output", component: id, output: "text" } }]; },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id"), value = declarationField(declaration, "document");
    if (value?.kind !== "reference") throw new Error("Caption Text.document must be a reference.");
    const document = await resolveReference(value.path);
    if (!document || !sameType(document.type, captionTypes.document)) throw new Error("Caption Text.document must reference a CaptionDocument.");
    const selection = `${id}:cue`;
    return {
      records: [{ id: selection, type: captionTypes.cueSelection, value: canonicalize({ cueId: literal(declaration, "cue") }), range: declaration.range }],
      components: [{ id, fragment, inputs: { document: document.ref, cue: { kind: "record", id: selection } }, outputs: { text: id }, range: declaration.range }],
    };
  },
};
export const captionTextMarkupDeclaration = { name: "text", tag: "Text" } as const;
