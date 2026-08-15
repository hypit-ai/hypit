import {
  sealRecord,
} from "@narratage/core";
import type { AuthorFrontend, AuthorSourceExport } from "@narratage/elaborator";

import { svsFrontendId, svsModuleRef, svsRecipeType } from "./manifest.js";
import { parseSvs } from "./parser.js";

export const svsFrontend: AuthorFrontend = {
  id: svsFrontendId,
  discover() {
    return { modules: [`${svsModuleRef.name}@${svsModuleRef.version}`], sources: [] };
  },
  decode(source, context) {
    const parsed = parseSvs(source.name, source.text);
    const records = parsed.recipes.map((recipe) => sealRecord({
      id: recipe.value.path,
      type: svsRecipeType,
      value: { kind: "inline", value: recipe.value },
      origin: { kind: "authored" },
    }));
    const exports: AuthorSourceExport[] = records.map((record) => ({
      name: record.id,
      ref: { kind: "record", id: record.id },
      type: record.type,
    }));
    return {
      records,
      components: [],
      fragments: [],
      exports,
    };
  },
};
