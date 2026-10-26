import type { AuthorFrontend, AuthorSourceExport } from "@hypit/author";
import { moduleKey } from "@hypit/protocol";
import type { TypedRecord } from "@hypit/protocol";
import { decodeSourceText } from "@hypit/source";

import { recipeFrontendId, recipeModuleRef, recipeType } from "./manifest.js";
import { parseRecipe } from "./parser.js";

export const recipeFrontend: AuthorFrontend = {
  id: recipeFrontendId,
  discover() {
    return { modules: [moduleKey(recipeModuleRef)], sources: [] };
  },
  decode(source) {
    const parsed = parseRecipe(source.name, decodeSourceText(source));
    const records: TypedRecord[] = parsed.recipes.map((recipe) => ({
      id: recipe.value.path,
      type: recipeType,
      value: (recipe.value),
    }));
    const exports: AuthorSourceExport[] = records.map((record) => ({
      name: record.id,
      ref: { kind: "record", id: record.id },
      type: record.type,
    }));
    return {
      records,
      components: [],
      exports,
    };
  },
};
