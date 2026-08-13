import type { SvsRecipe } from "@narratage/svs";

import { sealTextTemplate } from "./program.js";
import type {
  TextCondition,
  TextExpression,
  TextScalar,
  TextTemplate,
} from "./types.js";

type Choice = {
  readonly id: string;
  readonly text: string;
  readonly conditions: Readonly<Record<string, TextScalar>>;
};

type Block =
  | { readonly kind: "fixed"; readonly id: string; readonly order: number; readonly text: string }
  | { readonly kind: "axis"; readonly id: string; readonly order: number; readonly parameter: string; readonly choices: readonly Choice[] }
  | { readonly kind: "variant"; readonly id: string; readonly order: number; readonly choices: readonly Choice[] }
  | { readonly kind: "slot"; readonly id: string; readonly order: number; readonly slot: string; readonly optional: boolean; readonly label?: string };

function text(recipe: SvsRecipe, name: string, fallback?: string): string {
  const value = recipe.properties[name] ?? fallback;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${recipe.path}.${name} must be non-empty text`);
  return value;
}

function integer(recipe: SvsRecipe, name: string): number {
  const value = recipe.properties[name];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${recipe.path}.${name} must be a non-negative integer`);
  }
  return value;
}

function boolean(recipe: SvsRecipe, name: string, fallback: boolean): boolean {
  const value = recipe.properties[name] ?? fallback;
  if (typeof value !== "boolean") throw new Error(`${recipe.path}.${name} must be boolean`);
  return value;
}

function exactProperties(recipe: SvsRecipe, allowed: ReadonlySet<string>, prefixes: readonly string[] = []): void {
  const unknown = Object.keys(recipe.properties).filter(
    (name) => !allowed.has(name) && !prefixes.some((prefix) => name.startsWith(prefix)),
  );
  if (unknown.length > 0) throw new Error(`${recipe.path} contains unknown property ${unknown[0]}`);
}

function choice(recipe: SvsRecipe, id: string): Choice {
  exactProperties(recipe, new Set(["text"]), ["when-param-", "when-select-"]);
  const conditions: Record<string, TextScalar> = {};
  for (const [name, value] of Object.entries(recipe.properties)) {
    const prefix = name.startsWith("when-param-")
      ? "when-param-"
      : name.startsWith("when-select-") ? "when-select-" : undefined;
    if (prefix === undefined) continue;
    if (typeof value !== "string" && typeof value !== "boolean" && !(typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`${recipe.path}.${name} must be a finite scalar`);
    }
    conditions[name.slice(prefix.length)] = value;
  }
  return { id, text: text(recipe, "text"), conditions };
}

function equalsConditions(values: Readonly<Record<string, TextScalar>>, subject: string): TextCondition {
  const conditions = Object.entries(values).map(([binding, value]) => ({
    kind: "equals" as const,
    binding,
    value,
  }));
  if (conditions.length === 0) throw new Error(`${subject} must declare at least one condition`);
  return conditions.length === 1 ? conditions[0]! : { kind: "all", conditions };
}

function expression(block: Block): TextExpression {
  if (block.kind === "fixed") return { kind: "literal", value: block.text };
  if (block.kind === "axis") {
    return {
      kind: "choice",
      cases: block.choices.map((item) => ({
        when: { kind: "equals", binding: block.parameter, value: item.id },
        value: { kind: "literal", value: item.text },
      })),
    };
  }
  if (block.kind === "variant") {
    return {
      kind: "choice",
      cases: block.choices.map((item) => ({
        when: equalsConditions(item.conditions, `Text Template variant ${block.id}.${item.id}`),
        value: { kind: "literal", value: item.text },
      })),
    };
  }
  const value: TextExpression = block.label === undefined
    ? { kind: "slot", binding: block.slot }
    : {
        kind: "sequence",
        items: [
          { kind: "literal", value: `${block.label}\n` },
          { kind: "slot", binding: block.slot },
        ],
      };
  return block.optional
    ? { kind: "optional", when: { kind: "present", binding: block.slot }, value }
    : value;
}

