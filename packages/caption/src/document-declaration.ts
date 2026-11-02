import { declarationBody, declarationField, type AuthorDeclaration, type AuthorDeclarationChild, type AuthorDeclarationCompiler } from "@hypit/hypit/author";
import { canonicalize } from "@hypit/hypit/protocol";
import { assertCaptionDocumentIdentity } from "./identity.js";
import { captionModuleRef, captionTypes } from "./manifest.js";
import type { CaptionDocument, CaptionWordAttribute } from "./types.js";

type Node = Omit<AuthorDeclaration, "range"> | AuthorDeclarationChild;
function literal(node: Node, name: string, fallback?: string): string {
  const value = declarationField(node, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value?.kind !== "literal") throw new Error(`Caption ${node.name}.${name} must be literal.`);
  return value.value;
}
function nested(node: Node, name: string) {
  if (node.children.some(child => child.name !== name)) throw new Error(`Caption ${node.name} accepts ${name} children.`);
  return node.children;
}
function attribute(node: AuthorDeclarationChild): CaptionWordAttribute {
  const type = literal(node, "type", "string"), text = literal(node, "value");
  let value: CaptionWordAttribute["value"];
  if (type === "string") value = text;
  else if (type === "number" && text.trim() && Number.isFinite(Number(text))) value = Number(text);
  else if (type === "boolean" && (text === "true" || text === "false")) value = text === "true";
  else throw new Error("Caption Attribute value must match its declared type.");
  return { name: literal(node, "name"), value };
}

export function captionDocumentFromDeclaration(declaration: Omit<AuthorDeclaration, "range">): CaptionDocument {
  const words: CaptionDocument["words"][number][] = [], units: CaptionDocument["units"][number][] = [];
  const cues = nested(declaration, "Cue").map(cue => {
    const unitIds = nested(cue, "Unit").map(unit => {
      const unitId = literal(unit, "id");
      const wordIds = nested(unit, "Word").map(word => {
        const id = literal(word, "id"), separatorBefore = literal(word, "separator-before", "");
        if (separatorBefore !== "" && separatorBefore !== " ") throw new Error("Caption Word separator-before must be empty or one space.");
        const text = declarationBody(word).filter(part => part.kind === "text").map(part => part.value).join("");
        if (!text.length) throw new Error("Caption Word text must not be empty.");
        words.push({ id, unitId, separatorBefore, text, attributes: nested(word, "Attribute").map(attribute) });
        return id;
      });
      units.push({ id: unitId, wordIds });
      return unitId;
    });
    const role = literal(cue, "role", "");
    return { id: literal(cue, "id"), unitIds, ...(role ? { role } : {}) };
  });
  const document = { id: literal(declaration, "id"), cues, units, words };
  assertCaptionDocumentIdentity(document);
  return document;
}

const fields = (values: Record<string, string>) => Object.entries(values).map(([name, value]) => ({ name, value: { kind: "literal" as const, value } }));

/** Preserve cue, unit and word identities as individually addressable author nodes. */
export function captionDocumentDeclaration(document: CaptionDocument): Omit<AuthorDeclaration, "range"> {
  assertCaptionDocumentIdentity(document);
  const units = new Map(document.units.map(unit => [unit.id, unit])), words = new Map(document.words.map(word => [word.id, word]));
  return {
    module: captionModuleRef, name: "document", fields: fields({ id: document.id }),
    children: document.cues.map(cue => ({ name: "Cue", fields: fields({ id: cue.id, ...(cue.role === undefined ? {} : { role: cue.role }) }),
      children: cue.unitIds.map(id => ({ name: "Unit", fields: fields({ id }),
        children: units.get(id)!.wordIds.map(wordId => {
          const word = words.get(wordId)!;
          return { name: "Word", fields: fields({ id: word.id, "separator-before": word.separatorBefore }),
            body: [{ kind: "text" as const, value: word.text }, ...word.attributes.map((_, index) => ({ kind: "child" as const, index }))],
            children: word.attributes.map(item => ({ name: "Attribute", fields: fields({ name: item.name, type: typeof item.value, value: String(item.value) }), children: [] })),
          };
        }),
      })),
    })),
  };
}

const identifier = { name: "id", kind: "identifier", required: true, summary: "Stable content identity." } as const;
export const captionDocumentAuthorDeclaration: AuthorDeclarationCompiler = {
  module: captionModuleRef, declaration: "document", outputs: [captionTypes.document],
  shape: {
    summary: "Authored caption content with ordered cues, units and words.", fields: [identifier, { name: "source-uri", kind: "literal", required: false, summary: "Original source URI retained by the authoring document." }],
    children: [{ name: "Cue", cardinality: "many", summary: "One reading group.",
      fields: [identifier, { name: "role", kind: "literal", required: false, summary: "Optional speaker or presentation role." }],
      children: [{ name: "Unit", cardinality: "many", summary: "One independently timed display unit.", fields: [identifier],
        children: [{ name: "Word", cardinality: "many", summary: "One displayed word surface.", text: "Exact display text, including authored line breaks.",
          fields: [identifier, { name: "separator-before", kind: "literal", required: false, values: ["", " "], summary: "Separator from the preceding word." }],
          children: [{ name: "Attribute", cardinality: "many", summary: "Typed display metadata.", fields: [
            { name: "name", kind: "literal", required: true, summary: "Attribute name." },
            { name: "type", kind: "literal", required: false, values: ["string", "number", "boolean"], summary: "Value type, defaults to string." },
            { name: "value", kind: "literal", required: true, summary: "Attribute value." },
          ] }],
        }],
      }],
    }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: id, ref: { kind: "record", id }, type: captionTypes.document }];
  },
  compile({ declaration }) {
    const document = captionDocumentFromDeclaration(declaration);
    return { records: [{ id: document.id, type: captionTypes.document, value: canonicalize(document), range: declaration.range }], components: [] };
  },
};
export const captionDocumentMarkupDeclaration = { name: "document", tag: "Document" } as const;
