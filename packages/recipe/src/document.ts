import type {
  AuthorDeclarationDraft,
  AuthorDeclarationFieldValue,
  AuthorDocumentFrontend,
} from "@hypit/author";
import { moduleKey } from "@hypit/protocol";
import { decodeSourceText, type SourceUnit } from "@hypit/source";

import { formatRecipeValue } from "./format.js";
import { recipeModuleRef } from "./manifest.js";
import { parseRecipe } from "./parser.js";
import type { ParsedSvsSheet } from "./types.js";

type Representation = { source: SourceUnit; text: string; sheet: ParsedSvsSheet };
type Edit = { start: number; end: number; text: string };
const root = "sheet";
const node = (start: number) => `recipe:${start}`;
const propertyName = /^[a-z][a-z0-9-]*$/u;
const recipeName = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/u;

function field(name: string, value: AuthorDeclarationFieldValue): string {
  if (!propertyName.test(name)) throw new Error(`Invalid Recipe property: ${name}`);
  if (value.kind !== "literal") throw new Error("Recipe properties require literal values");
  const parsed = parseRecipe("Recipe field", `<sheet version="1">edit.value { ${name}: ${value.value}; }</sheet>`);
  const recipe = parsed.recipes[0]!;
  if (parsed.recipes.length !== 1 || recipe.properties.length !== 1 || recipe.properties[0]!.name !== name) {
    throw new Error("A Recipe field must contain exactly one value");
  }
  return formatRecipeValue(recipe.value.properties[name]!);
}

function declaration(draft: AuthorDeclarationDraft): string {
  if (moduleKey(draft.module) !== moduleKey(recipeModuleRef) || !recipeName.test(draft.name)) {
    throw new Error("A Recipe declaration requires the Recipe module and a dotted path");
  }
  if (draft.children.length || draft.body?.length || draft.text) throw new Error("Recipe declarations contain property fields");
  const lines = draft.fields.map(item => `  ${item.name}: ${field(item.name, item.value)};`);
  return `${draft.name} {\n${lines.join("\n")}\n}`;
}

function applyEdits(text: string, edits: readonly Edit[]): string {
  const ordered = edits.map((edit, index) => ({ ...edit, index }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index);
  let cursor = 0, output = "";
  for (const edit of ordered) {
    if (edit.start < cursor) throw new Error("Recipe operations overlap; apply them in separate stages");
    output += text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return output + text.slice(cursor);
}

/** Recipe paths are declaration names; literal fields use Recipe value syntax. */
export const recipeDocumentFrontend: AuthorDocumentFrontend = {
  async openDocument(source) {
    const text = decodeSourceText(source), sheet = parseRecipe(source.name, text);
    const container = { node: root, declarations: sheet.recipes.map(recipe => node(recipe.range.start)) };
    return {
      source, imports: [], root: container, containers: [container], nested: [],
      declarations: sheet.recipes.map(recipe => ({
        node: node(recipe.range.start), container: root, module: recipeModuleRef,
        name: recipe.value.path, range: recipe.range, children: [],
        fields: recipe.properties.map(property => ({ name: property.name,
          value: { kind: "literal", value: formatRecipeValue(recipe.value.properties[property.name]!), range: property.valueRange },
        })),
      })),
      representation: { source, text, sheet } satisfies Representation,
    };
  },
  async applyDocumentOperations(document, operations) {
    const representation = document.representation as Representation;
    if (representation.source !== document.source) throw new Error("Recipe document belongs to a different Source revision");
    const { text, sheet } = representation;
    const recipes = new Map(sheet.recipes.map(recipe => [node(recipe.range.start), recipe]));
    const edits: Edit[] = [], changedFields = new Set<string>();
    const get = (id: string) => {
      const recipe = recipes.get(id);
      if (!recipe) throw new Error(`Unknown Recipe declaration: ${id}`);
      return recipe;
    };
    const position = (container: string, before?: string) => {
      if (container !== root) throw new Error(`Unknown Recipe container: ${container}`);
      return before === undefined ? sheet.bodyRange.end : get(before).range.start;
    };
    for (const operation of operations) {
      switch (operation.kind) {
        case "add-field":
        case "replace-field":
        case "remove-field": {
          const recipe = get(operation.declaration);
          const key = `${operation.declaration}/${operation.name}`;
          if (changedFields.has(key)) throw new Error(`Multiple operations on Recipe field ${operation.name}`);
          changedFields.add(key);
          const property = recipe.properties.find(item => item.name === operation.name);
          if (operation.kind === "add-field") {
            if (property) throw new Error(`Recipe property already exists: ${operation.name}`);
            const end = recipe.range.end - 1;
            edits.push({ start: end, end, text: `\n  ${operation.name}: ${field(operation.name, operation.value)};\n` });
          } else {
            if (!property) throw new Error(`Unknown Recipe property: ${operation.name}`);
            edits.push(operation.kind === "remove-field" ? { ...property.range, text: "" }
              : { ...property.valueRange, text: field(operation.name, operation.value) });
          }
          break;
        }
        case "insert-declaration": {
          const start = position(operation.container, operation.before);
          edits.push({ start, end: start, text: `\n${declaration(operation.declaration)}\n` });
          break;
        }
        case "delete-declaration":
          edits.push({ ...get(operation.declaration).range, text: "" });
          break;
        case "move-declaration": {
          const recipe = get(operation.declaration), start = position(operation.container, operation.before);
          if (operation.before === operation.declaration) break;
          edits.push({ ...recipe.range, text: "" }, { start, end: start, text: `${text.slice(recipe.range.start, recipe.range.end)}\n` });
          break;
        }
        default:
          throw new Error(`Recipe does not support document operation ${operation.kind}`);
      }
    }
    const changed = applyEdits(text, edits);
    parseRecipe(document.source.name, changed);
    return { ...document.source, bytes: new TextEncoder().encode(changed) };
  },
};