/**
 * One optional textual convention for authoring a TextTemplate in flat SVS.
 * SVS remains inert data; this Frontend only lowers fixed/axis/variant/slot
 * recipes into the ordinary domain-neutral Text expression language.
 */
export function textTemplateFromSvsRecipes(
  recipes: readonly SvsRecipe[],
  templateId: string,
): TextTemplate {
  const prefix = `text-template.${templateId}`;
  const meta = recipes.find((recipe) => recipe.path === prefix);
  if (meta === undefined) throw new Error(`Missing root Recipe ${prefix}`);
  exactProperties(meta, new Set(["separator"]), ["default-"]);
  if (text(meta, "separator", "paragraph") !== "paragraph") throw new Error(`${prefix}.separator must be paragraph`);
  const defaults: Record<string, TextScalar> = {};
  for (const [name, value] of Object.entries(meta.properties)) {
    if (!name.startsWith("default-")) continue;
    if (typeof value !== "string" && typeof value !== "boolean" && !(typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`${prefix}.${name} must be a finite scalar`);
    }
    defaults[name.slice("default-".length)] = value;
  }
  const blockPrefix = `${prefix}.block.`;
  const choicePrefix = `${prefix}.choice.`;
  const blocks: Block[] = recipes
    .filter((recipe) => recipe.path.startsWith(blockPrefix))
    .map((recipe): Block => {
      const id = recipe.path.slice(blockPrefix.length);
      if (id.includes(".")) throw new Error(`${recipe.path} block id cannot contain '.'`);
      const kind = text(recipe, "kind");
      const order = integer(recipe, "order");
      if (kind === "fixed") {
        exactProperties(recipe, new Set(["kind", "order", "text"]));
        return { kind, id, order, text: text(recipe, "text") };
      }
      if (kind === "axis" || kind === "variant") {
        exactProperties(recipe, new Set(["kind", "order", ...(kind === "axis" ? ["parameter"] : [])]));
        const choices = recipes
          .filter((item) => item.path.startsWith(`${choicePrefix}${id}.`))
          .map((item) => choice(item, item.path.slice(`${choicePrefix}${id}.`.length)));
        if (choices.length === 0) throw new Error(`${recipe.path} has no choices`);
        return kind === "axis"
          ? { kind, id, order, parameter: text(recipe, "parameter"), choices }
          : { kind, id, order, choices };
      }
      if (kind === "slot") {
        exactProperties(recipe, new Set(["kind", "order", "slot", "optional", "label"]));
        const label = recipe.properties.label;
        return {
          kind,
          id,
          order,
          slot: text(recipe, "slot"),
          optional: boolean(recipe, "optional", false),
          ...(label === undefined ? {} : { label: text(recipe, "label") }),
        };
      }
      throw new Error(`${recipe.path}.kind ${kind} is unsupported`);
    })
    .sort((left, right) => left.order - right.order);
  if (new Set(blocks.map((item) => item.id)).size !== blocks.length) throw new Error(`${prefix} repeats a block id`);
  if (new Set(blocks.map((item) => item.order)).size !== blocks.length) throw new Error(`${prefix} repeats a block order`);
  const consumed = new Set([
    meta.path,
    ...blocks.map((item) => `${blockPrefix}${item.id}`),
    ...recipes.filter((recipe) => recipe.path.startsWith(choicePrefix)).map((recipe) => recipe.path),
  ]);
  const stray = recipes.find((recipe) => recipe.path.startsWith(`${prefix}.`) && !consumed.has(recipe.path));
  if (stray !== undefined) throw new Error(`Unrecognized Text Template Recipe ${stray.path}`);
  return sealTextTemplate({
    contract: "svml.text-template@1",
    defaults,
    root: {
      kind: "join",
      separator: "\n\n",
      omitEmpty: true,
      items: blocks.map(expression),
    },
  });
}
