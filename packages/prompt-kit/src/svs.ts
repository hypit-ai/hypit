import type { SvsRecipe } from "@narratage/svs";

import { sealPromptKitSpec } from "./program.js";
import type {
  PromptKitBlockSpec,
  PromptKitChoice,
  PromptKitConditions,
  PromptKitScalar,
  PromptKitSpec,
} from "./types.js";

function text(recipe: SvsRecipe, name: string, fallback?: string): string {
  const value = recipe.properties[name] ?? fallback;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${recipe.path}.${name} must be a non-empty string`);
  }
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

function choice(recipe: SvsRecipe, id: string): PromptKitChoice {
  exactProperties(recipe, new Set(["text"]), ["when-param-", "when-select-"]);
  const conditions: { parameters: Record<string, PromptKitScalar>; selectors: Record<string, string> } = {
    parameters: {},
    selectors: {},
  };
  for (const [name, value] of Object.entries(recipe.properties)) {
    if (name.startsWith("when-param-")) {
      conditions.parameters[name.slice("when-param-".length)] = value as PromptKitScalar;
    }
    if (name.startsWith("when-select-")) {
      if (typeof value !== "string" || value.length === 0) throw new Error(`${recipe.path}.${name} must be a string`);
      conditions.selectors[name.slice("when-select-".length)] = value;
    }
  }
  return { id, text: text(recipe, "text"), when: conditions satisfies PromptKitConditions };
}

/**
 * Decodes a bounded Prompt Kit data convention from ordinary flat SVS Recipes.
 * SVS itself remains a generic named-value language; it does not execute this specification.
 */
export function promptKitSpecFromSvsRecipes(
  recipes: readonly SvsRecipe[],
  kitId: string,
): PromptKitSpec {
  const prefix = `prompt-kit.${kitId}`;
  const meta = recipes.find((recipe) => recipe.path === prefix);
  if (meta === undefined) throw new Error(`Missing ${prefix} metadata Recipe`);
  exactProperties(meta, new Set(["separator"]), ["default-"]);
  if (text(meta, "separator", "paragraph") !== "paragraph") {
    throw new Error(`${prefix}.separator must be paragraph`);
  }
  const defaults: Record<string, PromptKitScalar> = {};
  for (const [name, value] of Object.entries(meta.properties)) {
    if (name.startsWith("default-")) defaults[name.slice("default-".length)] = value as PromptKitScalar;
  }
  const blockPrefix = `${prefix}.block.`;
  const choicePrefix = `${prefix}.choice.`;
  const blocks: PromptKitBlockSpec[] = recipes
    .filter((recipe) => recipe.path.startsWith(blockPrefix))
    .map((recipe): PromptKitBlockSpec => {
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
        const options = recipes
          .filter((item) => item.path.startsWith(`${choicePrefix}${id}.`))
          .map((item) => choice(item, item.path.slice(`${choicePrefix}${id}.`.length)));
        return kind === "axis"
          ? { kind, id, order, parameter: text(recipe, "parameter"), choices: options }
          : { kind, id, order, choices: options };
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
  const consumed = new Set([
    meta.path,
    ...blocks.map((item) => `${blockPrefix}${item.id}`),
    ...recipes.filter((recipe) => recipe.path.startsWith(choicePrefix)).map((recipe) => recipe.path),
  ]);
  const stray = recipes.find((recipe) => recipe.path.startsWith(`${prefix}.`) && !consumed.has(recipe.path));
  if (stray !== undefined) throw new Error(`Unrecognized Prompt Kit Recipe ${stray.path}`);
  return sealPromptKitSpec({
    contract: "svml.prompt-kit-spec@1",
    id: kitId,
    separator: "\n\n",
    defaults,
    blocks,
  });
}
