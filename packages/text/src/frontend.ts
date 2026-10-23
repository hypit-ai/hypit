import type { AuthorFrontend, AuthorSourceExport } from "@hypit/author";
import { moduleKey } from "@hypit/protocol";
import type { TypedRecord } from "@hypit/protocol";
import { parseRecipe } from "@hypit/recipe";
import { decodeSourceText } from "@hypit/source";

import { textModuleRef, textTypes } from "./manifest.js";
import { textTemplateFromRecipes } from "./recipe.js";

export const textRecipeFrontendId = "@hypit/text/svs@1";

export const textRecipeFrontend: AuthorFrontend = {
  id: textRecipeFrontendId,
  discover() {
    return { modules: [moduleKey(textModuleRef)], sources: [] };
  },
  decode(source, context) {
    const parsed = parseRecipe(source.name, decodeSourceText(source));
    const recipes = parsed.recipes.map((item) => item.value);
    const candidates = recipes
      .map((recipe) => /^text-template\.([a-z][a-z0-9-]{0,95})$/u.exec(recipe.path)?.[1])
      .filter((id): id is string => id !== undefined);
    if (candidates.length !== 1) throw new Error(`${source.name} must declare exactly one root Recipe text-template.<id>`);
    const id = candidates[0]!;
    const template = textTemplateFromRecipes(recipes, id);
    const record: TypedRecord = {
      id,
      type: textTypes.template,
      value: (template as unknown as import("@hypit/protocol").CanonicalValue),
    };
    const exports: AuthorSourceExport[] = [{ name: id, ref: { kind: "record", id }, type: textTypes.template }];
    return {
      records: [record],
      components: [],
      exports,
    };
  },
};
